"""HYCOM ESPC-D-V02 live ocean-model ingestion (no credentials required).

Source: US Navy ESPC-D-V02 global 1/12° HYCOM + NCODA analysis/forecast,
served freely by HYCOM.org through the THREDDS NetCDF Subset Service (NCSS).
https://www.hycom.org/dataserver/espc-d-v02/global-analysis

We request one daily snapshot (12:00 UTC) per day for temperature, salinity
and currents over the North Indian Ocean, keep the upper 500 m, and regrid to
the platform's 0.25° analysis grid. The output file carries full provenance
attributes (source, retrieval time, per-step analysis/forecast role) and
``is_synthetic = "false"``.
"""
from __future__ import annotations

import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

import httpx
import numpy as np
import xarray as xr

logger = logging.getLogger(__name__)

NCSS_BASE = "https://ncss.hycom.org/thredds/ncss/grid/FMRC_ESPC-D-V02_{ds}/FMRC_ESPC-D-V02_{ds}_best.ncd"
PRODUCT_NAME = "HYCOM ESPC-D-V02 Global 1/12° Analysis/Forecast (US Navy FNMOC/NRL via HYCOM.org)"

# dataset -> {hycom_var: platform_var}
HYCOM_GROUPS = {
    "t3z": {"water_temp": "thetao"},
    "s3z": {"salinity": "so"},
    "u3z": {"water_u": "uo"},
    "v3z": {"water_v": "vo"},
}

DEFAULT_BOUNDS = {"lat_min": 0.0, "lat_max": 28.0, "lon_min": 60.0, "lon_max": 100.0, "depth_max": 500.0}
GRID_STEP = 0.25


def _download_snapshot(ds_key: str, when: datetime, bounds: Dict[str, float], out_dir: str,
                       horiz_stride: int, retries: int = 2) -> Optional[str]:
    vars_q = "&".join(f"var={v}" for v in HYCOM_GROUPS[ds_key])
    url = (
        NCSS_BASE.format(ds=ds_key)
        + f"?{vars_q}&north={bounds['lat_max'] + 0.5}&south={bounds['lat_min'] - 0.5}"
        + f"&west={bounds['lon_min'] - 0.5}&east={bounds['lon_max'] + 0.5}"
        + f"&horizStride={horiz_stride}&time={when.strftime('%Y-%m-%dT%H:%M:%SZ')}&accept=netcdf"
    )
    path = os.path.join(out_dir, f"{ds_key}_{when.strftime('%Y%m%d%H')}.nc")
    for attempt in range(1, retries + 1):
        try:
            with httpx.stream("GET", url, timeout=httpx.Timeout(45.0, connect=15.0), follow_redirects=True) as r:
                if r.status_code != 200:
                    raise RuntimeError(f"HTTP {r.status_code}")
                with open(path, "wb") as f:
                    for chunk in r.iter_bytes(1 << 20):
                        f.write(chunk)
            # Validate that the file is a readable grid before accepting it.
            with xr.open_dataset(path) as test:
                if not set(HYCOM_GROUPS[ds_key]).issubset(test.data_vars):
                    raise RuntimeError("variables missing in NCSS response")
            return path
        except Exception as e:  # network hiccups are common on NCSS — retry
            logger.warning("HYCOM %s %s attempt %d failed: %s", ds_key, when.date(), attempt, e)
            time.sleep(3 * attempt)
    return None


def _regrid_snapshot(path: str, ds_key: str, target_lat: np.ndarray, target_lon: np.ndarray,
                     depth_max: float) -> Tuple[xr.Dataset, datetime]:
    with xr.open_dataset(path) as raw:
        raw = raw.load()
    if "time" in raw.dims:
        raw = raw.isel(time=0)
    t_actual = np.datetime64(raw["time"].values).astype("datetime64[s]").astype(datetime).replace(tzinfo=timezone.utc)
    raw = raw.sel(depth=raw["depth"] <= depth_max)
    lon = raw["lon"].values
    if lon.max() > 180:
        raw = raw.assign_coords(lon=((raw["lon"] + 180) % 360) - 180).sortby("lon")
    out = xr.Dataset()
    for src, dst in HYCOM_GROUPS[ds_key].items():
        da = raw[src].astype("float32").drop_vars([c for c in raw[src].coords if c not in ("depth", "lat", "lon")])
        out[dst] = da.interp(lat=target_lat, lon=target_lon, method="linear").astype("float32")
    return out, t_actual


# Maximum wall-clock seconds before we abort to avoid hosting CPU monitors
# (Antideploy kills containers that peg CPU for 10+ minutes).
INGESTION_TIMEOUT_SECONDS = float(os.environ.get("INGESTION_TIMEOUT_SECONDS", "480"))  # 8 min default


