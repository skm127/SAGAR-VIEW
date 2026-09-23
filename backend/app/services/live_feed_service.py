import asyncio
import logging
from typing import Dict, Any, Set
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger("live_feed")

class LiveFeedBroadcaster:
    def __init__(self):
        self.queues: Set[asyncio.Queue] = set()
        self.scheduler = AsyncIOScheduler()
        self.last_data = {}

    def start(self, realtime_service):
        self.realtime_service = realtime_service
        self.scheduler.add_job(self.fetch_and_broadcast, 'interval', seconds=30)
        self.scheduler.start()
        logger.info("Live feed broadcaster and scheduler started.")

    async def shutdown(self):
        self.scheduler.shutdown()
        logger.info("Live feed broadcaster shut down.")

    async def add_client(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self.queues.add(q)
        # Immediately push the last known state to the new client
        if self.last_data:
            await q.put(self.last_data)
        return q

    def remove_client(self, q: asyncio.Queue):
        self.queues.discard(q)

    async def broadcast(self, payload: Dict[str, Any]):
        self.last_data = payload
        dead_queues = set()
        for q in list(self.queues):
            try:
                # Use nowait to prevent blocking the broadcast loop
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead_queues.add(q)
            except Exception:
                dead_queues.add(q)
                
        for q in dead_queues:
            self.remove_client(q)

    async def fetch_and_broadcast(self):
        """Background job to fetch data and push to clients."""
        try:
            logger.debug("Fetching scheduled live updates...")
            ocean_data = await self.realtime_service.get_live_conditions_and_forecast(lat=14.5, lon=84.8)
            fleet_data = await self.realtime_service.get_live_argo_network()
            
            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "ocean": ocean_data,
                "fleet": fleet_data
            }

            # Persist to time-series database (in a background thread since SQLAlchemy is synchronous here)
            import asyncio
            try:
                asyncio.create_task(self.persist_to_db(ocean_data, fleet_data))
            except Exception as e:
                logger.error(f"Failed to trigger persist_to_db: {e}")

            await self.broadcast(payload)
        except Exception as e:
            logger.error(f"Error in background fetch_and_broadcast: {e}")

    async def persist_to_db(self, ocean_data, fleet_data):
        from app.db import SessionLocal
        from app.models.db_models import OceanTelemetryHistory, FleetPlatformHistory
        
        def save():
            db = SessionLocal()
            try:
                # Save Ocean Telemetry
                obs = ocean_data.get("current_observations", {})
                record = OceanTelemetryHistory(
                    latitude=ocean_data.get("latitude", 14.5),
                    longitude=ocean_data.get("longitude", 84.8),
                    wave_height_m=obs.get("wave_height_m"),
                    wave_period_s=obs.get("wave_period_s"),
                    swell_wave_height_m=obs.get("swell_wave_height_m"),
                    current_velocity_ms=obs.get("current_velocity_ms"),
                    current_direction_deg=obs.get("current_direction_deg"),
                    sea_surface_temp_c=obs.get("sea_surface_temp_estimate_c"),
                    raw_payload=ocean_data
                )
                db.add(record)
                
                # Save Fleet Snapshot
                platforms = fleet_data.get("platforms", [])
                for p in platforms:
                    fp = FleetPlatformHistory(
                        platform_id=p.get("platform_id"),
                        platform_type=p.get("type"),
                        latitude=p.get("latitude"),
                        longitude=p.get("longitude"),
                        status=p.get("status"),
                        raw_payload=p
                    )
                    db.add(fp)
                
                db.commit()
            except Exception as e:
                logger.error(f"Failed to persist historical data: {e}")
            finally:
                db.close()
        
        import asyncio
        await asyncio.to_thread(save)
