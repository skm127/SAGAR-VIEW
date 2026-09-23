"""Cyclone intelligence, model-trust and advisory endpoints."""
from __future__ import annotations

from typing import Literal

import numpy as np
from fastapi import APIRouter, Request, HTTPException, Query

router = APIRouter(tags=["Cyclone Intelligence & Model Trust"])


def _require_data(request: Request, argo: bool = True):
    st = request.app.state
    if not st.nc_service.is_loaded:
        raise HTTPException(503, "Model data not loaded yet (live refresh may still be running)")
    if argo and not st.argo_service.is_loaded:
        raise HTTPException(503, "Argo data not loaded yet (live refresh may still be running)")


def _cached(request: Request, key: str, ttl: int, fn):
    cache = request.app.state.cache_service
    val = cache.get(key)
    if val is None:
        val = fn()
        cache.set(key, val, ttl_seconds=ttl)
    return val


# ── Cyclones ──────────────────────────────────────────────────────────────
@router.get("/api/cyclones/active")
def cyclones_active(request: Request):
    """Active / recent tropical cyclones from GDACS with observed + forecast tracks."""
    return request.app.state.cyclone_service.active_storms()


@router.get("/api/cyclones/history")
def cyclones_history(request: Request, since: int = Query(default=2015, ge=1980, le=2100)):
    """IBTrACS North Indian best tracks with rapid-intensification (RI) detection."""
    return request.app.state.cyclone_service.historical_tracks(since)


@router.get("/api/cyclones/backtests")
def cyclones_backtests(request: Request):
    """Summary of every pre-computed Argo-only RI backtest (real data)."""
    items = request.app.state.cyclone_service.list_backtests()
    ok = [b for b in items if b["status"] == "ok"]
    with_ri = [b for b in ok if b["ri_onset"]]
    hits = [b for b in with_ri if (b.get("significant_lead_time_hours") or 0) > 0]
    return {
        "backtests": items,
        "scorecard": {
            "storms_evaluated": len(ok),
            "storms_with_ri": len(with_ri),
            "significant_early_signals": len(hits),
            "median_significant_lead_hours": float(np.median([b["significant_lead_time_hours"] for b in hits])) if hits else None,
            "mean_false_alarm_rate": round(float(np.mean([b["false_alarm_rate"] for b in ok if b["false_alarm_rate"] is not None])), 3)
            if ok else None,
            "mean_pct_clim_above_50": round(float(np.mean([b["pct_clim_above_threshold"] for b in ok])), 1) if ok else None,
        },
    }


@router.get("/api/cyclones/backtests/{key}")
def cyclone_backtest(key: str, request: Request):
    res = request.app.state.cyclone_service.get_backtest(key)
    if res is None:
        raise HTTPException(404, f"No backtest named {key}")
    return res


@router.get("/api/cyclones/live-watch/{event_id}")
def cyclone_live_watch(event_id: int, request: Request):
    """Live RI watch for an active GDACS storm (model TCHP along track + Argo anomaly)."""
    _require_data(request, argo=False)
    return request.app.state.cyclone_service.live_watch(event_id, request.app.state.nc_service)


# ── Model trust ───────────────────────────────────────────────────────────
@router.get("/api/skill/depth-bands")
def skill_depth_bands(request: Request, variable: Literal["thetao", "so"] = "thetao"):
    """Model-vs-Argo bias/RMSE per depth band (temporal + spatial co-location)."""
    _require_data(request)
    from app.services.model_skill_service import depth_band_skill
    st = request.app.state
    return _cached(request, f"skill:{variable}", 1800, lambda: depth_band_skill(st.argo_service, st.nc_service, variable))


@router.get("/api/skill/confidence")
def skill_confidence(request: Request):
    """Spatial model-confidence field from Argo verification density and local error."""
    _require_data(request)
    from app.services.model_skill_service import confidence_field
    st = request.app.state
    return _cached(request, "confidence_field", 1800, lambda: confidence_field(st.argo_service, st.nc_service))


@router.get("/api/skill/confidence/point")
def skill_confidence_point(request: Request, lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    conf = skill_confidence(request)
    m = conf["metadata"]
    if not (m["lat_min"] <= lat <= m["lat_max"] and m["lon_min"] <= lon <= m["lon_max"]):
        raise HTTPException(404, "Outside the model domain")
    i = int(round((lat - m["lat_min"]) / (m["lat_max"] - m["lat_min"]) * (m["height"] - 1)))
    j = int(round((lon - m["lon_min"]) / (m["lon_max"] - m["lon_min"]) * (m["width"] - 1)))
    c = conf["confidence"][i][j]
    if c is None:
        raise HTTPException(404, "Land cell")
    cov = conf["coverage"][i][j]
    near = sorted(conf["verifying_points"], key=lambda p: (p["lat"] - lat) ** 2 + ((p["lon"] - lon) * np.cos(np.radians(lat))) ** 2)[:3]
    return {"lat": lat, "lon": lon, "confidence": c, "coverage": cov, "local_rmse_0_200m": conf["local_rmse"][i][j],
            "label": "unverified" if cov < 0.2 else "high" if c >= 0.7 else "moderate" if c >= 0.45 else "low",
            "nearest_verifying_floats": near}


# ── Advisories & provenance ──────────────────────────────────────────────
@router.get("/api/advisories")
def advisories(request: Request):
    """Auto-generated regional advisories from live TCHP, GDACS, model skill and anomalies."""
    _require_data(request, argo=False)
    from app.services.advisory_service import build_advisories
    from app.services.model_skill_service import depth_band_skill
    st = request.app.state

    def build():
        feed = st.cyclone_service.active_storms()
        skill = None
        anomaly = None
        if st.argo_service.is_loaded:
            skill = _cached(request, "skill:thetao", 1800, lambda: depth_band_skill(st.argo_service, st.nc_service, "thetao"))
            anomaly = st.cache_service.get("anomaly:summary")
            if anomaly is None:
                anomaly = st.anomaly_service.get_fleet_summary(st.argo_service, st.nc_service)
                st.cache_service.set("anomaly:summary", anomaly, ttl_seconds=300)
        return build_advisories(st.nc_service, feed, skill, anomaly)
    return _cached(request, "advisories", 900, build)


@router.get("/api/data/status")
def data_status(request: Request):
    """Exact provenance and counts for every data feed (drives the UI provenance panel)."""
    from app.ingestion.pipeline import last_refresh
    st = request.app.state
    nc, argo, an = st.nc_service, st.argo_service, st.anomaly_service
    return {
        "model": nc.get_info() if nc.is_loaded else {"loaded": False},
        "argo": argo.get_info(),
        "anomaly_model": {"training_source": an.training_source, "n_training_profiles": an.n_training,
                          "trained_at": an.trained_at},
        "moored_buoys": {"status": "not_connected", "reason": "No live RAMA/OMNI feed is publicly available (PMEL RAMA ends Feb 2026)."},
        "gliders": {"status": "not_connected", "reason": "No public glider feed for this domain."},
        "cyclones": {"live": "GDACS event API", "history": "IBTrACS v04r01"},
        "last_refresh": dict(last_refresh) or None,
    }
