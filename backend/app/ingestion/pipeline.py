"""Single live-data refresh pipeline.

Used by the 6-hourly scheduler, the /api/admin/refresh-data endpoint, the
startup freshness check and the CLI (scripts/refresh_model_data.py), so every
entry point ingests data the same way.

Model source order: CMEMS (if COPERNICUS_USERNAME/PASSWORD are configured)
→ HYCOM ESPC-D-V02 (free, no login). Synthetic data is never produced here.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)
_refresh_lock = threading.Lock()
last_refresh: Dict[str, Any] = {}


def refresh_model(settings) -> Dict[str, Any]:
    out_path = settings.model_data_path
    if settings.copernicus_username and settings.copernicus_password:
        from app.ingestion.copernicus_ingest import fetch_cmems_ocean_model
        res = fetch_cmems_ocean_model(out_path, settings.copernicus_username, settings.copernicus_password)
        if res.get("is_live_ingested"):
            return {**res, "provider": "CMEMS"}
        logger.warning("CMEMS refresh failed (%s) — falling back to HYCOM", res.get("message"))
    from app.ingestion.hycom_ingest import fetch_hycom_ocean_model
    res = fetch_hycom_ocean_model(out_path, days_back=settings.model_days_back, days_forward=settings.model_days_forward)
    return {**res, "provider": "HYCOM"}


def refresh_argo(settings) -> Dict[str, Any]:
    from app.ingestion.argo_ingest import fetch_erddap_argo_profiles
    return fetch_erddap_argo_profiles(
        settings.argo_data_path,
        days_back=settings.argo_days_back,
        lat_min=settings.bob_lat_min, lat_max=settings.bob_lat_max,
        lon_min=settings.bob_lon_min, lon_max=settings.bob_lon_max,
        erddap_base_url=settings.argo_erddap_url,
    )


def run_refresh(settings, app_state=None, model: bool = True, argo: bool = True) -> Dict[str, Any]:
    """Refresh data on disk, then hot-reload the in-memory services and clear caches."""
    if not _refresh_lock.acquire(blocking=False):
        return {"status": "busy", "message": "A refresh is already running"}
    started = datetime.now(timezone.utc)
    result: Dict[str, Any] = {"started_at": started.isoformat()}
    try:
        if argo:
            result["argo"] = refresh_argo(settings)
            if result["argo"].get("status") == "error":
                raise RuntimeError(f"Argo ingestion failed: {result['argo'].get('message')}")
            if app_state is not None and result["argo"].get("is_live_ingested"):
                app_state.argo_service.filepath = settings.argo_data_path
                app_state.argo_service.load()
        if model:
            result["model"] = refresh_model(settings)
            if result["model"].get("status") == "error":
                raise RuntimeError(f"Model ingestion failed: {result['model'].get('message')}")
            if app_state is not None and result["model"].get("is_live_ingested"):
                app_state.nc_service.filepath = settings.model_data_path
                app_state.nc_service.load()
        if app_state is not None:
            cache = getattr(app_state, "cache_service", None)
            if cache is not None:
                cache.clear()
            anomaly = getattr(app_state, "anomaly_service", None)
            if anomaly is not None and app_state.argo_service.is_loaded and app_state.nc_service.is_loaded:
                try:
                    anomaly.fit_on_live_fleet(app_state.argo_service, app_state.nc_service)
                except Exception as e:
                    logger.warning("Isolation Forest refit on live fleet failed: %s", e)
        result["finished_at"] = datetime.now(timezone.utc).isoformat()
        result["status"] = "ok"
    except Exception as e:
        logger.exception("Live data refresh failed")
        result["status"] = "error"
        result["message"] = str(e)
    finally:
        _refresh_lock.release()
        last_refresh.clear()
        last_refresh.update(result)
    return result


def data_needs_refresh(settings) -> Dict[str, bool]:
    """Decide at startup whether model/Argo data are missing, synthetic or stale."""
    max_age_h = settings.startup_refresh_max_age_hours
    if max_age_h <= 0:
        return {"model": False, "argo": False}

    def stale(path: str) -> bool:
        if not os.path.exists(path):
            return True
        age_h = (datetime.now().timestamp() - os.path.getmtime(path)) / 3600.0
        return age_h > max_age_h

    model_bad = stale(settings.model_data_path)
    if not model_bad:
        try:
            import xarray as xr
            with xr.open_dataset(settings.model_data_path) as ds:
                model_bad = str(ds.attrs.get("is_synthetic", "")).lower() == "true"
        except Exception:
            model_bad = True
            
    argo_bad = stale(settings.argo_data_path)
    if not argo_bad:
        try:
            import json
            with open(settings.argo_data_path, "r") as f:
                data = json.load(f)
                if data.get("meta", {}).get("is_synthetic", False):
                    argo_bad = True
        except Exception:
            argo_bad = True
            
    return {"model": model_bad, "argo": argo_bad}
