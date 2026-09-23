"""Shared upper-ocean physics used by the live pipeline, the cyclone
backtest and the model-skill scorer.

Every function here works on a single real vertical profile (Argo or model
column) and never fills gaps: if a quantity cannot be computed from the data
it returns None, and callers must surface that honestly.
"""
from __future__ import annotations

import math
from typing import Optional, Sequence, Dict, Any

import numpy as np

# rho * Cp expressed per cm^2 per metre per °C:
# 1025 kg/m^3 * 3985 J/(kg·K) * 1e-4 m^2/cm^2 * 1e-3 kJ/J ≈ 0.4085 kJ/(cm^2·m·°C)
TCHP_FACTOR = 0.4085
TCHP_RI_THRESHOLD = 50.0  # kJ/cm^2 — widely used RI-supportive threshold (Shay et al. 2000)


def pressure_to_depth(pres_dbar: Sequence[float], lat: float) -> np.ndarray:
    """Saunders (1981) pressure→depth conversion, accurate to ~0.1% in the upper 1000 m."""
    p = np.asarray(pres_dbar, dtype=np.float64)
    s2 = math.sin(math.radians(lat)) ** 2
    c1 = (5.92 + 5.25 * s2) * 1e-3
    return (1.0 - c1) * p - 2.21e-6 * p * p


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _clean(depths: Sequence[float], temps: Sequence[Optional[float]]):
    d = np.asarray([np.nan if x is None else x for x in depths], dtype=np.float64)
    t = np.asarray([np.nan if x is None else x for x in temps], dtype=np.float64)
    ok = np.isfinite(d) & np.isfinite(t)
    d, t = d[ok], t[ok]
    order = np.argsort(d)
    d, t = d[order], t[order]
    # Drop duplicate depths (keep first) so interpolation is well-defined.
    if len(d):
        keep = np.concatenate([[True], np.diff(d) > 0])
        d, t = d[keep], t[keep]
    return d, t


def temp_at(depths, temps, z: float) -> Optional[float]:
    d, t = _clean(depths, temps)
    if len(d) < 2 or z < d[0] - 5.0 or z > d[-1]:
        return None
    return float(np.interp(z, d, t))


def upper_ocean_metrics(depths: Sequence[float], temps: Sequence[Optional[float]]) -> Dict[str, Any]:
    """Compute SST, T50, T100, D26, TCHP, MLD and T0-100 mean from one profile.

    - SST: shallowest valid sample within the top 10 m.
    - D26 / TCHP: trapezoidal integral of (T - 26) from the surface to the 26 °C
      isotherm. If the profile never reaches below D26 the TCHP is undefined
      (None) rather than truncated, so shallow profiles cannot fake low heat.
    - MLD: depth where T drops 0.5 °C below the 10 m temperature (de Boyer
      Montégut-style temperature criterion).
    """
    d, t = _clean(depths, temps)
    out: Dict[str, Any] = {
        "sst": None, "t50": None, "t100": None, "d26": None,
        "tchp": None, "mld": None, "t0_100": None, "max_depth": float(d[-1]) if len(d) else None,
        "n_levels": int(len(d)),
    }
    if len(d) < 3 or d[0] > 10.0:
        return out

    out["sst"] = round(float(t[0]), 3)
    t50 = temp_at(d, t, 50.0)
    t100 = temp_at(d, t, 100.0)
    out["t50"] = None if t50 is None else round(t50, 3)
    out["t100"] = None if t100 is None else round(t100, 3)

    if d[-1] >= 100.0:
        grid = np.linspace(0.0, 100.0, 101)
        vals = np.interp(grid, d, t)
        out["t0_100"] = round(float(np.mean(vals)), 3)

    # Mixed layer depth (0.5 °C criterion relative to ~10 m)
    t_ref = temp_at(d, t, 10.0)
    if t_ref is None:
        t_ref = float(t[0])
    below = np.where((d > 10.0) & (t <= t_ref - 0.5))[0]
    if len(below):
        k = int(below[0])
        if k > 0 and t[k - 1] != t[k]:
            f = (t[k - 1] - (t_ref - 0.5)) / (t[k - 1] - t[k])
            out["mld"] = round(float(d[k - 1] + f * (d[k] - d[k - 1])), 1)
        else:
            out["mld"] = round(float(d[k]), 1)

    # D26 & TCHP
    if t[0] < 26.0:
        out["d26"] = 0.0
        out["tchp"] = 0.0
        return out

    integral = 0.0
    d26 = None
    for i in range(len(d) - 1):
        z1, z2, t1, t2 = d[i], d[i + 1], t[i], t[i + 1]
        dz = z2 - z1
        if t1 >= 26.0 and t2 >= 26.0:
            integral += 0.5 * ((t1 - 26.0) + (t2 - 26.0)) * dz
        elif t1 >= 26.0 > t2:
            f = (t1 - 26.0) / max(t1 - t2, 1e-6)
            integral += 0.5 * (t1 - 26.0) * f * dz
            d26 = z1 + f * dz
            break
    # Surface layer above the first sample (≤10 m) — assume well mixed.
    integral += max(t[0] - 26.0, 0.0) * d[0]

    if d26 is None:
        # Profile ended while still warmer than 26 °C: D26 is deeper than we
        # observed, so TCHP cannot be computed honestly.
        return out

    out["d26"] = round(float(d26), 1)
    out["tchp"] = round(float(integral * TCHP_FACTOR), 2)
    return out
