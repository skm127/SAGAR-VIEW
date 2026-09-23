"""API endpoints for observation data (Argo floats, etc.)."""
from fastapi import APIRouter, Request, HTTPException, Query
from typing import Optional
from app.models.schemas import ObservationProfile

router = APIRouter(prefix="/api/observations", tags=["Observations"])


@router.get("/argo")
def get_argo_profiles(
    request: Request,
    lat_min: float = Query(default=0.0),
    lat_max: float = Query(default=28.0),
    lon_min: float = Query(default=60.0),
    lon_max: float = Query(default=100.0),
):
    """Get all Argo float profiles in the region."""
    argo_service = request.app.state.argo_service
    if not argo_service.is_loaded:
        raise HTTPException(status_code=503, detail="Argo data not loaded")
    
    profiles = argo_service.get_profiles_in_region(
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max
    )
    return {"profiles": profiles, "count": len(profiles)}


@router.get("/argo/{profile_id}", response_model=ObservationProfile)
def get_argo_profile(profile_id: str, request: Request):
    """Get a specific Argo profile with full depth data."""
    argo_service = request.app.state.argo_service
    if not argo_service.is_loaded:
        raise HTTPException(status_code=503, detail="Argo data not loaded")
    
    profile = argo_service.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    
    return profile


@router.get("/all")
def get_all_observations(request: Request):
    """Get all in-situ observational platforms (Argo, Moored Buoys, Gliders)."""
    cache_key = "obs:all"
    cache_service = getattr(request.app.state, "cache_service", None)
    
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    argo_service = request.app.state.argo_service
    result = argo_service.get_all_sensors_summary()

    if cache_service:
        cache_service.set(cache_key, result, ttl_seconds=300) # 5 min cache
        
    return result


@router.get("/buoys")
def get_moored_buoys(request: Request):
    """Get INCOIS OMNI & RAMA moored buoys."""
    argo_service = request.app.state.argo_service
    buoys = argo_service.get_moored_buoys()
    return {"buoys": buoys, "count": len(buoys)}


@router.get("/gliders")
def get_glider_missions(request: Request):
    """Get autonomous underwater glider missions."""
    argo_service = request.app.state.argo_service
    gliders = argo_service.get_gliders()
    return {"gliders": gliders, "count": len(gliders)}


@router.get("/sensor/{sensor_id}")
def get_sensor_by_id(sensor_id: str, request: Request):
    """Get depth profile and telemetry for any sensor (Argo, Buoy, Glider)."""
    argo_service = request.app.state.argo_service
    sensor = argo_service.get_profile(sensor_id)
    if not sensor:
        raise HTTPException(status_code=404, detail=f"Sensor platform {sensor_id} not found")
    return sensor


@router.get("/info")
def get_observations_info(request: Request):
    """Get information about loaded observation data."""
    argo_service = request.app.state.argo_service
    return argo_service.get_info()
