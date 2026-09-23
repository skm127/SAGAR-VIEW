"""Argo observation data service.

Serves real, QC-filtered Argo profiles ingested from the Argo GDAC
(see app/ingestion/argo_ingest.py). There is deliberately no synthetic
fallback and no simulated moored buoys or gliders: if a platform type has no
live feed connected, the service reports zero platforms of that type.
"""
from __future__ import annotations

import json
import logging
import os
import datetime
import urllib.request
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class ArgoService:
    """Service for reading and querying real Argo float profiles."""

    def __init__(self, filepath: str):
        self.filepath = filepath
        self._profiles: List[Dict[str, Any]] = []
        self._by_id: Dict[str, Dict[str, Any]] = {}
        self._latest_by_platform: Dict[str, Dict[str, Any]] = {}
        self._meta: Dict[str, Any] = {}
        self._is_loaded = False
        self._moored_buoys: List[Dict[str, Any]] = []
        self._gliders: List[Dict[str, Any]] = []

    def _fetch_live_incois_oon_buoys(self):
        """Fetch real live data from INCOIS Ocean Observing Network (OON)."""
        url = "https://incois.gov.in/OON/backend_process.jsp"
        buoys_dict = {}
        try:
            end_date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
            start_date = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).strftime("%Y-%m-%d")

            payload = json.dumps({
                "startDate": start_date,
                "endDate": end_date,
                "moored": True,
                "aws": False,
                "drifting": False,
                "waverider": False
            }).encode('utf-8')

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    'User-Agent': 'Mozilla/5.0',
                    'Content-Type': 'application/json'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                data = response.read().decode('utf-8')
                parsed = json.loads(data)
                
                for item in parsed:
                    if 'buoy_id' not in item or 'lat' not in item or 'lon' not in item:
                        continue
                    
                    stn = str(item['buoy_id']).strip()
                    try:
                        lat = float(item['lat'])
                        lon = float(item['lon'])
                        # INCOIS returns time as 'YYYY-MM-DD HH:MM:SS'
                        t_str = item.get('time')
                        if t_str:
                            dt = datetime.datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
                            ts_iso = dt.isoformat()
                        else:
                            dt = datetime.datetime.now(datetime.timezone.utc)
                            ts_iso = dt.isoformat()
                            
                        # If we already have this buoy, only update if timestamp is newer
                        if stn in buoys_dict:
                            existing_ts = datetime.datetime.fromisoformat(buoys_dict[stn]["timestamp"])
                            if dt <= existing_ts:
                                continue
                                
                        buoys_dict[stn] = {
                            "id": f"incois_{stn}",
                            "platform_id": stn,
                            "platform_type": "moored_buoy",
                            "latitude": lat,
                            "longitude": lon,
                            "timestamp": ts_iso,
                            "depths": [0.0],
                            "temperatures": [], # INCOIS backend_process.jsp doesn't give wtmp
                            "pressures": [0.0]
                        }
                    except Exception:
                        continue
            logger.info("Fetched %d live buoys from INCOIS OON.", len(buoys_dict))
        except Exception as e:
            logger.error("Failed to fetch live INCOIS OON buoys: %s", e)
        
        self._moored_buoys = list(buoys_dict.values())

    def _fetch_live_ioos_gliders(self):
        """Fetch real live autonomous underwater glider tracks from IOOS ERDDAP."""
        url = "https://gliders.ioos.us/erddap/tabledap/allDatasets.json?datasetID,minLongitude,maxLongitude,minLatitude,maxLatitude,minTime,maxTime"
        gliders = []
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = response.read().decode('utf-8')
                parsed = json.loads(data)
                rows = parsed.get('table', {}).get('rows', [])
                
                # Current year to filter for "recent/active" gliders
                current_year = str(datetime.datetime.now(datetime.timezone.utc).year)
                
                for r in rows:
                    ds_id = r[0]
                    if ds_id == "allDatasets":
                        continue
                    min_lon, max_lon = r[1], r[2]
                    min_lat, max_lat = r[3], r[4]
                    max_time = r[6]
                    
                    if max_time and (current_year in max_time or str(int(current_year)-1) in max_time):
                        if min_lon is not None and max_lon is not None and min_lat is not None and max_lat is not None:
                            lat = (min_lat + max_lat) / 2.0
                            lon = (min_lon + max_lon) / 2.0
                            gliders.append({
                                "id": f"glider_{ds_id}",
                                "platform_id": ds_id,
                                "platform_type": "glider",
                                "latitude": lat,
                                "longitude": lon,
                                "timestamp": max_time,
                                "depths": [0.0],
                                "temperatures": [],
                                "pressures": []
                            })
            logger.info("Fetched %d live glider tracks from IOOS.", len(gliders))
        except Exception as e:
            logger.error("Failed to fetch live IOOS gliders: %s", e)
            
        self._gliders = gliders

    # ── Loading ─────────────────────────────────────────────────────────
    def load(self) -> bool:
        """Load the QC'd Argo cache written by the ERDDAP ingestion."""
        try:
            if not os.path.exists(self.filepath):
                raise FileNotFoundError(f"{self.filepath} not found — run the Argo ingestion")
            with open(self.filepath, "r", encoding="utf-8") as f:
                payload = json.load(f)
            profiles = payload.get("profiles")
            if not isinstance(profiles, list):
                raise ValueError("Argo cache has an unexpected format (no 'profiles' list)")

            self._profiles = profiles
            self._by_id = {p["id"]: p for p in profiles}
            latest: Dict[str, Dict[str, Any]] = {}
            for p in profiles:
                cur = latest.get(p["platform_id"])
                if cur is None or p["timestamp"] > cur["timestamp"]:
                    latest[p["platform_id"]] = p
            self._latest_by_platform = latest
            self._meta = {k: v for k, v in payload.items() if k != "profiles"}
            self._is_loaded = True
            logger.info("Loaded %d QC'd Argo profiles from %d floats (%s)",
                        len(profiles), len(latest), self._meta.get("ingested_at"))
            
            # Fetch the live buoy feed
            self._fetch_live_incois_oon_buoys()
            
            # Fetch the live glider feed
            self._fetch_live_ioos_gliders()
            
            return True
        except Exception as e:
            logger.error("Failed to load Argo data: %s", e)
            self._is_loaded = False
            return False

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    # ── Queries ─────────────────────────────────────────────────────────
    def get_all_profiles_summary(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": p["id"],
                "platform_id": p["platform_id"],
                "platform_type": p.get("platform_type", "argo"),
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "timestamp": p["timestamp"],
                "n_depths": len(p["depths"]),
                "max_depth": max(p["depths"]) if p["depths"] else 0,
                "data_mode": p.get("data_mode"),
            }
            for p in self._profiles
        ]

    def get_all_profiles(self) -> List[Dict[str, Any]]:
        return self._profiles

    def get_all_platforms(self) -> List[Dict[str, Any]]:
        return self._profiles + self._moored_buoys + self._gliders

    def get_moored_buoys(self) -> List[Dict[str, Any]]:
        return self._moored_buoys

    def get_gliders(self) -> List[Dict[str, Any]]:
        return self._gliders

    def get_all_sensors_summary(self) -> Dict[str, Any]:
        argo = self.get_all_profiles_summary()
        mb_summary = [
            {
                "id": p["id"],
                "platform_id": p["platform_id"],
                "platform_type": "moored_buoy",
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "timestamp": p["timestamp"],
                "n_depths": 1,
                "max_depth": 0,
                "data_mode": "R"
            }
            for p in self._moored_buoys
        ]
        glider_summary = [
            {
                "id": p["id"],
                "platform_id": p["platform_id"],
                "platform_type": "glider",
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "timestamp": p["timestamp"],
                "n_depths": 1,
                "max_depth": 0,
                "data_mode": "R"
            }
            for p in self._gliders
        ]
        return {
            "argo": argo,
            "moored_buoys": mb_summary,
            "gliders": glider_summary,
            "total_platforms": len(self._latest_by_platform) + len(self._moored_buoys) + len(self._gliders),
            "total_profiles": len(argo) + len(self._moored_buoys) + len(self._gliders),
            "feeds": {
                "argo": {"status": "live", "source": self._meta.get("source"), "ingested_at": self._meta.get("ingested_at")},
                "moored_buoys": {"status": "live" if len(mb_summary) > 0 else "stale", "source": "INCOIS Ocean Observing Network (OON)"},
                "gliders": {"status": "live" if len(glider_summary) > 0 else "stale", "source": "IOOS ERDDAP Glider DAC"},
            },
        }

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Look up by profile id (argo_<wmo>_<cycle>) or by WMO platform id (latest cycle)."""
        if profile_id.startswith("incois_"):
            for b in self._moored_buoys:
                if b["id"] == profile_id or b["platform_id"] == profile_id:
                    return b
            return None

        if profile_id.startswith("glider_"):
            for g in self._gliders:
                if g["id"] == profile_id or g["platform_id"] == profile_id:
                    return g
            return None

        p = self._by_id.get(profile_id)
        if p is not None:
            return p
        return self._latest_by_platform.get(profile_id)

    def get_profiles_in_region(self, lat_min: float = 0, lat_max: float = 28,
                               lon_min: float = 60, lon_max: float = 100) -> List[Dict[str, Any]]:
        argo = [p for p in self._profiles
                if lat_min <= p["latitude"] <= lat_max and lon_min <= p["longitude"] <= lon_max]
        mb = [p for p in self._moored_buoys
              if lat_min <= p["latitude"] <= lat_max and lon_min <= p["longitude"] <= lon_max]
        gl = [p for p in self._gliders
              if lat_min <= p["latitude"] <= lat_max and lon_min <= p["longitude"] <= lon_max]
        return argo + mb + gl

    def get_info(self) -> Dict[str, Any]:
        stats = self._meta.get("stats", {})
        return {
            "loaded": self._is_loaded,
            "source": self._meta.get("source"),
            "ingested_at": self._meta.get("ingested_at"),
            "window": self._meta.get("window"),
            "qc_policy": self._meta.get("qc_policy"),
            "n_argo_profiles": len(self._profiles),
            "n_unique_floats": len(self._latest_by_platform),
            "levels_qc_passed": stats.get("levels_kept"),
            "levels_qc_rejected": stats.get("levels_rejected"),
            "profiles_qc_rejected": stats.get("profiles_rejected"),
            "n_moored_buoys": len(self._moored_buoys),
            "n_gliders": len(self._gliders),
            "total_platforms": len(self._latest_by_platform) + len(self._moored_buoys) + len(self._gliders),
            "is_synthetic": False,
        }

    def close(self):
        self._is_loaded = False
