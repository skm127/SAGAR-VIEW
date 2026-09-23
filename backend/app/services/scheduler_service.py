"""Background scheduler for automated live-data ingestion.

Every 6 hours (00/06/12/18 UTC) it pulls fresh HYCOM/CMEMS model fields and
Argo GDAC profiles through app.ingestion.pipeline, then hot-reloads the
in-memory services and clears caches — so the running API always serves the
data it just downloaded (no restart, no subprocess hand-off).
"""
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self, settings=None, app_state=None):
        self.scheduler = AsyncIOScheduler()
        self.settings = settings
        self.app_state = app_state
        self._is_running = False

    def start(self):
        if self._is_running:
            return
        self.scheduler.add_job(
            self._run_data_refresh,
            CronTrigger(minute=15),
            id="automated_data_refresh",
            name="Refresh live model + Argo data hourly",
            replace_existing=True,
            misfire_grace_time=3600,
            max_instances=1,
            coalesce=True,
        )
        self.scheduler.start()
        self._is_running = True
        logger.info("SchedulerService started: live refresh hourly at minute 15.")

    def shutdown(self):
        if self._is_running:
            self.scheduler.shutdown(wait=False)
            self._is_running = False
            logger.info("SchedulerService shut down.")

    async def _run_data_refresh(self):
        if self.settings is None:
            logger.error("Scheduler has no settings; skipping refresh")
            return
        from app.ingestion.pipeline import run_refresh
        logger.info("Scheduled live data refresh starting…")
        result = await asyncio.to_thread(run_refresh, self.settings, self.app_state)
        logger.info("Scheduled live data refresh finished: %s", result.get("status"))
