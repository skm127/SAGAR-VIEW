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

    def _fetch_live_ndbc_buoys(self):
        """Fetch real live data from NOAA NDBC (Joint INCOIS/NOAA OMNI/RAMA feed)."""
        url = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"
        buoys = []
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = response.read().decode('utf-8')
                
            lines = data.strip().split('\n')
            if len(lines) > 2:
                for line in lines[2:]:
                    parts = line.split()
                    if len(parts) < 19:
                        continue
                    try:
                        stn = parts[0]
                        lat = float(parts[1])
                        lon = float(parts[2])
                        wtmp_str = parts[18] # WTMP
                        
                        # Filter for Indian Ocean (lat -30 to +30, lon 40 to 110 approx)
                        if -30 <= lat <= 30 and 40 <= lon <= 110:
                            wtmp = float(wtmp_str) if wtmp_str != 'MM' else float('nan')
                            year = int(parts[3])
                            month = int(parts[4])
                            day = int(parts[5])
                            hour = int(parts[6])
                            minute = int(parts[7])
                            ts_iso = datetime.datetime(year, month, day, hour, minute, tzinfo=datetime.timezone.utc).isoformat()
                            
                            buoy = {
                                "id": f"ndbc_{stn}",
                                "platform_id": stn,
                                "platform_type": "moored_buoy",
                                "latitude": lat,
                                "longitude": lon,
                                "timestamp": ts_iso,
                                "depths": [0.0],
                                "temperatures": [wtmp] if not __import__("math").isnan(wtmp) else [],
                                "pressures": [0.0]
                            }
                            buoys.append(buoy)
                    except Exception:
                        continue
            logger.info("Fetched %d live RAMA/OMNI buoys from NDBC.", len(buoys))
        except Exception as e:
            logger.error("Failed to fetch live NDBC buoys: %s", e)
        
        self._moored_buoys = buoys

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
            self._fetch_live_ndbc_buoys()
            
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
        return self._profiles + self._moored_buoys

    def get_moored_buoys(self) -> List[Dict[str, Any]]:
        return self._moored_buoys

    def get_gliders(self) -> List[Dict[str, Any]]:
        return []

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
        return {
            "argo": argo,
            "moored_buoys": mb_summary,
            "gliders": [],
            "total_platforms": len(self._latest_by_platform) + len(self._moored_buoys),
            "total_profiles": len(argo) + len(self._moored_buoys),
            "feeds": {
                "argo": {"status": "live", "source": self._meta.get("source"), "ingested_at": self._meta.get("ingested_at")},
                "moored_buoys": {"status": "live", "source": "NOAA NDBC / INCOIS Joint Portal"},
                "gliders": {"status": "not_connected", "reason": "No public glider feed for this domain"},
            },
        }

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Look up by profile id (argo_<wmo>_<cycle>) or by WMO platform id (latest cycle)."""
        if profile_id.startswith("ndbc_"):
            for b in self._moored_buoys:
                if b["id"] == profile_id or b["platform_id"] == profile_id:
                    return b
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
        return argo + mb

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
            "n_gliders": 0,
            "total_platforms": len(self._latest_by_platform) + len(self._moored_buoys),
            "is_synthetic": False,
        }

    def close(self):
        self._is_loaded = False
