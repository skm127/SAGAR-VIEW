"""SAGAR VIEW FastAPI application.

Main entry point. Loads datasets on startup via lifespan,
registers routers, and serves the API.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import json
from fastapi import Response, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv
import logging
import os

# Load .env file for API keys (GEMINI_API_KEY, etc.)
load_dotenv()

from app.config import get_settings
from app.services.netcdf_service import NetCDFService
from app.services.argo_service import ArgoService
from app.services.anomaly_service import AnomalyService
from app.services.cache_service import CacheService
from app.services.realtime_service import RealtimeOceanService
from app.services.guide_service import GuideService
from app.services.cyclone_service import CycloneService
from app.routers import model_data, observations, comparison, anomaly, analytics, realtime, guide, intelligence, ogc
from app.models import schemas


settings = get_settings()
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)
logger = logging.getLogger("oceanx")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load datasets on startup, close on shutdown."""
    settings = get_settings()
    
    # Live ocean model (HYCOM / CMEMS) — never a synthetic fixture
    nc_service = NetCDFService(settings.model_data_path)
    if os.path.exists(settings.model_data_path):
        nc_service.load()
        if nc_service.is_synthetic and os.getenv("ALLOW_SYNTHETIC_DATA", "").lower() != "true":
            logger.error("%s is SYNTHETIC — refusing to serve it (set ALLOW_SYNTHETIC_DATA=true to override)",
                         settings.model_data_path)
            nc_service.close()
    else:
        logger.warning("Model data not found at %s — a live refresh will be started", settings.model_data_path)

    # Real QC'd Argo profiles (Argo GDAC via ERDDAP)
    argo_service = ArgoService(settings.argo_data_path)
    if os.path.exists(settings.argo_data_path):
        argo_service.load()
    else:
        logger.warning("Argo cache not found at %s — a live refresh will be started", settings.argo_data_path)

    # Initialize Anomaly Intelligence service
    anomaly_service = AnomalyService()
    cyclone_service = CycloneService(cache_dir=os.path.join(settings.data_dir, "cyclones"))

    # Initialize Multi-Tier Cache Service (In-memory + Redis)
    cache_service = CacheService(redis_url=settings.redis_url, default_ttl_seconds=900)

    # Initialize Realtime Ocean Service
    realtime_service = RealtimeOceanService()

    # Initialize Automated Scheduler Service
    from app.services.scheduler_service import SchedulerService
    scheduler_service = SchedulerService(settings=settings, app_state=app.state)
    scheduler_service.start()

    # Initialize AI Guide Service (Gemini-powered chatbot)
    guide_service = GuideService()
    guide_service.initialize()
    
    # Initialize Database (SQLite/Postgres)
    from app.db import init_db
    init_db()
    
    # Initialize Live Feed Broadcaster
    from app.services.live_feed_service import LiveFeedBroadcaster
    live_feed_broadcaster = LiveFeedBroadcaster()
    live_feed_broadcaster.start(realtime_service)
    
    # Store on app state for access in endpoints
    app.state.nc_service = nc_service
    app.state.argo_service = argo_service
    app.state.anomaly_service = anomaly_service
    app.state.cache_service = cache_service
    app.state.realtime_service = realtime_service
    app.state.scheduler_service = scheduler_service
    app.state.guide_service = guide_service
    app.state.live_feed_broadcaster = live_feed_broadcaster
    app.state.cyclone_service = cyclone_service
    app.state.settings = settings

    # Bring data up to date without blocking startup: refresh anything that is
    # missing, synthetic or stale, then (re)fit the Isolation Forest on the
    # real live-fleet residuals.
    import threading
    from app.ingestion.pipeline import data_needs_refresh, run_refresh
    needs = data_needs_refresh(settings)
    if not nc_service.is_loaded:
        needs["model"] = settings.startup_refresh_max_age_hours > 0

    def _startup_data_job():
        if needs["model"] or needs["argo"]:
            logger.info("Startup live refresh: model=%s argo=%s", needs["model"], needs["argo"])
            run_refresh(settings, app.state, model=needs["model"], argo=needs["argo"])
        elif nc_service.is_loaded and argo_service.is_loaded:
            try:
                anomaly_service.fit_on_live_fleet(argo_service, nc_service)
            except Exception as e:
                logger.warning("Isolation Forest live refit failed: %s", e)
    threading.Thread(target=_startup_data_job, name="startup-data", daemon=True).start()

    logger.info("SAGAR VIEW API started")
    
    yield
    
    await live_feed_broadcaster.shutdown()
    await realtime_service.close()
    scheduler_service.shutdown()
    
    # Cleanup resources
    if hasattr(nc_service, 'close'):
        nc_service.close()
    
    logger.info("SAGAR VIEW API shutdown")


from prometheus_fastapi_instrumentator import Instrumentator
import sentry_sdk
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter

# Initialize Sentry for error tracking
if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

