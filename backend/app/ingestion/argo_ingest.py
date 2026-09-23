"""Argo GDAC ingestion via the Ifremer ERDDAP tabledap server.

Pulls real Argo CTD profiles and applies the standard Argo QC policy:

* only ascending profiles (``direction = A``)
* profile rejected unless position_qc and time_qc are 1 (good) or 2 (probably good)
* per level: pressure and temperature kept only with QC 1/2; salinity kept only
  with QC 1/2 (otherwise stored as null — never filled)
* adjusted (delayed/adjusted-mode) values are used where the float's data mode
  is 'A' or 'D' and an adjusted value exists, per the Argo User's Manual
* pressure is converted to depth with the Saunders (1981) formula

The same query function is reused by the cyclone backtest for historical
windows and climatology, so live and historical analyses share one code path.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import os
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple

import httpx

from app.services.ocean_physics import pressure_to_depth

logger = logging.getLogger(__name__)

DEFAULT_ERDDAP_URL = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats"
SOURCE_NAME = "Argo GDAC (Ifremer ERDDAP ArgoFloats)"
GOOD_QC = {"1", "2"}

COLUMNS = [
    "platform_number", "cycle_number", "time", "latitude", "longitude", "data_mode", "direction",
    "position_qc", "time_qc",
    "pres", "pres_qc", "temp", "temp_qc", "psal", "psal_qc",
    "pres_adjusted", "pres_adjusted_qc", "temp_adjusted", "temp_adjusted_qc",
    "psal_adjusted", "psal_adjusted_qc",
]


def _num(x: str) -> Optional[float]:
    if x is None or x == "" or x.lower() == "nan":
        return None
    try:
        return float(x)
    except ValueError:
        return None


def _qc(x: str) -> str:
    return (x or "").strip().split(".")[0]


def query_argo_erddap(
    lat_min: float, lat_max: float, lon_min: float, lon_max: float,
    t_start: datetime, t_end: datetime,
    pres_max: float = 1000.0,
    erddap_base_url: str = DEFAULT_ERDDAP_URL,
    timeout_seconds: float = 180.0,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Return (QC-filtered profiles, QC statistics) for a space-time box."""
    constraints = (
        f"&latitude>={lat_min}&latitude<={lat_max}&longitude>={lon_min}&longitude<={lon_max}"
        f"&time>={t_start.strftime('%Y-%m-%dT%H:%M:%SZ')}&time<={t_end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
        f"&pres<={pres_max}"
    )
    query = ",".join(COLUMNS) + constraints
    url = f"{erddap_base_url}.csv?{urllib.parse.quote(query, safe='&=,')}"
    resp = httpx.get(url, timeout=timeout_seconds, headers={"User-Agent": "SAGAR-VIEW/1.0 (INCOIS SIH ocean platform)"})
    if resp.status_code == 404 and "no matching results" in resp.text.lower():
        return [], {"query_url": url, "rows_raw": 0, "levels_kept": 0, "levels_rejected": 0,
                    "profiles_kept": 0, "profiles_rejected": 0}
    resp.raise_for_status()

    reader = csv.reader(io.StringIO(resp.text))
    header = next(reader)
    next(reader, None)  # units row
    idx = {name: i for i, name in enumerate(header)}

    profiles: Dict[str, Dict[str, Any]] = {}
    rows_raw = levels_kept = levels_rejected = 0
    rejected_profiles = set()

    for row in reader:
        rows_raw += 1
        g = lambda k: row[idx[k]] if k in idx else ""
        if g("direction") and g("direction") != "A":
            continue
        key = f"{g('platform_number').strip()}_{g('cycle_number')}"
        if _qc(g("position_qc")) not in GOOD_QC or _qc(g("time_qc")) not in GOOD_QC:
            rejected_profiles.add(key)
            continue

        mode = (g("data_mode") or "R").strip()
        use_adj = mode in ("A", "D")

        def pick(var: str) -> Tuple[Optional[float], str]:
            if use_adj:
                v = _num(g(f"{var}_adjusted"))
                if v is not None:
                    return v, _qc(g(f"{var}_adjusted_qc"))
            return _num(g(var)), _qc(g(f"{var}_qc"))

        pres, pres_q = pick("pres")
        temp, temp_q = pick("temp")
        psal, psal_q = pick("psal")
        if pres is None or temp is None or pres_q not in GOOD_QC or temp_q not in GOOD_QC:
            levels_rejected += 1
            continue
        if not (-2.5 <= temp <= 40.0):  # gross range test backstop
            levels_rejected += 1
            continue
        if psal is not None and (psal_q not in GOOD_QC or not (2.0 <= psal <= 41.0)):
            psal = None

        p = profiles.get(key)
        if p is None:
            lat = _num(g("latitude"))
            lon = _num(g("longitude"))
            if lat is None or lon is None:
                continue
            p = profiles[key] = {
                "id": f"argo_{key}",
                "platform_id": g("platform_number").strip(),
                "cycle": int(float(g("cycle_number"))) if g("cycle_number") else None,
                "platform_type": "argo",
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "timestamp": g("time"),
                "data_mode": mode,
                "pressures": [], "temperatures": [], "salinities": [],
                "source": SOURCE_NAME,
            }
        p["pressures"].append(round(pres, 2))
        p["temperatures"].append(round(temp, 4))
        p["salinities"].append(None if psal is None else round(psal, 4))
        levels_kept += 1

    out: List[Dict[str, Any]] = []
    for key, p in profiles.items():
        order = sorted(range(len(p["pressures"])), key=lambda i: p["pressures"][i])
        for fld in ("pressures", "temperatures", "salinities"):
            p[fld] = [p[fld][i] for i in order]
        if len(p["pressures"]) < 5 or p["pressures"][0] > 20.0:
            rejected_profiles.add(key)
            continue
        p["depths"] = [round(float(z), 2) for z in pressure_to_depth(p["pressures"], p["latitude"])]
        p["n_levels"] = len(p["depths"])
        p["qc_flags"] = [1] * len(p["depths"])  # only QC 1/2 levels survive the filter above
        out.append(p)

    out.sort(key=lambda x: x["timestamp"])
    stats = {
        "query_url": url,
        "rows_raw": rows_raw,
        "levels_kept": levels_kept,
        "levels_rejected": levels_rejected,
        "profiles_kept": len(out),
        "profiles_rejected": len(rejected_profiles - {p["id"][5:] for p in out}),
        "unique_floats": len({p["platform_id"] for p in out}),
    }
    return out, stats


