"""Cyclone intelligence: live GDACS feed, IBTrACS history, backtests and a
live rapid-intensification watch.

* Live storms come from the GDACS event API (JRC / UN OCHA), including the
  observed and forecast track geometry. Nothing is simulated: if GDACS is
  unreachable the API says so.
* History comes from IBTrACS v04r01 (built by scripts/build_cyclone_cases.py).
* The live RI watch runs exactly the method validated in the backtests
  (app/services/backtest_engine.py) on the active storm's corridor, and adds
  model TCHP sampled along the forecast track from the live ocean model.
"""
from __future__ import annotations

import glob
import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

import httpx
import numpy as np

from app.services.ocean_physics import upper_ocean_metrics, TCHP_RI_THRESHOLD

logger = logging.getLogger(__name__)

RES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "resources", "cyclones")
GDACS_LIST = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
GDACS_GEOM = "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry"
NIO_BOX = {"lat_min": -5.0, "lat_max": 30.0, "lon_min": 40.0, "lon_max": 100.0}
KMH_PER_KT = 1.852


def _in_nio(lat: float, lon: float) -> bool:
    return NIO_BOX["lat_min"] <= lat <= NIO_BOX["lat_max"] and NIO_BOX["lon_min"] <= lon <= NIO_BOX["lon_max"]


