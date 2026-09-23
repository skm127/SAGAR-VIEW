"""
API Router for Anomaly Intelligence (Phase 6).
Provides statistical divergence and ML-based anomaly scoring for in-situ observations.
"""
from fastapi import APIRouter, Request, HTTPException, Query
from typing import Optional
import numpy as np

from ..models.schemas import AnomalyFleetSummary, AnomalyAnalysisResponse

router = APIRouter(prefix="/api/anomaly", tags=["Anomaly Intelligence"])


@router.get("/summary", response_model=AnomalyFleetSummary)
def get_anomaly_summary(request: Request):
    """Get anomaly intelligence summary across all active in-situ floats in the region."""
    anomaly_service = request.app.state.anomaly_service
    argo_service = request.app.state.argo_service
    nc_service = request.app.state.nc_service

    cache_key = "anomaly:summary"
    cache_service = getattr(request.app.state, "cache_service", None)
    
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    if not argo_service.is_loaded or not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Required datasets not loaded")

    try:
        result = anomaly_service.get_fleet_summary(argo_service, nc_service)
        if cache_service:
            cache_service.set(cache_key, result, ttl_seconds=300)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/detect/{profile_id}", response_model=AnomalyAnalysisResponse)
def detect_profile_anomaly(
    profile_id: str,
    request: Request,
    variable: str = Query(default="thetao"),
    threshold: float = Query(default=1.0, ge=0.1, le=5.0),
    time_index: int = Query(default=0, ge=0),
):
    """Run full ML anomaly intelligence on a specific observation profile."""
    anomaly_service = request.app.state.anomaly_service
    argo_service = request.app.state.argo_service
    nc_service = request.app.state.nc_service

    cache_key = f"anomaly:detect:{profile_id}:{variable}:{threshold}:{time_index}"
    cache_service = getattr(request.app.state, "cache_service", None)
    
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    profile = argo_service.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")

    depths = profile["depths"]
    obs_vals = profile.get("temperatures") if variable == "thetao" else profile.get("salinities")

    if not obs_vals:
        raise HTTPException(status_code=400, detail=f"Variable {variable} not available in profile")

    try:
        m_depths, m_vals = nc_service.get_depth_profile(
            variable=variable,
            lat=profile["latitude"],
            lon=profile["longitude"],
            time_index=time_index,
        )
        # Filter masked/NaN model values BEFORE interpolation — NaN model values
        # must never be treated as real deltas by the Isolation Forest features.
        valid = [(d, float(v)) for d, v in zip(m_depths, m_vals) if v is not None and not np.isnan(v)]
        if valid:
            vm_depths, vm_vals = zip(*valid)
            m_interp = np.interp(depths, vm_depths, vm_vals, left=np.nan, right=np.nan).tolist()
        else:
            m_interp = [float(v) if v is not None else 0.0 for v in obs_vals]

        result = anomaly_service.analyze_profile(
            profile_id=profile_id,
            depths=depths,
            obs_vals=obs_vals,
            model_vals=m_interp,
            variable=variable,
            anomaly_threshold=threshold,
        )
        if cache_service:
            cache_service.set(cache_key, result, ttl_seconds=300)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