def fetch_erddap_argo_profiles(
    output_filepath: str,
    days_back: int = 21,
    lat_min: float = 0.0,
    lat_max: float = 28.0,
    lon_min: float = 60.0,
    lon_max: float = 100.0,
    erddap_base_url: str = DEFAULT_ERDDAP_URL,
    timeout_seconds: float = 180.0,
) -> Dict[str, Any]:
    """Refresh the live Argo cache (``output_filepath``, JSON).

    On any failure the previous cache is left untouched.
    """
    now = datetime.now(timezone.utc)
    t0 = now - timedelta(days=days_back)
    try:
        profiles, stats = query_argo_erddap(lat_min, lat_max, lon_min, lon_max, t0, now,
                                            erddap_base_url=erddap_base_url, timeout_seconds=timeout_seconds)
    except Exception as e:
        logger.error("Argo ERDDAP query failed (%s); keeping existing cache", e)
        return {"status": "error", "message": str(e), "is_live_ingested": False}

    if not profiles:
        return {"status": "empty", "message": "ERDDAP returned no QC-passing profiles", "is_live_ingested": False}

    payload = {
        "ingested_at": now.isoformat(),
        "source": SOURCE_NAME,
        "window": {"start": t0.isoformat(), "end": now.isoformat(), "days": days_back},
        "bounds": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
        "qc_policy": "direction=A; position/time QC in {1,2}; level pres/temp QC in {1,2}; "
                     "adjusted values for data_mode A/D; Saunders (1981) pressure→depth",
        "stats": stats,
        "profiles": profiles,
    }
    os.makedirs(os.path.dirname(os.path.abspath(output_filepath)), exist_ok=True)
    tmp = output_filepath + ".partial"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    os.replace(tmp, output_filepath)
    logger.info("Argo cache refreshed: %d profiles from %d floats (%d levels kept, %d rejected)",
                stats["profiles_kept"], stats["unique_floats"], stats["levels_kept"], stats["levels_rejected"])
    return {"status": "success", "is_live_ingested": True, "cache_filepath": output_filepath,
            "timestamp": now.isoformat(), **{k: v for k, v in stats.items() if k != "query_url"}}
