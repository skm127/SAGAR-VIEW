"""API endpoints for ocean model data."""
from fastapi import APIRouter, Request, Response, HTTPException, Query
import numpy as np
from app.models.schemas import Variable, DatasetInfo

router = APIRouter(prefix="/api/model", tags=["Model Data"])


@router.get("/info", response_model=DatasetInfo)
def get_model_info(request: Request):
    """Get information about the loaded model dataset."""
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")
    return nc_service.get_info()


@router.get("/slice")
def get_model_slice(
    request: Request,
    variable: Variable = Query(default=Variable.TEMPERATURE, description="Variable name"),
    depth: float = Query(default=0.0, ge=0, description="Depth in meters"),
    time_index: int = Query(default=0, ge=0, description="Time step index"),
):
    """Get a 2D horizontal slice as binary float32 array.
    
    Returns raw bytes with metadata in response headers.
    The browser should interpret this as a Float32Array.
    """
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")
    
    try:
        arr, metadata = nc_service.get_depth_slice(
            variable=variable.value,
            depth=depth,
            time_index=time_index
        )
        
        # Replace NaN with a sentinel for the frontend
        arr = np.ascontiguousarray(np.nan_to_num(arr, nan=-9999.0), dtype=np.float32)
        
        return Response(
            content=arr.tobytes(),
            media_type="application/octet-stream",
            headers={
                "X-Width": str(metadata["width"]),
                "X-Height": str(metadata["height"]),
                "X-Min": str(metadata["value_min"]),
                "X-Max": str(metadata["value_max"]),
                "X-Variable": metadata["variable"],
                "X-Depth": str(metadata["depth"]),
                "X-Lat-Min": str(metadata["lat_min"]),
                "X-Lat-Max": str(metadata["lat_max"]),
                "X-Lon-Min": str(metadata["lon_min"]),
                "X-Lon-Max": str(metadata["lon_max"]),
                "Access-Control-Expose-Headers": "X-Width, X-Height, X-Min, X-Max, X-Variable, X-Depth, X-Lat-Min, X-Lat-Max, X-Lon-Min, X-Lon-Max"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/slice/json")
def get_model_slice_json(
    request: Request,
    variable: Variable = Query(default=Variable.TEMPERATURE),
    depth: float = Query(default=0.0, ge=0),
    time_index: int = Query(default=0, ge=0),
):
    """Get a 2D horizontal slice as JSON (smaller datasets only)."""
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")
    
    try:
        arr, metadata = nc_service.get_depth_slice(
            variable=variable.value,
            depth=depth,
            time_index=time_index
        )
        
        # Convert to list, replacing NaN with None
        data_list = []
        for row in arr:
            data_list.append([None if np.isnan(v) else round(float(v), 3) for v in row])
        
        return {
            "metadata": metadata,
            "data": data_list
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/profile")
def get_model_profile(
    request: Request,
    variable: Variable = Query(default=Variable.TEMPERATURE),
    lat: float = Query(ge=-90.0, le=90.0, description="Latitude"),
    lon: float = Query(ge=-180.0, le=180.0, description="Longitude"),
    time_index: int = Query(default=0, ge=0),
):
    """Get a vertical depth profile at a specific lat/lon."""
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")
    
    try:
        depths, values = nc_service.get_depth_profile(
            variable=variable.value,
            lat=lat,
            lon=lon,
            time_index=time_index
        )
        return {
            "variable": variable.value,
            "latitude": lat,
            "longitude": lon,
            "time_index": time_index,
            "depths": depths,
            "values": values
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/currents")
def get_current_vectors(
    request: Request,
    depth: float = Query(default=0.0, ge=0),
    time_index: int = Query(default=0, ge=0),
    subsample: int = Query(default=5, ge=1, le=20, description="Subsample every N points"),
):
    """Get current vectors (uo, vo) as JSON for arrow/particle visualization.
    
    Returns subsampled lat/lon grid with eastward (uo) and northward (vo) 
    components, plus computed speed and direction.
    """
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")
    
    try:
        uo_arr, uo_meta = nc_service.get_depth_slice("uo", depth, time_index)
        vo_arr, vo_meta = nc_service.get_depth_slice("vo", depth, time_index)
        
        height, width = uo_arr.shape
        lat_min, lat_max = uo_meta["lat_min"], uo_meta["lat_max"]
        lon_min, lon_max = uo_meta["lon_min"], uo_meta["lon_max"]
        
        vectors = []
        for i in range(0, height, subsample):
            for j in range(0, width, subsample):
                u = float(uo_arr[i, j])
                v = float(vo_arr[i, j])
                if np.isnan(u) or np.isnan(v):
                    continue
                
                lat = lat_min + (lat_max - lat_min) * (i / (height - 1))
                lon = lon_min + (lon_max - lon_min) * (j / (width - 1))
                speed = float(np.sqrt(u**2 + v**2))
                
                vectors.append({
                    "lat": round(lat, 3),
                    "lon": round(lon, 3),
                    "uo": round(u, 4),
                    "vo": round(v, 4),
                    "speed": round(speed, 4),
                })
        
        speeds = [v["speed"] for v in vectors]
        return {
            "vectors": vectors,
            "count": len(vectors),
            "depth": depth,
            "time_index": time_index,
            "speed_min": round(min(speeds), 4) if speeds else 0,
            "speed_max": round(max(speeds), 4) if speeds else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/time_info")
def get_time_info(request: Request):
    """Get time step dates for the loaded dataset."""
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")
    
    ds = nc_service.dataset
    time_name = nc_service._find_coord('time', 't')
    if not time_name:
        return {"dates": []}
    
    import pandas as pd
    times = pd.DatetimeIndex(ds[time_name].values)
    return {
        "dates": [t.strftime("%Y-%m-%d") for t in times],
        "count": len(times),
    }
