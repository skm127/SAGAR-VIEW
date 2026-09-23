"""Auto-generated regional ocean advisories.

Each advisory is a sentence assembled from computed evidence (live-model TCHP
and its trend, GDACS storms, Argo-verified model skill and the fleet anomaly
scan), and carries that evidence so the UI can show *why* it was issued.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import numpy as np

from app.services.ocean_physics import TCHP_FACTOR, TCHP_RI_THRESHOLD

BASINS = {
    "Bay of Bengal": {"lat_min": 5.0, "lat_max": 23.0, "lon_min": 80.0, "lon_max": 95.0},
    "Arabian Sea": {"lat_min": 5.0, "lat_max": 25.0, "lon_min": 60.0, "lon_max": 77.0},
}


def tchp_grid(nc_service, time_index: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Vectorised TCHP (kJ/cm²) on the model grid for one time step."""
    ds = nc_service.dataset
    lat_n, lon_n = nc_service._find_coord("lat", "latitude"), nc_service._find_coord("lon", "longitude")
    dep_n, t_n = nc_service._find_coord("depth", "lev"), nc_service._find_coord("time", "t")
    sub = ds["thetao"].isel({t_n: time_index}).sortby([lat_n, lon_n])
    T = np.asarray(sub.values, dtype=np.float64)          # (K, H, W)
    z = np.asarray(sub[dep_n].values, dtype=np.float64)
    excess = np.clip(T - 26.0, 0.0, None)
    # Trapezoid of (T-26)+ with exact partial layer at the 26 °C crossing
    top, bot = excess[:-1], excess[1:]
    dz = np.diff(z)[:, None, None]
    full = (T[:-1] >= 26.0) & (T[1:] >= 26.0)
    cross = (T[:-1] >= 26.0) & (T[1:] < 26.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        frac = np.where(cross, (T[:-1] - 26.0) / np.maximum(T[:-1] - T[1:], 1e-6), 0.0)
    layer = np.where(full, 0.5 * (top + bot) * dz, 0.0) + np.where(cross, 0.5 * top * frac * dz, 0.0)
    tchp = np.nansum(np.nan_to_num(layer), axis=0) * TCHP_FACTOR
    land = ~np.isfinite(T[0])
    tchp[land] = np.nan
    return tchp, sub[lat_n].values, sub[lon_n].values


def _basin_stats(tchp, lats, lons, box) -> Optional[Dict[str, Any]]:
    li = (lats >= box["lat_min"]) & (lats <= box["lat_max"])
    lj = (lons >= box["lon_min"]) & (lons <= box["lon_max"])
    sub = tchp[np.ix_(li, lj)]
    ocean = np.isfinite(sub)
    if ocean.sum() == 0:
        return None
    vals = sub[ocean]
    r, c = np.unravel_index(np.nanargmax(sub), sub.shape)
    hot = sub >= np.nanpercentile(vals, 90)
    hot_rows = np.where(hot.any(axis=1))[0]
    lat_sub = lats[li]
    return {
        "mean": float(np.mean(vals)), "max": float(np.max(vals)),
        "pct_ri_supportive": float(np.mean(vals >= TCHP_RI_THRESHOLD) * 100.0),
        "max_lat": float(lat_sub[r]), "max_lon": float(lons[lj][c]),
        "hot_lat_range": [float(lat_sub[hot_rows.min()]), float(lat_sub[hot_rows.max()])] if len(hot_rows) else None,
    }


def build_advisories(nc_service, cyclone_feed: Optional[Dict[str, Any]], skill: Optional[Dict[str, Any]],
                     anomaly_summary: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    out: List[Dict[str, Any]] = []
    roles = nc_service.get_time_roles()
    analysis_idx = [i for i, r in enumerate(roles) if r == "analysis"] or list(range(len(roles)))
    latest, earliest = analysis_idx[-1], analysis_idx[0]
    import pandas as pd
    t_name = nc_service._find_coord("time", "t")
    times = pd.DatetimeIndex(nc_service.dataset[t_name].values)
    span_days = max(1, round((times[latest] - times[earliest]).total_seconds() / 86400))

    tchp_now, lats, lons = tchp_grid(nc_service, latest)
    tchp_then, _, _ = tchp_grid(nc_service, earliest)

    # 1) Active storms (GDACS) in the North Indian Ocean
    for s in (cyclone_feed or {}).get("storms", []):
        if not (s.get("is_current") and s.get("in_north_indian_ocean")):
            continue
        out.append({
            "level": "warning", "kind": "active_cyclone",
            "title": f"Active cyclone {s['name']}",
            "message": f"{s['name']} is active ({s.get('severity_text') or 'intensity n/a'}); GDACS alert {s.get('alert_level')}. "
                       f"Open Cyclone Intelligence for TCHP along its forecast track.",
            "region": {"lat": s.get("lat"), "lon": s.get("lon")},
            "evidence": {"source": "GDACS", "event_id": s.get("event_id"), "max_wind_kt": s.get("max_wind_kt")},
        })

    # 2) Basin ocean-heat advisories with trend
    for basin, box in BASINS.items():
        a = _basin_stats(tchp_now, lats, lons, box)
        b = _basin_stats(tchp_then, lats, lons, box)
        if a is None:
            continue
        trend = a["mean"] - b["mean"] if b else 0.0
        trend_word = "rising" if trend > 1.0 else "falling" if trend < -1.0 else "steady"
        level = "watch" if a["pct_ri_supportive"] >= 50 and a["max"] >= 80 else "info"
        band = ""
        if a["hot_lat_range"]:
            band = f", warmest {a['hot_lat_range'][0]:.0f}–{a['hot_lat_range'][1]:.0f}°N"
        out.append({
            "level": level, "kind": "ocean_heat",
            "title": f"{basin}: {'elevated' if level == 'watch' else 'moderate'} cyclone-support ocean heat",
            "message": (f"{basin}{band}: TCHP up to {a['max']:.0f} kJ/cm² at {a['max_lat']:.1f}°N {a['max_lon']:.1f}°E; "
                        f"{a['pct_ri_supportive']:.0f}% of the basin ≥ {TCHP_RI_THRESHOLD:.0f} kJ/cm² "
                        f"(RI-supportive), basin mean {a['mean']:.0f} kJ/cm², {trend_word} ({trend:+.1f} over {span_days} d)."),
            "region": box,
            "evidence": {"tchp_max": round(a["max"], 1), "tchp_mean": round(a["mean"], 1),
                         "pct_ri_supportive": round(a["pct_ri_supportive"], 1), "trend_kj_cm2": round(trend, 1),
                         "valid_time": times[latest].isoformat() + "Z", "model_source": nc_service.source_name},
        })

    # 3) Model trust caveat from measured skill
    if skill and skill.get("bands"):
        worst = max((b for b in skill["bands"] if b.get("rmse") is not None), key=lambda b: b["rmse"], default=None)
        if worst and worst["verdict"] == "poor":
            out.append({
                "level": "info", "kind": "model_trust",
                "title": "Model thermocline uncertainty",
                "message": (f"Against {skill['n_profiles_colocated']} co-located Argo profiles the model's error peaks in "
                            f"{worst['band']} (RMSE {worst['rmse']} °C, bias {worst['bias']:+.2f} °C). "
                            f"D26 and TCHP inherit this uncertainty."),
                "evidence": {"band": worst, "n_profiles": skill["n_profiles_colocated"]},
            })

    # 4) In-situ anomalies
    if anomaly_summary and anomaly_summary.get("critical_count"):
        top = anomaly_summary.get("highest_anomaly_float") or {}
        out.append({
            "level": "watch", "kind": "insitu_anomaly",
            "title": f"{anomaly_summary['critical_count']} Argo profiles diverge strongly from the model",
            "message": (f"Largest: float {top.get('platform_id')} at {top.get('latitude', 0):.1f}°N {top.get('longitude', 0):.1f}°E, "
                        f"{top.get('max_delta', 0):+.2f} °C at {top.get('max_depth', 0):.0f} m."),
            "region": {"lat": top.get("latitude"), "lon": top.get("longitude")},
            "evidence": {"critical": anomaly_summary["critical_count"], "warning": anomaly_summary.get("warning_count")},
        })

    rank = {"warning": 0, "watch": 1, "info": 2}
    out.sort(key=lambda a: rank.get(a["level"], 3))
    return {"generated_at": now.isoformat(), "valid_time": times[latest].isoformat() + "Z",
            "model_source": nc_service.source_name, "advisories": out}