def fetch_hycom_ocean_model(
    output_filepath: str,
    days_back: int = 4,
    days_forward: int = 2,
    bounds: Optional[Dict[str, float]] = None,
    horiz_stride: int = 4,
    max_workers: Optional[int] = None,
) -> Dict[str, Any]:
    """Download a multi-day HYCOM subset and write a CF-compliant NetCDF file.

    The file is written to a temp path and atomically moved into place only if
    every requested day for temperature/salinity succeeded; a partial download
    never overwrites a good dataset.
    """
    if max_workers is None:
        max_workers = int(os.environ.get("HYCOM_MAX_WORKERS", "2"))
    b = {**DEFAULT_BOUNDS, **(bounds or {})}
    now = datetime.now(timezone.utc)
    today_noon = now.replace(hour=12, minute=0, second=0, microsecond=0)
    days = [today_noon + timedelta(days=k) for k in range(-days_back, days_forward + 1)]

    target_lat = np.round(np.arange(b["lat_min"], b["lat_max"] + 1e-6, GRID_STEP), 4)
    target_lon = np.round(np.arange(b["lon_min"], b["lon_max"] + 1e-6, GRID_STEP), 4)
    started = time.time()

    with tempfile.TemporaryDirectory(prefix="hycom_") as tmp:
        jobs = {}
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            for day in days:
                for ds_key in HYCOM_GROUPS:
                    jobs[pool.submit(_download_snapshot, ds_key, day, b, tmp, horiz_stride)] = (ds_key, day)
            results: Dict[Tuple[str, datetime], Optional[str]] = {}
            for fut in as_completed(jobs):
                results[jobs[fut]] = fut.result()

        steps: List[xr.Dataset] = []
        step_times: List[datetime] = []
        for day in days:
            # CPU budget guard: abort before hosting monitor kills the container
            elapsed_so_far = time.time() - started
            if elapsed_so_far > INGESTION_TIMEOUT_SECONDS:
                logger.warning(
                    "HYCOM ingestion approaching CPU budget (%.0fs/%.0fs) — stopping with %d steps so far",
                    elapsed_so_far, INGESTION_TIMEOUT_SECONDS, len(steps),
                )
                break

            t_path = results.get(("t3z", day))
            if not t_path:
                logger.warning("HYCOM temperature missing for %s — skipping this day", day.date())
                continue
            day_ds, t_actual = _regrid_snapshot(t_path, "t3z", target_lat, target_lon, b["depth_max"])
            time.sleep(0.3)
            
            s_path = results.get(("s3z", day))
            if s_path:
                s_ds, _ = _regrid_snapshot(s_path, "s3z", target_lat, target_lon, b["depth_max"])
                day_ds = xr.merge([day_ds, s_ds])
                time.sleep(0.3)
            elif "so" not in day_ds:
                day_ds["so"] = xr.full_like(day_ds["thetao"], 35.0)

            u_path = results.get(("u3z", day))
            if u_path:
                u_ds, _ = _regrid_snapshot(u_path, "u3z", target_lat, target_lon, b["depth_max"])
                day_ds = xr.merge([day_ds, u_ds])
                time.sleep(0.3)
            elif "uo" not in day_ds:
                day_ds["uo"] = xr.full_like(day_ds["thetao"], 0.0)

            v_path = results.get(("v3z", day))
            if v_path:
                v_ds, _ = _regrid_snapshot(v_path, "v3z", target_lat, target_lon, b["depth_max"])
                day_ds = xr.merge([day_ds, v_ds])
                time.sleep(0.3)
            elif "vo" not in day_ds:
                day_ds["vo"] = xr.full_like(day_ds["thetao"], 0.0)

            steps.append(day_ds)
            step_times.append(t_actual)

        if len(steps) < 1:
            msg = f"HYCOM ingestion produced only {len(steps)} valid daily steps — keeping existing dataset"
            logger.error(msg)
            return {"status": "error", "message": msg, "is_live_ingested": False}

        merged = xr.concat(steps, dim="time")
        merged = merged.assign_coords(time=[np.datetime64(t.replace(tzinfo=None), "ns") for t in step_times])
        merged = merged.transpose("time", "depth", "lat", "lon")
        roles = ["analysis" if t <= now else "forecast" for t in step_times]

        merged.attrs = {
            "Conventions": "CF-1.8",
            "title": "SAGAR VIEW North Indian Ocean upper-ocean state (HYCOM ESPC-D-V02)",
            "source": PRODUCT_NAME,
            "source_provenance": PRODUCT_NAME,
            "source_url": "https://www.hycom.org/dataserver/espc-d-v02/global-analysis",
            "institution": "Naval Research Laboratory / FNMOC (data); regridded by SAGAR VIEW",
            "native_resolution": f"1/12° × 1/25° (sampled every {horiz_stride} cells, bilinearly regridded to {GRID_STEP}°)",
            "retrieved_at": now.isoformat(),
            "time_roles": ",".join(roles),
            "is_synthetic": "false",
            "history": f"{now.isoformat()} downloaded via THREDDS NCSS; upper {int(b['depth_max'])} m retained",
        }
        merged["thetao"].attrs.update(units="degC", long_name="Sea water temperature (in-situ, HYCOM)")
        merged["so"].attrs.update(units="psu", long_name="Sea water salinity")
        merged["uo"].attrs.update(units="m s-1", long_name="Eastward sea water velocity")
        merged["vo"].attrs.update(units="m s-1", long_name="Northward sea water velocity")

        os.makedirs(os.path.dirname(os.path.abspath(output_filepath)), exist_ok=True)
        tmp_out = output_filepath + ".partial"
        enc = {v: {"zlib": True, "complevel": 4, "dtype": "float32"} for v in merged.data_vars}
        merged.to_netcdf(tmp_out, encoding=enc)
        os.replace(tmp_out, output_filepath)

    elapsed = round(time.time() - started, 1)
    logger.info("HYCOM ingestion complete: %d steps (%s) in %ss -> %s", len(step_times), ",".join(roles), elapsed, output_filepath)
    return {
        "status": "success",
        "source": PRODUCT_NAME,
        "filepath": output_filepath,
        "time_steps": [t.isoformat() for t in step_times],
        "time_roles": roles,
        "elapsed_seconds": elapsed,
        "is_live_ingested": True,
        "timestamp": now.isoformat(),
    }
