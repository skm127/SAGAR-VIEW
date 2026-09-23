"""Cyclone rapid-intensification (RI) backtest engine — Argo-only, real data.

Question answered: *using only ocean observations available before the storm,
would an anomaly detector have flagged the pre-storm upper ocean as unusual,
and how early relative to the storm's actual RI onset?*

Method (identical for historical case studies and live storms):

1. Track — IBTrACS best track (or GDACS for live storms). RI onset = first time
   the 1-min max wind rises by ≥ 30 kt within 24 h (Kaplan & DeMaria 2003).
2. Storm-year ocean — every QC'd Argo profile within ``radius_km`` of the
   pre-peak track, sampled *before the storm reached the nearest track point*
   (so post-storm cold wakes are excluded), from ``lead_days`` before genesis.
3. Climatology — the same space (same track corridor) and the same calendar
   window in the previous ``clim_years`` years.
4. Physics per profile — SST, T100, D26, TCHP, T(0–100 m) via
   app.services.ocean_physics (no gap filling; undefined → dropped).
5. ML — Isolation Forest fit on the standardized climatology features. A
   profile is *flagged* when the forest calls it an outlier AND it is on the
   warm side (TCHP or T0–100 z-score ≥ +1). Baseline for comparison: the fixed
   TCHP ≥ 50 kJ/cm² threshold.
6. Honesty — false-alarm rate estimated by leave-one-year-out over the
   climatology years, all sample counts reported, and insufficient data is
   reported as such (never padded).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

import numpy as np

from app.ingestion.argo_ingest import query_argo_erddap
from app.services.ocean_physics import upper_ocean_metrics, haversine_km, TCHP_RI_THRESHOLD

logger = logging.getLogger(__name__)

FEATURES = ["sst", "t100", "d26", "tchp", "t0_100"]
RI_THRESHOLD_KT = 30.0


def parse_time(s: str) -> datetime:
    s = s.replace("Z", "+00:00").replace(" ", "T")
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def detect_ri(track: List[Dict[str, Any]], wind_key: str = "wind_kt") -> Optional[Dict[str, Any]]:
    """First 24-h window with ΔV ≥ 30 kt, using synoptic (6-hourly) fixes."""
    pts = [p for p in track if p.get(wind_key) is not None]
    pts = [p for p in pts if parse_time(p["time"]).hour % 6 == 0]
    for i, p in enumerate(pts):
        t0 = parse_time(p["time"])
        for q in pts[i + 1:]:
            dt_h = (parse_time(q["time"]) - t0).total_seconds() / 3600.0
            if dt_h > 24.0:
                break
            if abs(dt_h - 24.0) < 1e-6 and q[wind_key] - p[wind_key] >= RI_THRESHOLD_KT:
                return {"onset_time": p["time"], "onset_wind_kt": p[wind_key], "wind_24h_later_kt": q[wind_key],
                        "delta_kt_24h": q[wind_key] - p[wind_key], "lat": p["lat"], "lon": p["lon"],
                        "definition": "ΔVmax ≥ 30 kt in 24 h (Kaplan & DeMaria 2003), 1-min sustained winds"}
    return None


def _nearest_track(lat: float, lon: float, track: List[Dict[str, Any]]) -> Tuple[float, datetime]:
    best, best_t = 1e9, None
    for p in track:
        d = haversine_km(lat, lon, p["lat"], p["lon"])
        if d < best:
            best, best_t = d, parse_time(p["time"])
    return best, best_t


def _profile_metrics(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    m = upper_ocean_metrics(p["depths"], p["temperatures"])
    if any(m.get(f) is None for f in FEATURES):
        return None
    return m


def _corridor(profiles, track, radius_km, before_passage: bool):
    out = []
    for p in profiles:
        d, t_pass = _nearest_track(p["latitude"], p["longitude"], track)
        if d > radius_km:
            continue
        t_obs = parse_time(p["timestamp"])
        if before_passage and t_pass is not None and t_obs >= t_pass:
            continue
        m = _profile_metrics(p)
        if m is None:
            continue
        out.append({"profile": p, "metrics": m, "dist_km": d, "time": t_obs,
                    "hours_before_passage": (t_pass - t_obs).total_seconds() / 3600.0 if t_pass else None})
    return out


def _fit_forest(X: np.ndarray, seed: int = 42):
    from sklearn.ensemble import IsolationForest
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd = np.where(sd < 1e-6, 1.0, sd)
    model = IsolationForest(n_estimators=300, contamination=0.10, random_state=seed).fit((X - mu) / sd)
    return model, mu, sd


def _flag(model, mu, sd, x: np.ndarray) -> Tuple[bool, float, Dict[str, float]]:
    z = (x - mu) / sd
    is_out = bool(model.predict(z.reshape(1, -1))[0] == -1)
    score = float(-model.decision_function(z.reshape(1, -1))[0])  # >0 = more anomalous
    zmap = {f: float(z[i]) for i, f in enumerate(FEATURES)}
    warm = zmap["tchp"] >= 1.0 or zmap["t0_100"] >= 1.0
    return is_out and warm, score, zmap


def run_backtest(storm: Dict[str, Any], lead_days: int = 21, clim_years: int = 8,
                 radius_km: float = 400.0, now: Optional[datetime] = None, live: bool = False) -> Dict[str, Any]:
    """Run the RI backtest for one storm dict: {name, season, sid, track:[{time,lat,lon,wind_kt}]}."""
    track = sorted(storm["track"], key=lambda p: p["time"])
    if len(track) < 2:
        return {"status": "insufficient_track", "storm": storm.get("name")}
    winds = [p.get("wind_kt") or 0 for p in track]
    peak_i = int(np.argmax(winds))
    pre_peak = track[: peak_i + 1]
    genesis = parse_time(track[0]["time"])
    peak_t = parse_time(track[peak_i]["time"])
    end_t = min(peak_t, now) if now else peak_t
    ri = None if live else detect_ri(track)

    lats = [p["lat"] for p in pre_peak]
    lons = [p["lon"] for p in pre_peak]
    pad = radius_km / 111.0 + 0.5
    bbox = (max(-5.0, min(lats) - pad), min(35.0, max(lats) + pad), min(lons) - pad, max(lons) + pad)
    w_start = genesis - timedelta(days=lead_days)

    # ── Storm-year observations ─────────────────────────────────────────
    storm_profiles, storm_stats = query_argo_erddap(*bbox, w_start, end_t, pres_max=500.0)
    storm_rows = _corridor(storm_profiles, pre_peak, radius_km, before_passage=True)

    # ── Climatology: same corridor, same calendar window, previous years ─
    clim_rows_by_year: Dict[int, List[Dict[str, Any]]] = {}
    clim_query_stats = []
    for k in range(1, clim_years + 1):
        y_shift = timedelta(days=round(365.25 * k))
        a, b = w_start - y_shift, end_t - y_shift
        try:
            profs, st = query_argo_erddap(*bbox, a, b, pres_max=500.0)
        except Exception as e:
            logger.warning("Climatology query for year -%d failed: %s", k, e)
            clim_query_stats.append({"year": (w_start - y_shift).year, "error": str(e)})
            continue
        rows = _corridor(profs, pre_peak, radius_km, before_passage=False)
        clim_rows_by_year[(w_start - y_shift).year] = rows
        clim_query_stats.append({"year": (w_start - y_shift).year, "profiles_in_corridor": len(rows),
                                 "profiles_qc_passed_in_box": st.get("profiles_kept", 0)})

    clim_rows = [r for rows in clim_rows_by_year.values() for r in rows]
    base = {
        "storm": {k: storm.get(k) for k in ("name", "season", "sid", "basin", "subbasin")},
        "mode": "live" if live else "backtest",
        "genesis_time": genesis.isoformat(),
        "peak_time": peak_t.isoformat(),
        "peak_wind_kt": winds[peak_i],
        "ri": ri,
        "track": track,
        "method": {
            "radius_km": radius_km, "lead_days": lead_days, "clim_years": clim_years,
            "features": FEATURES,
            "flag_rule": "IsolationForest outlier (contamination 0.10, fit on climatology) AND warm side (z_TCHP ≥ +1 or z_T0–100 ≥ +1)",
            "threshold_baseline": f"TCHP ≥ {TCHP_RI_THRESHOLD} kJ/cm²",
            "pre_storm_only": "profiles sampled after the storm passed their nearest track point are excluded",
            "bbox": {"lat_min": bbox[0], "lat_max": bbox[1], "lon_min": bbox[2], "lon_max": bbox[3]},
            "window": {"start": w_start.isoformat(), "end": end_t.isoformat()},
            "data_source": "Argo GDAC via Ifremer ERDDAP (QC 1/2 only) + IBTrACS v04r01 best track",
        },
        "counts": {
            "storm_year_profiles_in_box": storm_stats.get("profiles_kept", 0),
            "storm_year_profiles_pre_storm_in_corridor": len(storm_rows),
            "climatology_profiles": len(clim_rows),
            "climatology_years_with_data": sum(1 for v in clim_rows_by_year.values() if v),
            "climatology_by_year": clim_query_stats,
        },
    }
    if len(clim_rows) < 25 or len(storm_rows) < 3:
        return {**base, "status": "insufficient_data",
                "message": f"Need ≥25 climatology and ≥3 pre-storm corridor profiles; have {len(clim_rows)} and {len(storm_rows)}."}

    Xc = np.array([[r["metrics"][f] for f in FEATURES] for r in clim_rows], dtype=float)
    model, mu, sd = _fit_forest(Xc)

    # Leave-one-year-out false-alarm estimate
    loyo = []
    for y, rows in clim_rows_by_year.items():
        if len(rows) < 3:
            continue
        train = [r for yy, rr in clim_rows_by_year.items() if yy != y for r in rr]
        if len(train) < 20:
            continue
        m2, mu2, sd2 = _fit_forest(np.array([[r["metrics"][f] for f in FEATURES] for r in train], dtype=float))
        flags = [_flag(m2, mu2, sd2, np.array([r["metrics"][f] for f in FEATURES]))[0] for r in rows]
        loyo.append({"year": y, "n": len(rows), "flag_rate": round(float(np.mean(flags)), 3)})
    far = round(float(np.average([l["flag_rate"] for l in loyo], weights=[l["n"] for l in loyo])), 3) if loyo else None

    clim_tchp = Xc[:, FEATURES.index("tchp")]
    timeline = []
    for r in sorted(storm_rows, key=lambda r: r["time"]):
        x = np.array([r["metrics"][f] for f in FEATURES], dtype=float)
        flagged, score, z = _flag(model, mu, sd, x)
        timeline.append({
            "time": r["time"].isoformat(),
            "platform_id": r["profile"]["platform_id"],
            "profile_id": r["profile"]["id"],
            "lat": r["profile"]["latitude"], "lon": r["profile"]["longitude"],
            "dist_to_track_km": round(r["dist_km"], 1),
            "hours_before_passage": round(r["hours_before_passage"], 1) if r["hours_before_passage"] is not None else None,
            **{f: r["metrics"][f] for f in FEATURES},
            "mld": r["metrics"].get("mld"),
            "z": {k: round(v, 2) for k, v in z.items()},
            "anomaly_score": round(score, 4),
            "ml_flag": flagged,
            "above_threshold": r["metrics"]["tchp"] >= TCHP_RI_THRESHOLD,
        })

    first_flag = next((t for t in timeline if t["ml_flag"]), None)
    first_thr = next((t for t in timeline if t["above_threshold"]), None)

    # A single flag is expected by chance when many profiles are scored, so we
    # also test whether the storm-window flag RATE exceeds the climatological
    # (leave-one-year-out) rate, and find the first time the cumulative
    # evidence becomes significant (one-sided binomial, p < 0.05, ≥ 2 flags).
    from scipy.stats import binomtest
    p0 = max(far or 0.0, 0.01)
    n_flag_total = sum(t["ml_flag"] for t in timeline)
    p_value = float(binomtest(n_flag_total, len(timeline), p0, alternative="greater").pvalue) if timeline else None
    first_sig = None
    k = 0
    for i, t in enumerate(timeline, start=1):
        k += int(t["ml_flag"])
        if k >= 2 and binomtest(k, i, p0, alternative="greater").pvalue < 0.05:
            first_sig = {**t, "cumulative_flags": k, "cumulative_profiles": i,
                         "p_value": round(float(binomtest(k, i, p0, alternative="greater").pvalue), 4)}
            break
    ri_t = parse_time(ri["onset_time"]) if ri else None

    def lead(ev):
        if ev is None or ri_t is None:
            return None
        return round((ri_t - parse_time(ev["time"])).total_seconds() / 3600.0, 1)

    clim_above = float(np.mean(clim_tchp >= TCHP_RI_THRESHOLD))
    storm_tchp = np.array([t["tchp"] for t in timeline])
    result = {
        **base,
        "status": "ok",
        "climatology": {
            "tchp_mean": round(float(clim_tchp.mean()), 1), "tchp_std": round(float(clim_tchp.std()), 1),
            "tchp_p90": round(float(np.percentile(clim_tchp, 90)), 1),
            "pct_profiles_above_threshold": round(clim_above * 100.0, 1),
            "feature_means": {f: round(float(mu[i]), 3) for i, f in enumerate(FEATURES)},
            "feature_stds": {f: round(float(sd[i]), 3) for i, f in enumerate(FEATURES)},
        },
        "storm_year": {
            "tchp_mean": round(float(storm_tchp.mean()), 1),
            "tchp_max": round(float(storm_tchp.max()), 1),
            "tchp_anomaly_vs_clim": round(float(storm_tchp.mean() - clim_tchp.mean()), 1),
            "n_flagged": int(n_flag_total),
            "n_above_threshold": int(sum(t["above_threshold"] for t in timeline)),
            "flag_rate": round(n_flag_total / len(timeline), 3) if timeline else None,
            "binomial_p_value_vs_climatology": round(p_value, 4) if p_value is not None else None,
            "signal_significant": bool(p_value is not None and p_value < 0.05),
        },
        "false_alarm": {"leave_one_year_out": loyo, "weighted_flag_rate": far},
        "events": {
            "first_ml_flag": first_flag,
            "first_significant_signal": first_sig,
            "first_threshold_crossing": first_thr,
            "ml_lead_time_hours_before_ri": lead(first_flag),
            "significant_lead_time_hours_before_ri": lead(first_sig),
            "threshold_lead_time_hours_before_ri": lead(first_thr),
        },
        "timeline": timeline,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    result["verdict"] = _verdict(result, clim_above, far)
    return result


def _verdict(r: Dict[str, Any], clim_above: float, far: Optional[float]) -> Dict[str, str]:
    ev = r["events"]
    name = r["storm"]["name"].title() if r["storm"].get("name") else "This storm"
    parts = []
    sy = r["storm_year"]
    rate_txt = (f"{sy['n_flagged']} of {len(r['timeline'])} pre-storm corridor profiles flagged "
                f"({(sy['flag_rate'] or 0) * 100:.0f}% vs {(far or 0) * 100:.0f}% in climatology, "
                f"binomial p = {sy['binomial_p_value_vs_climatology']})")
    if r.get("mode") == "live":
        anom = sy["tchp_anomaly_vs_clim"]
        parts.append(f"{rate_txt}; corridor-mean TCHP is {anom:+.1f} kJ/cm² vs the same-season climatology.")
        return {"headline": "Significant warm-ocean anomaly ahead" if sy["signal_significant"] else "Ocean ahead within climatology",
                "summary": " ".join(parts)}
    if r.get("ri") is None:
        parts.append(f"{name} did not meet the RI criterion in the best track, so no lead time is defined.")
    ml, thr = ev["ml_lead_time_hours_before_ri"], ev["threshold_lead_time_hours_before_ri"]
    sig = ev.get("significant_lead_time_hours_before_ri")
    parts.append(rate_txt + ".")
    if sig is not None and sig > 0:
        parts.append(f"The anomaly became statistically significant {sig / 24:.1f} days before RI onset.")
    elif ml is not None and ml > 0:
        parts.append(f"A first isolated flag appeared {ml / 24:.1f} days before RI, but the flag rate never became "
                     f"statistically distinguishable from climatology before RI — treated as no early signal.")
    elif r.get("ri") is not None:
        parts.append("The Isolation Forest did not flag the pre-storm ocean before RI onset.")
    if clim_above >= 0.8:
        parts.append(f"The fixed 50 kJ/cm² threshold is non-discriminating here: {clim_above * 100:.0f}% of climatological "
                     f"profiles in this corridor already exceed it.")
    elif thr is not None and thr > 0:
        parts.append(f"The fixed TCHP ≥ 50 kJ/cm² threshold was first met {thr / 24:.1f} days before RI.")
    if far is not None:
        parts.append(f"Climatological false-alarm rate (leave-one-year-out): {far * 100:.0f}% of profiles.")
    headline = ("Significant early warm-ocean signal" if (sig is not None and sig > 0)
                else "No significant early signal")
    return {"headline": headline, "summary": " ".join(parts)}