class CycloneService:
    def __init__(self, cache_dir: str):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        self._gdacs_cache: Optional[Dict[str, Any]] = None
        self._gdacs_cached_at = 0.0
        self._tracks: Optional[Dict[str, Any]] = None
        self._watch_jobs: Dict[str, str] = {}
        self._lock = threading.Lock()

    # ── IBTrACS history & backtests ─────────────────────────────────────
    def historical_tracks(self, since: int = 2015) -> Dict[str, Any]:
        if self._tracks is None:
            path = os.path.join(RES_DIR, "ibtracs_ni_tracks.json")
            if not os.path.exists(path):
                return {"status": "missing", "message": "Run scripts/build_cyclone_cases.py", "storms": []}
            with open(path, encoding="utf-8") as f:
                self._tracks = json.load(f)
        storms = [s for s in self._tracks["storms"] if s["season"] >= since]
        return {**{k: v for k, v in self._tracks.items() if k != "storms"}, "status": "ok",
                "n_storms": len(storms), "n_with_ri": sum(1 for s in storms if s.get("ri")), "storms": storms}

    def list_backtests(self) -> List[Dict[str, Any]]:
        out = []
        for path in sorted(glob.glob(os.path.join(RES_DIR, "backtest_*.json"))):
            with open(path, encoding="utf-8") as f:
                r = json.load(f)
            out.append({
                "key": os.path.basename(path)[len("backtest_"):-5],
                "name": r["storm"]["name"], "season": r["storm"]["season"], "subbasin": r["storm"].get("subbasin"),
                "status": r["status"], "peak_wind_kt": r.get("peak_wind_kt"),
                "ri_onset": (r.get("ri") or {}).get("onset_time"),
                "ml_lead_time_hours": (r.get("events") or {}).get("ml_lead_time_hours_before_ri"),
                "significant_lead_time_hours": (r.get("events") or {}).get("significant_lead_time_hours_before_ri"),
                "flag_rate": (r.get("storm_year") or {}).get("flag_rate"),
                "p_value": (r.get("storm_year") or {}).get("binomial_p_value_vs_climatology"),
                "tchp_anomaly_vs_clim": (r.get("storm_year") or {}).get("tchp_anomaly_vs_clim"),
                "threshold_lead_time_hours": (r.get("events") or {}).get("threshold_lead_time_hours_before_ri"),
                "false_alarm_rate": (r.get("false_alarm") or {}).get("weighted_flag_rate"),
                "pct_clim_above_threshold": (r.get("climatology") or {}).get("pct_profiles_above_threshold"),
                "n_pre_storm_profiles": r["counts"]["storm_year_profiles_pre_storm_in_corridor"],
                "n_climatology_profiles": r["counts"]["climatology_profiles"],
                "headline": (r.get("verdict") or {}).get("headline"),
                "summary": (r.get("verdict") or {}).get("summary") or r.get("message"),
            })
        return out

    def get_backtest(self, key: str) -> Optional[Dict[str, Any]]:
        safe = "".join(c for c in key if c.isalnum() or c == "_")
        path = os.path.join(RES_DIR, f"backtest_{safe}.json")
        if not os.path.exists(path):
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    # ── GDACS live feed ─────────────────────────────────────────────────
    def active_storms(self, max_age_s: int = 1800) -> Dict[str, Any]:
        if self._gdacs_cache and time.time() - self._gdacs_cached_at < max_age_s:
            return self._gdacs_cache
        now = datetime.now(timezone.utc)
        try:
            r = httpx.get(GDACS_LIST, params={
                "eventlist": "TC", "alertlevel": "Green;Orange;Red",
                "fromdate": (now - timedelta(days=21)).strftime("%Y-%m-%d"), "todate": now.strftime("%Y-%m-%d"),
            }, timeout=30)
            r.raise_for_status()
            feats = r.json().get("features", [])
        except Exception as e:
            logger.warning("GDACS unreachable: %s", e)
            return {"status": "unavailable", "error": str(e), "checked_at": now.isoformat(), "storms": []}

        storms = []
        for f in feats:
            p = f.get("properties", {})
            current = str(p.get("iscurrent", "")).lower() == "true"
            try:
                ended = datetime.fromisoformat(p["todate"]).replace(tzinfo=timezone.utc)
            except Exception:
                ended = now
            if not current and (now - ended).days > 3:
                continue
            lon, lat = (f.get("geometry") or {}).get("coordinates", [None, None])[:2]
            storm = {
                "event_id": p.get("eventid"), "episode_id": p.get("episodeid"),
                "name": p.get("eventname"), "alert_level": p.get("alertlevel"),
                "is_current": current, "from": p.get("fromdate"), "to": p.get("todate"),
                "lat": lat, "lon": lon, "source": p.get("source"),
                "max_wind_kmh": (p.get("severitydata") or {}).get("severity"),
                "severity_text": (p.get("severitydata") or {}).get("severitytext"),
                "countries": p.get("country"),
                "report_url": (p.get("url") or {}).get("report"),
            }
            if storm["max_wind_kmh"]:
                storm["max_wind_kt"] = round(storm["max_wind_kmh"] / KMH_PER_KT)
            storm["track"] = self._gdacs_track(storm["event_id"], storm["episode_id"], p.get("fromdate"), now)
            pts = storm["track"] or ([{"lat": lat, "lon": lon}] if lat is not None else [])
            storm["in_north_indian_ocean"] = any(_in_nio(q["lat"], q["lon"]) for q in pts)
            storms.append(storm)

        nio = [s for s in storms if s["in_north_indian_ocean"]]
        out = {
            "status": "ok", "source": "GDACS (Global Disaster Alert and Coordination System, EC-JRC/UN)",
            "checked_at": now.isoformat(), "n_active_global": sum(1 for s in storms if s["is_current"]),
            "n_north_indian_ocean": len(nio), "storms": storms,
        }
        self._gdacs_cache, self._gdacs_cached_at = out, time.time()
        return out

    def _gdacs_track(self, event_id, episode_id, fromdate: Optional[str], now: datetime) -> List[Dict[str, Any]]:
        try:
            r = httpx.get(GDACS_GEOM, params={"eventtype": "TC", "eventid": event_id, "episodeid": episode_id}, timeout=30)
            r.raise_for_status()
            feats = r.json().get("features", [])
        except Exception as e:
            logger.info("GDACS geometry for %s unavailable: %s", event_id, e)
            return []
        year = int((fromdate or now.isoformat())[:4])
        pts = []
        for f in feats:
            pr = f.get("properties", {})
            if not str(pr.get("Class", "")).startswith("Point_Polygon_Point_"):
                continue
            ring = (f.get("geometry") or {}).get("coordinates", [[]])[0]
            if not ring:
                continue
            arr = np.asarray(ring, dtype=float)
            lon_c, lat_c = float(arr[:, 0].mean()), float(arr[:, 1].mean())
            label = str(pr.get("polygonlabel", ""))  # "18/08 12:00 UTC"
            try:
                dm, hm = label.split()[:2]
                d, m = map(int, dm.split("/"))
                hh, mm = map(int, hm.split(":"))
                t = datetime(year, m, d, hh, mm, tzinfo=timezone.utc)
                if fromdate and t < datetime.fromisoformat(fromdate).replace(tzinfo=timezone.utc) - timedelta(days=200):
                    t = t.replace(year=year + 1)
            except Exception:
                continue
            idx = int(str(pr["Class"]).rsplit("_", 1)[-1])
            pts.append({"idx": idx, "time": t.isoformat().replace("+00:00", "Z"), "lat": round(lat_c, 2),
                        "lon": round(lon_c, 2), "forecast": t > now})
        pts.sort(key=lambda q: q["idx"])
        for q in pts:
            q.pop("idx", None)
        return pts

    # ── Live RI watch ───────────────────────────────────────────────────
    def tchp_along_track(self, nc_service, track: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sample live-model TCHP at each (forecast) track point at the nearest model step."""
        if not nc_service.is_loaded or not track:
            return []
        import pandas as pd
        tname = nc_service._find_coord("time", "t")
        times = pd.DatetimeIndex(nc_service.dataset[tname].values)
        out = []
        for q in track:
            if not (0.0 <= q["lat"] <= 28.0 and 60.0 <= q["lon"] <= 100.0):
                continue
            t = pd.Timestamp(q["time"]).tz_convert(None)
            ti = int(np.argmin(np.abs((times - t).total_seconds().values)))
            gap_h = abs((times[ti] - t).total_seconds()) / 3600.0
            depths, vals = nc_service.get_depth_profile("thetao", q["lat"], q["lon"], ti)
            pairs = [(d, v) for d, v in zip(depths, vals) if v is not None]
            if len(pairs) < 3:
                continue  # over land
            m = upper_ocean_metrics([a for a, _ in pairs], [b for _, b in pairs])
            out.append({**q, "model_time": times[ti].isoformat() + "Z", "model_time_gap_hours": round(gap_h, 1),
                        "tchp": m["tchp"], "d26": m["d26"], "sst": m["sst"],
                        "ri_supportive": m["tchp"] is not None and m["tchp"] >= TCHP_RI_THRESHOLD})
        return out

    def live_watch(self, event_id: int, nc_service) -> Dict[str, Any]:
        feed = self.active_storms()
        storm = next((s for s in feed.get("storms", []) if str(s["event_id"]) == str(event_id)), None)
        if storm is None:
            return {"status": "not_found", "message": f"GDACS event {event_id} is not active in the last 21 days"}
        along = self.tchp_along_track(nc_service, storm.get("track") or [])
        key = f"{storm['event_id']}_{storm['episode_id']}"
        cache_path = os.path.join(self.cache_dir, f"livewatch_{key}.json")
        base = {"storm": {k: v for k, v in storm.items() if k != "track"}, "track": storm.get("track"),
                "tchp_along_track": along, "model_source": nc_service.source_name,
                "max_tchp_ahead": max((a["tchp"] for a in along if a.get("forecast") and a["tchp"] is not None), default=None)}
        if os.path.exists(cache_path):
            with open(cache_path, encoding="utf-8") as f:
                return {**base, "status": "ok", "ocean_anomaly": json.load(f)}
        with self._lock:
            if self._watch_jobs.get(key) != "running":
                self._watch_jobs[key] = "running"
                threading.Thread(target=self._run_watch_job, args=(storm, key, cache_path), daemon=True).start()
        return {**base, "status": "computing",
                "message": "Running Argo climatology anomaly analysis for this storm's corridor (≈1 min)."}

    def _run_watch_job(self, storm: Dict[str, Any], key: str, cache_path: str):
        from app.services.backtest_engine import run_backtest
        try:
            track = storm.get("track") or [{"time": storm["from"] + "Z", "lat": storm["lat"], "lon": storm["lon"]}]
            # Live storms have no per-fix winds in GDACS: use the whole observed +
            # forecast track as the corridor and stop the window at "now".
            live_track = [{**q, "wind_kt": 1.0 if i == len(track) - 1 else 0.0} for i, q in enumerate(track)]
            res = run_backtest({"name": storm["name"], "season": int(str(storm["from"])[:4]), "sid": str(storm["event_id"]),
                                "track": live_track}, now=datetime.now(timezone.utc), live=True)
            res.pop("track", None)
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(res, f, default=str)
            self._watch_jobs[key] = "done"
        except Exception as e:
            logger.exception("Live RI watch failed for %s", key)
            self._watch_jobs[key] = f"error: {e}"