app = FastAPI(
    title="SAGAR VIEW API",
    description="3D Ocean Intelligence & Visualization Platform API (INCOIS / SIH 2026)",
    version="1.0.0",
    debug=settings.debug,
    lifespan=lifespan
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.info("422 on %s: %s", request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Instrument the app for Prometheus metrics
Instrumentator().instrument(app).expose(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "Origin"],
    expose_headers=["X-Width", "X-Height", "X-Min", "X-Max", "X-Variable", 
                    "X-Depth", "X-Lat-Min", "X-Lat-Max", "X-Lon-Min", "X-Lon-Max"]
)
app.add_middleware(GZipMiddleware, minimum_size=1_000)


@app.middleware("http")
async def add_response_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
    return response

# Register routers
app.include_router(model_data.router)
app.include_router(observations.router)
app.include_router(comparison.router)
app.include_router(anomaly.router)
app.include_router(analytics.router)
app.include_router(realtime.router)
app.include_router(guide.router)
app.include_router(intelligence.router)
app.include_router(ogc.router)


@app.get("/api/v1/analytics/heat-potential", response_model=schemas.HeatPotentialResponse, tags=["Analytics & Spatial Intelligence"])
def heat_potential_v1_alias(
    request: Request,
    time_index: int = Query(default=0, ge=0),
    lat_min: float = Query(default=0.0, ge=-90.0, le=90.0),
    lat_max: float = Query(default=28.0, ge=-90.0, le=90.0),
    lon_min: float = Query(default=60.0, ge=-180.0, le=180.0),
    lon_max: float = Query(default=100.0, ge=-180.0, le=180.0),
):
    """Direct alias for /api/analytics/heat-potential adhering to v1 spec."""
    return analytics.calculate_heat_potential(request, time_index, lat_min, lat_max, lon_min, lon_max)


@app.get("/api/v1/analytics/heat-potential/point", response_model=schemas.HeatPotentialPoint, tags=["Analytics & Spatial Intelligence"])
def heat_potential_point_v1_alias(
    request: Request,
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    time_index: int = Query(default=0, ge=0),
):
    """Point inspection alias for HUD card readout."""
    return analytics.inspect_heat_potential_point(request, lat, lon, time_index)



def health_payload() -> dict:
    nc_service = app.state.nc_service
    argo_service = app.state.argo_service
    return {
        "status": "healthy" if nc_service.is_loaded and argo_service.is_loaded else "degraded",
        "app_name": settings.app_name,
        "model_data_loaded": nc_service.is_loaded,
        "argo_data_loaded": argo_service.is_loaded,
        "model_info": nc_service.get_info() if nc_service.is_loaded else None,
        "argo_info": argo_service.get_info() if argo_service.is_loaded else None
    }


@app.get("/api/data/freshness", tags=["System"])
def data_freshness(request: Request):
    """Real timestamps of the served datasets (Phase 2c).

    Drives the 'Model: updated Xh ago' indicator in the UI so users can see
    the actual age of the data instead of assuming a static demo dump.
    """
    nc_service = request.app.state.nc_service
    argo_service = request.app.state.argo_service
    from datetime import datetime, timezone

    model_range = nc_service.get_time_range() if nc_service.is_loaded else [None, None]
    argo_most_recent = None
    if argo_service.is_loaded:
        timestamps = [
            p.get("timestamp") for p in argo_service.get_all_profiles_summary() if p.get("timestamp")
        ]
        if timestamps:
            argo_most_recent = max(timestamps)

    return {
        "model_dataset_time_range": model_range,
        "model_file_loaded_at": nc_service.loaded_at,
        "argo_most_recent_profile": argo_most_recent,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/health/live")
def liveness_check():
    return {"status": "healthy", "app_name": settings.app_name}


@app.get("/api/health")
@app.get("/api/health/ready")
def readiness_check(response: Response):
    # During initial cloud deployment, data ingestion takes a few minutes.
    # We must return 200 OK so the load balancer doesn't kill the container.
    payload = health_payload()
    return payload


def _check_admin(request: Request):
    token = os.getenv("ADMIN_TOKEN")
    if token and request.headers.get("x-admin-token") != token:
        raise HTTPException(status_code=401, detail="Admin token required")


@app.post("/api/admin/reload-model", tags=["System"])
async def reload_model_data(request: Request):
    """Hot-reload the model NetCDF dataset without restarting the server."""
    _check_admin(request)
    nc_service = app.state.nc_service
    if nc_service.load():
        app.state.cache_service.clear()
        return {"status": "reloaded", "info": nc_service.get_info()}
    raise HTTPException(status_code=500, detail="Failed to reload model data")


@app.post("/api/admin/refresh-data", tags=["System"])
async def refresh_live_data(request: Request, model: bool = True, argo: bool = True):
    """Pull fresh HYCOM/CMEMS model + Argo GDAC data, then hot-reload (runs in a worker thread)."""
    _check_admin(request)
    import asyncio
    from app.ingestion.pipeline import run_refresh
    return await asyncio.to_thread(run_refresh, app.state.settings, app.state, model, argo)


# ── Serve built React frontend in production (single-container mode) ────
_static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(_static_dir):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        file_path = os.path.join(_static_dir, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_static_dir, "index.html"))

# Force reload
