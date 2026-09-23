"""
realtime.py
REST API endpoints for real-time live ocean telemetry and 72-hour forward predictions.
"""

from fastapi import APIRouter, Query, Request, HTTPException
from typing import Optional
from app.limiter import limiter

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.get("/live-ocean")
@limiter.limit("10/minute")
async def get_live_ocean_conditions(
    request: Request,
    lat: float = Query(14.5, description="Latitude in degrees (-90 to 90)"),
    lon: float = Query(84.8, description="Longitude in degrees (-180 to 180)"),
):
    """
    Retrieve real-time live ocean observations (waves, currents, thermal state)
    plus actual 72-hour hourly forward predictions for specified geographic coordinates.
    """
    service = getattr(request.app.state, "realtime_service", None)
    if not service:
        from app.services.realtime_service import RealtimeOceanService
        service = RealtimeOceanService()
        request.app.state.realtime_service = service

    try:
        return await service.get_live_conditions_and_forecast(lat=lat, lon=lon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/fleet-live")
async def get_live_argo_fleet(request: Request):
    """
    Retrieve live real-time autonomous profiling float and buoy network telemetry
    directly from Ifremer GDAC ERDDAP and INCOIS Observation Network.
    """
    service = getattr(request.app.state, "realtime_service", None)
    if not service:
        from app.services.realtime_service import RealtimeOceanService
        service = RealtimeOceanService()
        request.app.state.realtime_service = service

    try:
        return await service.get_live_argo_network()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

from fastapi import Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.models.db_models import OceanTelemetryHistory
from sqlalchemy import desc

@router.get("/history")
def get_telemetry_history(
    limit: int = 24,
    db: Session = Depends(get_db)
):
    """
    Retrieve historical time-series of ocean telemetry.
    Useful for charting trends (e.g. wave height over last 24 updates).
    """
    records = db.query(OceanTelemetryHistory).order_by(desc(OceanTelemetryHistory.timestamp_utc)).limit(limit).all()
    
    return {
        "status": "success",
        "count": len(records),
        "data": [
            {
                "timestamp_utc": r.timestamp_utc.isoformat(),
                "latitude": r.latitude,
                "longitude": r.longitude,
                "wave_height_m": r.wave_height_m,
                "wave_period_s": r.wave_period_s,
                "current_velocity_ms": r.current_velocity_ms,
                "sea_surface_temp_c": r.sea_surface_temp_c
            }
            for r in records
        ]
    }

import asyncio
from sse_starlette.sse import EventSourceResponse
import json

@router.get("/stream")
async def live_stream(request: Request):
    """
    Subscribe to live real-time ocean updates via Server-Sent Events (SSE).
    """
    broadcaster = getattr(request.app.state, "live_feed_broadcaster", None)
    if not broadcaster:
        return {"error": "Broadcaster not initialized"}
        
    async def event_publisher():
        q = await broadcaster.add_client()
        try:
            while True:
                # Disconnect if client leaves
                if await request.is_disconnected():
                    break
                
                # Wait for next payload from broadcaster
                try:
                    # Timeout to allow checking for disconnects
                    payload = await asyncio.wait_for(q.get(), timeout=5.0)
                    yield {
                        "event": "update",
                        "data": json.dumps(payload)
                    }
                except asyncio.TimeoutError:
                    # Send a keepalive ping
                    yield {
                        "event": "ping",
                        "data": "keepalive"
                    }
        finally:
            broadcaster.remove_client(q)

    return EventSourceResponse(event_publisher())
