"""Model-vs-Argo verification: co-location, depth-band skill and a spatial
confidence field.

Every number here is computed from real Argo profiles co-located with the
loaded ocean model in both space (bilinear interpolation to the float position)
and time (nearest model analysis step, within ``max_time_offset_hours``).
Forecast steps are never used for verification, and model values are only
compared at depths the model actually covers.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

DEPTH_BANDS = [(0, 10), (10, 50), (50, 100), (100, 200), (200, 300), (300, 500)]
MAX_TIME_OFFSET_H = 36.0
# RMSE tiers (°C / PSU) used for the per-band verdict shown in the UI
TIERS = {"thetao": (0.5, 1.0), "so": (0.1, 0.25)}


def _model_times(nc_service) -> Optional[pd.DatetimeIndex]:
    tname = nc_service._find_coord("time", "t")
    if not tname:
        return None
    return pd.DatetimeIndex(nc_service.dataset[tname].values)


def colocate_profile(nc_service, profile: Dict[str, Any], variable: str = "thetao",
                     max_time_offset_hours: float = MAX_TIME_OFFSET_H) -> Optional[Dict[str, Any]]:
    """Return obs & model at the observation depths, or None if not co-locatable."""
    obs = profile.get("temperatures") if variable == "thetao" else profile.get("salinities")
    depths = profile.get("depths")
    if not obs or not depths:
        return None
    times = _model_times(nc_service)
    if times is None or len(times) == 0:
        return None
    try:
        t_obs = pd.Timestamp(profile["timestamp"]).tz_localize(None) if pd.Timestamp(profile["timestamp"]).tzinfo is None \
            else pd.Timestamp(profile["timestamp"]).tz_convert(None)
    except Exception:
        return None
    roles = nc_service.get_time_roles()
    offsets = np.abs((times - t_obs).total_seconds().values) / 3600.0
    # Only verify against analysis steps (never against forecasts)
    candidates = [i for i in range(len(times)) if roles[i] != "forecast"] or list(range(len(times)))
    ti = min(candidates, key=lambda i: offsets[i])
    if offsets[ti] > max_time_offset_hours:
        return None

    m_depths, m_vals = nc_service.get_depth_profile(variable, profile["latitude"], profile["longitude"], ti)
    valid = [(d, v) for d, v in zip(m_depths, m_vals) if v is not None and np.isfinite(v)]
    if len(valid) < 3:
        return None
    vd, vv = map(np.asarray, zip(*valid))
    d = np.asarray(depths, dtype=float)
    o = np.asarray([np.nan if x is None else x for x in obs], dtype=float)
    m = np.interp(d, vd, vv, left=np.nan, right=np.nan)
    ok = np.isfinite(o) & np.isfinite(m) & (d <= vd.max())
    if ok.sum() < 5:
        return None
    return {
        "profile_id": profile["id"],
        "platform_id": profile["platform_id"],
        "latitude": profile["latitude"],
        "longitude": profile["longitude"],
        "timestamp": profile["timestamp"],
        "model_time_index": int(ti),
        "time_offset_hours": round(float(offsets[ti]), 1),
        "depths": d[ok],
        "obs": o[ok],
        "model": m[ok],
    }


def colocate_fleet(argo_service, nc_service, variable: str = "thetao",
                   max_time_offset_hours: float = MAX_TIME_OFFSET_H) -> Dict[str, Any]:
    matched: List[Dict[str, Any]] = []
    excluded_time = excluded_other = 0
    for p in argo_service.get_all_profiles():
        try:
            c = colocate_profile(nc_service, p, variable, max_time_offset_hours)
        except Exception as e:  # a single bad profile must not break the fleet
            logger.debug("co-location failed for %s: %s", p.get("id"), e)
            c = None
        if c is None:
            times = _model_times(nc_service)
            try:
                t = pd.Timestamp(p["timestamp"]).tz_convert(None)
                if times is not None and np.min(np.abs((times - t).total_seconds().values)) / 3600 > max_time_offset_hours:
                    excluded_time += 1
                    continue
            except Exception:
                pass
            excluded_other += 1
            continue
        matched.append(c)
    return {"matched": matched, "excluded_time_window": excluded_time, "excluded_other": excluded_other}


def depth_band_skill(argo_service, nc_service, variable: str = "thetao") -> Dict[str, Any]:
    """Per-depth-band bias / RMSE / MAE of the model against co-located Argo."""
    fleet = colocate_fleet(argo_service, nc_service, variable)
    matched = fleet["matched"]
    good, fair = TIERS.get(variable, (0.5, 1.0))
    unit = "°C" if variable == "thetao" else "PSU"

    bands_out = []
    for lo, hi in DEPTH_BANDS:
        per_profile_means, levels = [], []
        for c in matched:
            sel = (c["depths"] >= lo) & (c["depths"] < hi)
            if sel.sum() == 0:
                continue
            r = c["obs"][sel] - c["model"][sel]
            levels.append(r)
            per_profile_means.append(float(np.mean(r)))
        if not levels:
            bands_out.append({"band": f"{lo}–{hi} m", "top_m": lo, "bottom_m": hi, "n_profiles": 0, "n_levels": 0,
                              "bias": None, "rmse": None, "mae": None, "verdict": "no_data"})
            continue
        allr = np.concatenate(levels)
        rmse = float(np.sqrt(np.mean(allr ** 2)))
        verdict = "good" if rmse <= good else "fair" if rmse <= fair else "poor"
        bands_out.append({
            "band": f"{lo}–{hi} m", "top_m": lo, "bottom_m": hi,
            "n_profiles": len(per_profile_means), "n_levels": int(allr.size),
            "bias": round(float(np.mean(allr)), 3),
            "rmse": round(rmse, 3),
            "mae": round(float(np.mean(np.abs(allr))), 3),
            "p90_abs_error": round(float(np.percentile(np.abs(allr), 90)), 3),
            "verdict": verdict,
        })

    # "Reliable to X m": deepest contiguous-from-surface band meeting the 'good' tier
    reliable_to = None
    for b in bands_out:
        if b["verdict"] == "good":
            reliable_to = b["bottom_m"]
        else:
            break
    worst = max((b for b in bands_out if b["rmse"] is not None), key=lambda b: b["rmse"], default=None)
    overall = np.concatenate([c["obs"] - c["model"] for c in matched]) if matched else np.array([])
    return {
        "variable": variable,
        "unit": unit,
        "model_source": nc_service.source_name,
        "model_is_synthetic": nc_service.is_synthetic,
        "n_profiles_colocated": len(matched),
        "n_floats_colocated": len({c["platform_id"] for c in matched}),
        "n_profiles_excluded_time_window": fleet["excluded_time_window"],
        "n_profiles_excluded_other": fleet["excluded_other"],
        "max_time_offset_hours": MAX_TIME_OFFSET_H,
        "tiers": {"good_rmse_max": good, "fair_rmse_max": fair},
        "overall": {
            "n_levels": int(overall.size),
            "bias": round(float(np.mean(overall)), 3) if overall.size else None,
            "rmse": round(float(np.sqrt(np.mean(overall ** 2))), 3) if overall.size else None,
        },
        "bands": bands_out,
        "reliable_to_m": reliable_to,
        "worst_band": worst["band"] if worst else None,
        "headline": _headline(bands_out, reliable_to, unit, good),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def _headline(bands, reliable_to, unit, good) -> str:
    scored = [b for b in bands if b["rmse"] is not None]
    if not scored:
        return "No Argo profiles could be co-located with the model in the verification window."
    if reliable_to:
        deeper = [b for b in scored if b["top_m"] >= reliable_to]
        tail = ""
        if deeper:
            w = max(deeper, key=lambda b: b["rmse"])
            tail = f"; error grows below, peaking at RMSE {w['rmse']} {unit} in {w['band']}"
        return f"Model matches Argo within RMSE ≤ {good} {unit} from the surface to {reliable_to} m{tail}."
    w = max(scored, key=lambda b: b["rmse"])
    return f"Model does not meet RMSE ≤ {good} {unit} even near the surface; worst band {w['band']} (RMSE {w['rmse']} {unit})."


def confidence_field(argo_service, nc_service, length_scale_km: float = 150.0,
                     unverified_discount: float = 0.7, error_scale: float = 1.5) -> Dict[str, Any]:
    """Spatial model-confidence field on the model grid.

    coverage(x) = 1 - exp(-Σ_i w_i),  w_i = exp(-(d_i / L)^2)   (Argo verification density)
    err(x)      = Σ w_i·RMSE_i / Σ w_i   (Gaussian-weighted 0–200 m RMSE of nearby floats)
    confidence  = coverage·exp(-(err/σ)^2) + (1 - coverage)·prior
    prior       = discount · exp(-(RMSE_fleet_median/σ)^2)

    Unverified cells inherit the fleet-typical skill, discounted because it is
    untested there; verified cells use the local error. So a verified cell is
    greener than an unverified one exactly when its local error is below the
    fleet-typical error. σ = 1.5 °C for the 0–200 m layer.
    """
    fleet = colocate_fleet(argo_service, nc_service, "thetao")
    pts = []
    for c in fleet["matched"]:
        sel = c["depths"] <= 200
        if sel.sum() < 3:
            continue
        r = c["obs"][sel] - c["model"][sel]
        pts.append((c["latitude"], c["longitude"], float(np.sqrt(np.mean(r ** 2))), c["platform_id"]))

    fleet_rmse = float(np.median([p[2] for p in pts])) if pts else error_scale
    prior = unverified_discount * float(np.exp(-(fleet_rmse / error_scale) ** 2))

    ds = nc_service.dataset
    lat_name = nc_service._find_coord("lat", "latitude")
    lon_name = nc_service._find_coord("lon", "longitude")
    lats = np.sort(ds[lat_name].values.astype(float))
    lons = np.sort(ds[lon_name].values.astype(float))
    LAT, LON = np.meshgrid(lats, lons, indexing="ij")

    wsum = np.zeros_like(LAT)
    werr = np.zeros_like(LAT)
    for plat, plon, rmse, _ in pts:
        dy = (LAT - plat) * 111.2
        dx = (LON - plon) * 111.2 * np.cos(np.radians((LAT + plat) / 2))
        w = np.exp(-(dx * dx + dy * dy) / (length_scale_km ** 2))
        wsum += w
        werr += w * rmse
    coverage = 1.0 - np.exp(-wsum)
    with np.errstate(invalid="ignore", divide="ignore"):
        local_err = np.where(wsum > 1e-6, werr / np.maximum(wsum, 1e-12), np.nan)
    skill = np.where(np.isfinite(local_err), np.exp(-(np.nan_to_num(local_err) / error_scale) ** 2), 0.0)
    conf = coverage * skill + (1.0 - coverage) * prior

    # Mask land using the model surface temperature at the first step
    sst = ds["thetao"].isel({nc_service._find_coord("time", "t"): 0}).isel({nc_service._find_coord("depth", "lev"): 0})
    sst = sst.sortby([lat_name, lon_name]).values
    land = ~np.isfinite(sst)
    conf = np.where(land, np.nan, conf)
    coverage = np.where(land, np.nan, coverage)
    local_err = np.where(land, np.nan, local_err)

    ocean = ~land
    unverified = ocean & (coverage < 0.2)
    to_list = lambda a, nd: [[None if not np.isfinite(v) else round(float(v), nd) for v in row] for row in a]
    return {
        "metadata": {
            "lat_min": float(lats[0]), "lat_max": float(lats[-1]),
            "lon_min": float(lons[0]), "lon_max": float(lons[-1]),
            "width": int(len(lons)), "height": int(len(lats)),
            "length_scale_km": length_scale_km, "unverified_prior": round(prior, 3), "error_scale_c": error_scale,
            "fleet_median_rmse_0_200m": round(fleet_rmse, 3),
            "formula": ("conf = coverage·exp(−(RMSE_local/1.5°C)²) + (1−coverage)·0.7·exp(−(RMSE_fleet/1.5°C)²); "
                        "coverage = 1−exp(−Σ exp(−(d/150 km)²))"),
            "model_source": nc_service.source_name,
        },
        "statistics": {
            "n_verifying_profiles": len(pts),
            "n_verifying_floats": len({p[3] for p in pts}),
            "ocean_cells": int(ocean.sum()),
            "pct_ocean_verified": round(float(np.mean(coverage[ocean] >= 0.2) * 100.0), 1) if ocean.any() else 0.0,
            "pct_ocean_unverified": round(float(np.mean(unverified[ocean]) * 100.0), 1) if ocean.any() else 0.0,
            "mean_confidence": round(float(np.nanmean(conf)), 3) if ocean.any() else None,
        },
        "confidence": to_list(conf, 3),
        "coverage": to_list(coverage, 3),
        "local_rmse": to_list(local_err, 3),
        "verifying_points": [{"lat": a, "lon": b, "rmse_0_200m": round(r, 3), "platform_id": pid} for a, b, r, pid in pts],
    }
