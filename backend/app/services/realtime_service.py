"""
realtime_service.py
Provides real-time live ocean observations, real-time in-situ Argo telemetry,
and actual 72-hour forward predictions for the North Indian Ocean domain.

Integrations:
1. Open-Meteo Marine API (zero-key, live real-time waves, current speeds, swell, and 72-hour hourly forward predictions)
2. Ifremer Argo GDAC ERDDAP (live real-time autonomous profiling float network)
"""

import os
import ssl
import logging
import httpx
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger("realtime_service")

class RealtimeOceanService:
    def __init__(self, cache_ttl_seconds: int = 300):
        self.cache_ttl = cache_ttl_seconds
        self._cache: Dict[str, Dict[str, Any]] = {}
        # We reuse an httpx async client for connection pooling
        self.client = httpx.AsyncClient(verify=False, timeout=20.0)

    async def close(self):
        await self.client.aclose()

    async def get_live_conditions_and_forecast(
        self, lat: float = 14.5, lon: float = 84.8
    ) -> Dict[str, Any]:
        """
        Fetch live real-time ocean conditions and actual 72-hour forward hourly prediction.
        """
        cache_key = f"live_{round(lat, 2)}_{round(lon, 2)}"
        now = datetime.now(timezone.utc)

        if cache_key in self._cache:
            entry = self._cache[cache_key]
            if (now - entry["timestamp"]).total_seconds() < self.cache_ttl:
                return entry["data"]

        url = (
            f"https://marine-api.open-meteo.com/v1/marine?"
            f"latitude={lat}&longitude={lon}&"
            f"current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&"
            f"hourly=wave_height,ocean_current_velocity,ocean_current_direction&"
            f"forecast_days=3"
        )

        try:
            resp = await self.client.get(
                url, 
                headers={"User-Agent": "SAGAR-VIEW-INCOIS/1.0"},
                timeout=8.0
            )
            resp.raise_for_status()
            
            raw = resp.json()
            curr = raw.get("current", {})
            hourly = raw.get("hourly", {})

            # Format 72-hour forecast series
            times = hourly.get("time", [])
            wave_heights = hourly.get("wave_height", [])
            current_velocities = hourly.get("ocean_current_velocity", [])
            current_directions = hourly.get("ocean_current_direction", [])

            forecast_series = []
            for i in range(min(len(times), 72)):
                vel = current_velocities[i] if i < len(current_velocities) else None
                wh = wave_heights[i] if i < len(wave_heights) else None
                if vel is None and wh is None:
                    continue  # never invent a value for a missing hour
                risk = "CRITICAL" if (vel or 0) > 1.2 or (wh or 0) > 3.0 else "WARNING" if (vel or 0) > 0.8 or (wh or 0) > 2.0 else "NOMINAL"

                forecast_series.append({
                    "time": times[i],
                    "hour_offset": i,
                    "wave_height_m": round(wh or 0.0, 2),
                    "current_velocity_ms": round(vel or 0.0, 2),
                    "current_direction_deg": round(current_directions[i] or 0.0, 1) if i < len(current_directions) else 0.0,
                    "cyclone_risk": risk,
                })

            peak_wh = round(max(f["wave_height_m"] for f in forecast_series), 2) if forecast_series else None
            peak_cur = round(max(f["current_velocity_ms"] for f in forecast_series), 2) if forecast_series else None
            primary = ("ELEVATED" if any(f["cyclone_risk"] == "CRITICAL" for f in forecast_series)
                       else "MODERATE" if any(f["cyclone_risk"] == "WARNING" for f in forecast_series) else "LOW")
            if forecast_series:
                pk = max(forecast_series, key=lambda f: f["wave_height_m"])
                recommendation = (f"Peak wave height {pk['wave_height_m']} m expected around {pk['time']} UTC "
                                  f"(+{pk['hour_offset']} h); peak surface current {peak_cur} m/s over the next "
                                  f"{len(forecast_series)} h. Sea-state level: {primary}.")
            else:
                recommendation = "No forecast hours returned by the provider."

            result = {
                "status": "live",
                "source": "Open-Meteo Marine Global Real-Time API",
                "latitude": lat,
                "longitude": lon,
                "timestamp_utc": curr.get("time", now.isoformat()),
                "current_observations": {
                    "wave_height_m": curr.get("wave_height"),
                    "wave_period_s": curr.get("wave_period"),
                    "wave_direction_deg": curr.get("wave_direction"),
                    "swell_wave_height_m": curr.get("swell_wave_height"),
                    "wind_wave_height_m": curr.get("wind_wave_height"),
                    "current_velocity_ms": curr.get("ocean_current_velocity"),
                    "current_direction_deg": curr.get("ocean_current_direction"),
                    # Real sea-surface temperature from the Marine API (never an air-temperature proxy)
                    "sea_surface_temp_estimate_c": curr.get("sea_surface_temperature"),
                },
                "prediction_summary": {
                    "forecast_horizon_hours": len(forecast_series),
                    "peak_wave_height_m": peak_wh,
                    "peak_current_velocity_ms": peak_cur,
                    "primary_risk": primary,
                    "hazard_basis": "Sea-state thresholds: wave > 2 m or current > 0.8 m/s = WARNING; > 3 m or > 1.2 m/s = CRITICAL",
                    "recommendation": recommendation,
                },
                "hourly_forecast": forecast_series,
            }

            self._cache[cache_key] = {"timestamp": now, "data": result}
            return result

        except Exception as e:
            logger.warning("Live ocean API query failed: %s", e)
            # Serve the last real response if we have one, clearly marked stale
            if cache_key in self._cache:
                stale = dict(self._cache[cache_key]["data"])
                stale["status"] = "stale"
                stale["stale_since"] = self._cache[cache_key]["timestamp"].isoformat()
                return stale
            raise RuntimeError(f"Open-Meteo Marine API unavailable: {e}")

    async def get_live_argo_network(self) -> Dict[str, Any]:
        """
        Query real-time active Argo float network from Ifremer GDAC ERDDAP.
        """
        cache_key = "argo_live_fleet"
        now = datetime.now(timezone.utc)

        if cache_key in self._cache:
            entry = self._cache[cache_key]
            if (now - entry["timestamp"]).total_seconds() < 900:  # 15 min cache
                return entry["data"]

        # Ifremer Argo ERDDAP query — last 60 days of profiles
        date_cutoff = (now - timedelta(days=60)).strftime("%Y-%m-%dT00%%3A00%%3A00Z")
        url = (
            "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-index.json?"
            "file,date,latitude,longitude,institution&"
            "latitude%3E=0&latitude%3C=28&"
            "longitude%3E=60&longitude%3C=100&"
            f"date%3E={date_cutoff}"
        )

        try:
            resp = await self.client.get(
                url, 
                headers={"User-Agent": "SAGAR-VIEW-INCOIS/1.0"},
                timeout=20.0
            )
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("table", {}).get("rows", [])

            active_platforms = []
            seen_platforms = set()

            for r in rows:
                filepath, date_str, plat_lat, plat_lon, inst = r
                parts = filepath.split("/")
                plat_id = parts[1] if len(parts) > 1 else "Unknown"

                if plat_id not in seen_platforms:
                    seen_platforms.add(plat_id)
                    
                    obs_time = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    is_live = (now - obs_time).total_seconds() < 48 * 3600
                    status = "OPERATIONAL_TRANSMITTING" if is_live else "DEGRADED"

                    active_platforms.append({
                        "platform_id": plat_id,
                        "type": "Argo Profiling Float",
                        "institution": inst,
                        "latitude": round(plat_lat, 3),
                        "longitude": round(plat_lon, 3),
                        "last_observation_utc": date_str,
                        "status": status,
                        "file_uri": filepath,
                    })

            result = {
                "status": "live",
                "source": "Ifremer Global Data Assembly Centre (GDAC) ERDDAP",
                "total_profiles_found": len(rows),
                "unique_active_floats": len(active_platforms),
                "platforms": active_platforms[:50],
                "timestamp": now.isoformat(),
            }
            self._cache[cache_key] = {"timestamp": now, "data": result}
            return result

        except Exception as e:
            logger.warning("Ifremer ERDDAP live fleet query failed: %s", e)
            if cache_key in self._cache:
                stale = dict(self._cache[cache_key]["data"])
                stale["status"] = "stale"
                return stale
            raise RuntimeError(f"Argo GDAC ERDDAP unavailable: {e}")
