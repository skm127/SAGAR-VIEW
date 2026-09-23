"""Argo observation data service.

Serves real, QC-filtered Argo profiles ingested from the Argo GDAC
(see app/ingestion/argo_ingest.py). There is deliberately no synthetic
fallback and no simulated moored buoys or gliders: if a platform type has no
live feed connected, the service reports zero platforms of that type.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class ArgoService:
    """Service for reading and querying real Argo float profiles."""

    def __init__(self, filepath: str):
        self.filepath = filepath
        self._profiles: List[Dict[str, Any]] = []
        self._by_id: Dict[str, Dict[str, Any]] = {}
        self._latest_by_platform: Dict[str, Dict[str, Any]] = {}
        self._meta: Dict[str, Any] = {}
        self._is_loaded = False

    # ── Loading ─────────────────────────────────────────────────────────
    def load(self) -> bool:
        """Load the QC'd Argo cache written by the ERDDAP ingestion."""
        try:
            if not os.path.exists(self.filepath):
                raise FileNotFoundError(f"{self.filepath} not found — run the Argo ingestion")
            with open(self.filepath, "r", encoding="utf-8") as f:
                payload = json.load(f)
            profiles = payload.get("profiles")
            if not isinstance(profiles, list):
                raise ValueError("Argo cache has an unexpected format (no 'profiles' list)")

            self._profiles = profiles
            self._by_id = {p["id"]: p for p in profiles}
            latest: Dict[str, Dict[str, Any]] = {}
            for p in profiles:
                cur = latest.get(p["platform_id"])
                if cur is None or p["timestamp"] > cur["timestamp"]:
                    latest[p["platform_id"]] = p
            self._latest_by_platform = latest
            self._meta = {k: v for k, v in payload.items() if k != "profiles"}
            self._is_loaded = True
            logger.info("Loaded %d QC'd Argo profiles from %d floats (%s)",
                        len(profiles), len(latest), self._meta.get("ingested_at"))
            return True
        except Exception as e:
            logger.error("Failed to load Argo data: %s", e)
            self._is_loaded = False
            return False

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    # ── Queries ─────────────────────────────────────────────────────────
    def get_all_profiles_summary(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": p["id"],
                "platform_id": p["platform_id"],
                "platform_type": p.get("platform_type", "argo"),
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "timestamp": p["timestamp"],
                "n_depths": len(p["depths"]),
                "max_depth": max(p["depths"]) if p["depths"] else 0,
                "data_mode": p.get("data_mode"),
            }
            for p in self._profiles
        ]

    def get_all_profiles(self) -> List[Dict[str, Any]]:
        return self._profiles

    def get_all_platforms(self) -> List[Dict[str, Any]]:
        return self._profiles

    def get_moored_buoys(self) -> List[Dict[str, Any]]:
        # No live moored-buoy feed is connected (PMEL RAMA ERDDAP currently ends
        # Feb 2026). We report none rather than simulate values.
        return []

    def get_gliders(self) -> List[Dict[str, Any]]:
        return []

    def get_all_sensors_summary(self) -> Dict[str, Any]:
        argo = self.get_all_profiles_summary()
        return {
            "argo": argo,
            "moored_buoys": [],
            "gliders": [],
            "total_platforms": len(self._latest_by_platform),
            "total_profiles": len(argo),
            "feeds": {
                "argo": {"status": "live", "source": self._meta.get("source"), "ingested_at": self._meta.get("ingested_at")},
                "moored_buoys": {"status": "not_connected", "reason": "No live RAMA/OMNI feed available"},
                "gliders": {"status": "not_connected", "reason": "No public glider feed for this domain"},
            },
        }

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Look up by profile id (argo_<wmo>_<cycle>) or by WMO platform id (latest cycle)."""
        p = self._by_id.get(profile_id)
        if p is not None:
            return p
        return self._latest_by_platform.get(profile_id)

    def get_profiles_in_region(self, lat_min: float = 0, lat_max: float = 28,
                               lon_min: float = 60, lon_max: float = 100) -> List[Dict[str, Any]]:
        return [p for p in self._profiles
                if lat_min <= p["latitude"] <= lat_max and lon_min <= p["longitude"] <= lon_max]

    def get_info(self) -> Dict[str, Any]:
        stats = self._meta.get("stats", {})
        return {
            "loaded": self._is_loaded,
            "source": self._meta.get("source"),
            "ingested_at": self._meta.get("ingested_at"),
            "window": self._meta.get("window"),
            "qc_policy": self._meta.get("qc_policy"),
            "n_argo_profiles": len(self._profiles),
            "n_unique_floats": len(self._latest_by_platform),
            "levels_qc_passed": stats.get("levels_kept"),
            "levels_qc_rejected": stats.get("levels_rejected"),
            "profiles_qc_rejected": stats.get("profiles_rejected"),
            "n_moored_buoys": 0,
            "n_gliders": 0,
            "total_platforms": len(self._latest_by_platform),
            "is_synthetic": False,
        }

    def close(self):
        self._is_loaded = False
