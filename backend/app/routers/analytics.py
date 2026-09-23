
from fastapi import APIRouter, Request, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Literal, Optional, Any
from datetime import datetime, timezone
import numpy as np
import math
from ..models.schemas import (
    HeatPotentialResponse,
    HeatPotentialPoint,
    CoLocationResponse,
)


router = APIRouter(prefix="/api/analytics", tags=["Analytics & Spatial Intelligence"])


class BoundingBoxRequest(BaseModel):
    lat_min: float = Field(ge=-90.0, le=90.0)
    lat_max: float = Field(ge=-90.0, le=90.0)
    lon_min: float = Field(ge=-180.0, le=180.0)
    lon_max: float = Field(ge=-180.0, le=180.0)
    depth: float = Field(default=0.0, ge=0.0, le=11000.0)
    time_index: int = Field(default=0, ge=0)
    variable: Literal["thetao", "so", "uo", "vo"] = "thetao"


class TransectRequest(BaseModel):
    lat1: float = Field(ge=-90.0, le=90.0)
    lon1: float = Field(ge=-180.0, le=180.0)
    lat2: float = Field(ge=-90.0, le=90.0)
    lon2: float = Field(ge=-180.0, le=180.0)
    variable: Literal["thetao", "so", "uo", "vo"] = "thetao"
    time_index: int = Field(default=0, ge=0)
    num_samples: int = Field(default=25, ge=5, le=50)


class AiQueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1_000)
    lat: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    lon: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    depth: Optional[float] = Field(default=None, ge=0.0, le=11000.0)
    profile_id: Optional[str] = None
    time_index: int = Field(default=0, ge=0)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great circle distance in km."""
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def degrees_to_compass(degrees: float) -> str:
    """Convert meteorological or mathematical degrees to 16-wind compass direction."""
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    ix = round(degrees / 22.5) % 16
    return dirs[ix]


@router.post("/region/stats")
def calculate_region_stats(payload: BoundingBoxRequest, request: Request):
    """Calculate comprehensive statistical telemetry over a geographic bounding box."""
    nc_service = request.app.state.nc_service
    argo_service = request.app.state.argo_service
    cache_service = getattr(request.app.state, "cache_service", None)

    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")

    lat_min = min(payload.lat_min, payload.lat_max)
    lat_max = max(payload.lat_min, payload.lat_max)
    lon_min = min(payload.lon_min, payload.lon_max)
    lon_max = max(payload.lon_min, payload.lon_max)

    cache_key = f"region_stats:{lat_min}:{lat_max}:{lon_min}:{lon_max}:{payload.depth}:{payload.time_index}:{payload.variable}"
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    mean_lat_rad = math.radians((lat_min + lat_max) / 2.0)
    d_lat_km = (lat_max - lat_min) * 111.0
    d_lon_km = (lon_max - lon_min) * 111.0 * math.cos(mean_lat_rad)
    area_km2 = round(abs(d_lat_km * d_lon_km), 2)

    try:
        temp_arr, _ = nc_service.get_depth_slice(
            variable="thetao",
            depth=payload.depth,
            time_index=payload.time_index,
            lat_range=(lat_min, lat_max),
            lon_range=(lon_min, lon_max)
        )
        valid_temp = temp_arr[~np.isnan(temp_arr)]

        sal_arr, _ = nc_service.get_depth_slice(
            variable="so",
            depth=payload.depth,
            time_index=payload.time_index,
            lat_range=(lat_min, lat_max),
            lon_range=(lon_min, lon_max)
        )
        valid_sal = sal_arr[~np.isnan(sal_arr)]

        uo_arr, _ = nc_service.get_depth_slice(
            variable="uo",
            depth=payload.depth,
            time_index=payload.time_index,
            lat_range=(lat_min, lat_max),
            lon_range=(lon_min, lon_max)
        )
        vo_arr, _ = nc_service.get_depth_slice(
            variable="vo",
            depth=payload.depth,
            time_index=payload.time_index,
            lat_range=(lat_min, lat_max),
            lon_range=(lon_min, lon_max)
        )
        valid_uo = uo_arr[~np.isnan(uo_arr)]
        valid_vo = vo_arr[~np.isnan(vo_arr)]
        current_speeds = np.sqrt(valid_uo**2 + valid_vo**2) if len(valid_uo) > 0 else np.array([0.0])

        argo_profiles = argo_service.get_profiles_in_region(
            lat_min=lat_min, lat_max=lat_max, lon_min=lon_min, lon_max=lon_max
        ) if argo_service.is_loaded else []

        if len(valid_temp) == 0:
            raise HTTPException(status_code=404, detail="No ocean model cells inside the selected region")

        # Model error from Argo profiles co-located in space AND time with a
        # model analysis step (never a fixed placeholder).
        from app.services.model_skill_service import colocate_profile
        residuals = []
        anomaly_count = 0
        for p in argo_profiles:
            try:
                c = colocate_profile(nc_service, p, "thetao")
            except Exception:
                c = None
            if c is None:
                continue
            sel = np.abs(c["depths"] - payload.depth) <= max(10.0, payload.depth * 0.1)
            if not sel.any():
                continue
            delta = float(np.mean(np.abs(c["obs"][sel] - c["model"][sel])))
            residuals.append(delta)
            if delta > 1.2:
                anomaly_count += 1

        mean_model_error = round(float(np.mean(residuals)), 2) if residuals else None

        hist_bins = []
        if len(valid_temp) > 0:
            counts, bin_edges = np.histogram(valid_temp, bins=7)
            for k in range(len(counts)):
                hist_bins.append({
                    "range": f"{bin_edges[k]:.1f}-{bin_edges[k+1]:.1f}°C",
                    "count": int(counts[k]),
                    "percentage": round(float(counts[k] / len(valid_temp) * 100), 1)
                })

        result = {
            "bounds": {
                "lat_min": lat_min, "lat_max": lat_max,
                "lon_min": lon_min, "lon_max": lon_max,
            },
            "area_km2": area_km2,
            "depth": payload.depth,
            "time_index": payload.time_index,
            "temperature": {
                "mean": round(float(np.mean(valid_temp)), 2),
                "min": round(float(np.min(valid_temp)), 2),
                "max": round(float(np.max(valid_temp)), 2),
                "std": round(float(np.std(valid_temp)), 2),
                "histogram": hist_bins
            },
            "salinity": {
                "mean": round(float(np.mean(valid_sal)), 2) if len(valid_sal) > 0 else None,
                "min": round(float(np.min(valid_sal)), 2) if len(valid_sal) > 0 else None,
                "max": round(float(np.max(valid_sal)), 2) if len(valid_sal) > 0 else None,
            },
            "currents": {
                "mean_speed_ms": round(float(np.mean(current_speeds)), 2) if len(valid_uo) > 0 else None,
                "max_speed_ms": round(float(np.max(current_speeds)), 2) if len(valid_uo) > 0 else None,
            },
            "observations_count": len(argo_profiles),
            "colocated_observations": len(residuals),
            "model_mean_residual": mean_model_error,
            "anomalies_detected": anomaly_count,
            "sample_points": len(valid_temp),
            "model_source": nc_service.source_name,
        }
        if cache_service:
            cache_service.set(cache_key, result, ttl_seconds=900)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regional statistical calculation failed: {str(e)}")


@router.post("/transect")
def calculate_ocean_transect(payload: TransectRequest, request: Request):
    """Generate 2D vertical cross-section grid (Depth vs Distance) along transect line A -> B."""
    nc_service = request.app.state.nc_service
    cache_service = getattr(request.app.state, "cache_service", None)
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")

    cache_key = f"transect:{payload.lat1}:{payload.lon1}:{payload.lat2}:{payload.lon2}:{payload.variable}:{payload.time_index}:{payload.num_samples}"
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    n_pts = payload.num_samples
    total_dist_km = haversine_km(payload.lat1, payload.lon1, payload.lat2, payload.lon2)

    lats = np.linspace(payload.lat1, payload.lat2, n_pts).tolist()
    lons = np.linspace(payload.lon1, payload.lon2, n_pts).tolist()
    distances = np.linspace(0, total_dist_km, n_pts).tolist()

    stations = []
    all_depths = None
    grid_matrix = []

    try:
        for i in range(n_pts):
            lat_i = round(lats[i], 3)
            lon_i = round(lons[i], 3)
            dist_i = round(distances[i], 1)

            depths_i, vals_i = nc_service.get_depth_profile(
                variable=payload.variable,
                lat=lat_i,
                lon=lon_i,
                time_index=payload.time_index
            )

            if all_depths is None:
                all_depths = depths_i

            stations.append({
                "station_index": i,
                "lat": lat_i,
                "lon": lon_i,
                "distance_km": dist_i,
                "values": vals_i
            })

        all_vals_flat = []
        for d_idx in range(len(all_depths)):
            row = []
            for s_idx in range(n_pts):
                v = stations[s_idx]["values"][d_idx]
                row.append(v)
                if v is not None:
                    all_vals_flat.append(v)
            grid_matrix.append(row)

        unit = "°C" if payload.variable == "thetao" else "PSU" if payload.variable == "so" else "m/s"

        result = {
            "variable": payload.variable,
            "unit": unit,
            "point_a": {"lat": payload.lat1, "lon": payload.lon1},
            "point_b": {"lat": payload.lat2, "lon": payload.lon2},
            "total_distance_km": round(total_dist_km, 1),
            "stations_count": n_pts,
            "depths": all_depths,
            "distances_km": [round(d, 1) for d in distances],
            "grid_matrix": grid_matrix,
            "min_val": round(min(all_vals_flat), 2) if all_vals_flat else 0.0,
            "max_val": round(max(all_vals_flat), 2) if all_vals_flat else 0.0,
            "time_index": payload.time_index
        }
        if cache_service:
            cache_service.set(cache_key, result, ttl_seconds=900)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transect interpolation failed: {str(e)}")


@router.get("/dossier")
def get_ocean_dossier(
    request: Request,
    lat: float = Query(description="Latitude"),
    lon: float = Query(description="Longitude"),
    depth: float = Query(default=0.0, ge=0),
    time_index: int = Query(default=0, ge=0),
):
    """Contextual Ocean Region Dossier for right-click inspection anywhere in the ocean."""
    nc_service = request.app.state.nc_service
    argo_service = request.app.state.argo_service

    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")

    try:
        t_depths, t_vals = nc_service.get_depth_profile("thetao", lat, lon, time_index)
        s_depths, s_vals = nc_service.get_depth_profile("so", lat, lon, time_index)
        u_depths, u_vals = nc_service.get_depth_profile("uo", lat, lon, time_index)
        v_depths, v_vals = nc_service.get_depth_profile("vo", lat, lon, time_index)

        # Filter out None values for accurate interpolation. No placeholder
        # values: a coordinate with no model water column is reported as such.
        def safe_interp(d, x_arr, y_arr):
            valid = [(x, y) for x, y in zip(x_arr, y_arr) if y is not None]
            if not valid:
                return None
            xs, ys = zip(*valid)
            if d > xs[-1]:
                return None
            return float(np.interp(d, xs, ys))

        exact_temp = safe_interp(depth, t_depths, t_vals)
        if exact_temp is None:
            raise HTTPException(status_code=404, detail="No model water column at this coordinate/depth (land or below seafloor)")
        exact_sal = safe_interp(depth, s_depths, s_vals)
        exact_u = safe_interp(depth, u_depths, u_vals) or 0.0
        exact_v = safe_interp(depth, v_depths, v_vals) or 0.0

        speed = float(np.sqrt(exact_u**2 + exact_v**2))
        compass_deg = (math.degrees(math.atan2(exact_u, exact_v)) + 360.0) % 360.0
        compass_dir = degrees_to_compass(compass_deg)

        nearby_floats = []
        if argo_service.is_loaded:
            all_floats = argo_service.get_profiles_in_region(
                lat_min=max(0.0, lat - 3.5),
                lat_max=min(28.0, lat + 3.5),
                lon_min=max(60.0, lon - 3.5),
                lon_max=min(100.0, lon + 3.5)
            )
            for f in all_floats:
                d_km = haversine_km(lat, lon, f["latitude"], f["longitude"])
                if d_km <= 350.0:
                    nearby_floats.append({
                        "id": f["id"],
                        "platform_id": f["platform_id"],
                        "distance_km": round(d_km, 1),
                        "latitude": f["latitude"],
                        "longitude": f["longitude"],
                        "last_reported": f.get("timestamp", datetime.now(timezone.utc).isoformat())
                    })

        nearby_floats.sort(key=lambda x: x["distance_km"])
        nearest_float_dist = nearby_floats[0]["distance_km"] if nearby_floats else None
        nearest_float_id = nearby_floats[0]["id"] if nearby_floats else None
        
        # Calculate authentic model residual against nearest in-situ float if within range
        model_error = None
        anomaly_status = "No in-situ observations within 350km — model forecast only"

        if nearby_floats and argo_service.is_loaded:
            nearest_p = argo_service.get_profile(nearest_float_id)
            if nearest_p and nearest_p.get("temperatures") and nearest_p.get("depths") and depth <= max(nearest_p["depths"]):
                obs_t_at_depth = float(np.interp(depth, nearest_p["depths"], nearest_p["temperatures"]))
                model_error = round(abs(obs_t_at_depth - exact_temp), 2)
                if model_error >= 2.0:
                    anomaly_status = f"Significant Thermal Divergence (+{model_error:.2f}°C)"
                elif model_error >= 1.0:
                    anomaly_status = f"Moderate Thermal Inversion (+{model_error:.2f}°C)"
                else:
                    anomaly_status = f"Nominal Ocean Stratification (Δ {model_error:.2f}°C)"

        return {
            "coordinate": {
                "latitude": round(lat, 3),
                "longitude": round(lon, 3),
                "formatted": f"{abs(lat):.2f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.2f}°{'E' if lon >= 0 else 'W'}"
            },
            "depth_m": depth,
            "time_index": time_index,
            "telemetry": {
                "temperature": round(exact_temp, 2),
                "temperature_unit": "°C",
                "salinity": round(exact_sal, 2) if exact_sal is not None else None,
                "salinity_unit": "PSU",
                "current_speed": round(speed, 2),
                "current_speed_unit": "m/s",
                "current_direction": compass_dir,
                "current_degrees": round(compass_deg, 1),
            },
            "profile_preview": {
                "depths": t_depths,
                "temperatures": t_vals,
                "salinities": s_vals
            },
            "ocean_context": {
                "model_dataset": nc_service.source_name,
                "nearby_argo_count": len(nearby_floats),
                "nearest_float_id": nearest_float_id,
                "nearest_float_dist_km": nearest_float_dist,
                "estimated_model_error": model_error,
                "anomaly_status": anomaly_status
            },
            "nearby_floats": nearby_floats[:4]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dossier query failed: {str(e)}")


@router.post("/ai/analyze")
def run_ai_grounded_analysis(payload: AiQueryRequest, request: Request):
    """
    Grounded Ocean Analyst.

    Every sentence is assembled from computed evidence: the model column at the
    point, the nearest Argo profile co-located in space AND time (±36 h of a
    model analysis step), TCHP/D26 at the point, the model's measured skill in
    the relevant depth band, and the local confidence field. Confidence is a
    transparent function of that evidence, not a fixed number.
    """
    nc_service = request.app.state.nc_service
    argo_service = request.app.state.argo_service
    cache_service = getattr(request.app.state, "cache_service", None)
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")

    from app.services.model_skill_service import colocate_profile, depth_band_skill

    profile = argo_service.get_profile(payload.profile_id) if payload.profile_id and argo_service.is_loaded else None
    lat = payload.lat if payload.lat is not None else (profile["latitude"] if profile else None)
    lon = payload.lon if payload.lon is not None else (profile["longitude"] if profile else None)
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="Provide lat/lon or a profile_id to analyse")
    depth = payload.depth if payload.depth is not None else 100.0

    m_depths, m_vals = nc_service.get_depth_profile("thetao", lat, lon, payload.time_index)
    valid_m = [(d, v) for d, v in zip(m_depths, m_vals) if v is not None]
    if not valid_m or depth > valid_m[-1][0]:
        raise HTTPException(status_code=404, detail="No model water column at this point/depth (land or below seafloor)")
    vm_d, vm_v = zip(*valid_m)
    model_val = float(np.interp(depth, vm_d, vm_v))

    # Nearest Argo profile that is co-located in time with a model analysis step
    candidates = []
    if argo_service.is_loaded:
        for p in argo_service.get_profiles_in_region(lat - 3, lat + 3, lon - 3, lon + 3):
            d_km = haversine_km(lat, lon, p["latitude"], p["longitude"])
            if d_km <= 300.0:
                candidates.append((d_km, p))
    candidates.sort(key=lambda x: x[0])
    evidence_pid, dist_km, dt_h, obs_val, model_at_float = None, None, None, None, None
    for d_km, p in candidates:
        c = colocate_profile(nc_service, p, "thetao")
        if c is None:
            continue
        sel = np.abs(c["depths"] - depth) <= max(5.0, depth * 0.05)
        if not sel.any():
            continue
        # Compare the float against the model at the FLOAT's position (not the query point)
        obs_val = float(np.mean(c["obs"][sel]))
        model_at_float = float(np.mean(c["model"][sel]))
        evidence_pid, dist_km, dt_h = p["platform_id"], d_km, c["time_offset_hours"]
        break

    tchp_pt = _tchp_point(nc_service, lat, lon, payload.time_index)

    skill_key = "skill:thetao"
    skill = cache_service.get(skill_key) if cache_service else None
    if skill is None and argo_service.is_loaded:
        skill = depth_band_skill(argo_service, nc_service, "thetao")
        if cache_service:
            cache_service.set(skill_key, skill, ttl_seconds=1800)
    band = None
    if skill:
        band = next((b for b in skill["bands"] if b["top_m"] <= depth < b["bottom_m"]), None)

    if evidence_pid is not None:
        residual = round(obs_val - model_at_float, 2)
        severity = "CRITICAL" if abs(residual) >= 1.5 else "WARNING" if abs(residual) >= 0.8 else "NOMINAL"
        # Confidence decays with distance and time separation of the evidence
        confidence = int(round(100 * math.exp(-dist_km / 300.0) * math.exp(-dt_h / 96.0)))
        titles = {
            "CRITICAL": f"Significant model-observation divergence ({residual:+.2f}°C at {depth:.0f} m)",
            "WARNING": f"Moderate model-observation divergence ({residual:+.2f}°C at {depth:.0f} m)",
            "NOMINAL": f"Model agrees with Argo within {abs(residual):.2f}°C at {depth:.0f} m",
        }
        title = titles[severity]
        narrative = (
            f"Argo float {evidence_pid} ({dist_km:.0f} km away, {dt_h:.0f} h from the matched model analysis) measured "
            f"{obs_val:.2f}°C at {depth:.0f} m where the model ({nc_service.source_name}) gives {model_at_float:.2f}°C, "
            f"a residual of {residual:+.2f}°C. At the queried point the model shows {model_val:.2f}°C."
        )
    else:
        residual, severity, confidence = None, "UNVERIFIED", 0
        title = f"Model-only estimate: {model_val:.2f}°C at {depth:.0f} m (no co-located Argo within 300 km / ±36 h)"
        narrative = (
            f"The model ({nc_service.source_name}) gives {model_val:.2f}°C at {depth:.0f} m. No Argo profile within "
            f"300 km was sampled within ±36 h of a model analysis step, so this value is not independently verified."
        )

    if band and band.get("rmse") is not None:
        narrative += (
            f" Fleet-wide, this model's error in the {band['band']} band is RMSE {band['rmse']}°C "
            f"(bias {band['bias']:+.2f}°C over {band['n_profiles']} Argo profiles), rated '{band['verdict']}'."
        )
    if tchp_pt is not None:
        above = " (above the 50 kJ/cm² rapid-intensification support threshold)" if tchp_pt["tchp"] >= 50 else ""
        narrative += f" Upper-ocean heat: TCHP {tchp_pt['tchp']} kJ/cm², 26°C isotherm at {tchp_pt['d26']} m{above}."

    recs = []
    if severity in ("CRITICAL", "WARNING"):
        recs.append("Treat model temperatures near this depth with caution; prefer the co-located Argo profile.")
    if severity == "UNVERIFIED":
        recs.append("No in-situ verification nearby: weight this estimate by the model's fleet-wide depth-band skill.")
    if tchp_pt is not None and tchp_pt["tchp"] >= 50:
        recs.append("TCHP supports rapid intensification here: monitor any disturbance tracking over this area.")
    if band and band.get("verdict") == "poor":
        recs.append(f"The model is least reliable in {band['band']}; check thermocline-sensitive products (D26, TCHP) against Argo.")
    if not recs:
        recs.append("Model and observations agree; no action needed beyond routine monitoring.")

    return {
        "query": payload.query,
        "location": {"latitude": lat, "longitude": lon, "depth_m": depth},
        "severity": severity,
        "confidence_percent": confidence,
        "confidence_basis": "100 x exp(-distance/300 km) x exp(-time offset/96 h) of the co-located Argo evidence; 0 if none",
        "title": title,
        "scientific_narrative": narrative,
        "evidence": {
            # Like-for-like: model at the float position when Argo evidence exists
            "model_value": round(model_at_float if model_at_float is not None else model_val, 2),
            "model_value_at_query": round(model_val, 2),
            "observed_value": round(obs_val, 2) if obs_val is not None else None,
            "residual_delta": residual,
            "unit": "°C",
            "depth_range": f"{int(max(0, depth - 40))}m – {int(depth + 60)}m",
            "supporting_argo_count": len(candidates),
            "model_dataset": nc_service.source_name,
            "primary_float_id": evidence_pid,
            "evidence_distance_km": round(dist_km, 1) if dist_km is not None else None,
            "evidence_time_offset_hours": dt_h,
            "tchp_kj_cm2": tchp_pt["tchp"] if tchp_pt else None,
            "d26_m": tchp_pt["d26"] if tchp_pt else None,
            "model_skill_band": band,
        },
        "recommendations": "\n".join(f"{i + 1}. {r}" for i, r in enumerate(recs)),
    }


def _tchp_point(nc_service, lat: float, lon: float, time_index: int) -> Optional[dict]:
    """TCHP / D26 / SST from the model column at a point (None if land or undefined)."""
    from app.services.ocean_physics import upper_ocean_metrics
    depths, values = nc_service.get_depth_profile(variable="thetao", lat=lat, lon=lon, time_index=time_index)
    pairs = [(d, v) for d, v in zip(depths, values) if v is not None]
    if len(pairs) < 3:
        return None
    m = upper_ocean_metrics([p[0] for p in pairs], [p[1] for p in pairs])
    if m["tchp"] is None or m["sst"] is None:
        return None
    return m



def _evaluate_candidate(
    platform: dict,
    platform_type: str,
    target_lat: float,
    target_lon: float,
    radius_km: float,
    time_window_hours: float,
    query_time: datetime,
    variable: str,
    time_index: int,
    nc_service: Any,
) -> Optional[dict]:
    plat_lat = platform.get("latitude")
    plat_lon = platform.get("longitude")
    if plat_lat is None or plat_lon is None:
        return None

    dist = haversine_km(target_lat, target_lon, plat_lat, plat_lon)
    if dist > radius_km:
        return None

    # Calculate temporal offset
    raw_ts = platform.get("timestamp")
    time_offset_hours = 0.0
    if raw_ts:
        try:
            if isinstance(raw_ts, str):
                ts_clean = raw_ts.replace("Z", "+00:00")
                obs_time = datetime.fromisoformat(ts_clean)
            elif isinstance(raw_ts, datetime):
                obs_time = raw_ts
            else:
                obs_time = query_time
            if obs_time.tzinfo is None:
                obs_time = obs_time.replace(tzinfo=timezone.utc)
            time_offset_hours = round(abs((obs_time - query_time).total_seconds()) / 3600.0, 1)
        except Exception:
            time_offset_hours = 0.0

    if time_offset_hours > time_window_hours:
        return None

    obs_depths = platform.get("depths", [])
    obs_vals = platform.get("temperatures") if variable == "thetao" else platform.get("salinities")
    if not obs_depths or not obs_vals:
        return None

    # Surface or shallowest valid observation
    valid_obs = [float(v) for v in obs_vals if v is not None and not np.isnan(v)]
    if not valid_obs:
        return None
    observed_value = valid_obs[0]

    rmse = 0.0
    mean_bias = 0.0
    model_value = None

    try:
        m_depths, m_vals = nc_service.get_depth_profile(variable=variable, lat=plat_lat, lon=plat_lon, time_index=time_index)
        valid_m = [(d, v) for d, v in zip(m_depths, m_vals) if v is not None and not np.isnan(v)]
        if valid_m:
            vm_depths, vm_vals = zip(*valid_m)
            m_interp = np.interp(obs_depths, vm_depths, vm_vals)
            model_value = round(float(m_interp[0]), 2)
            diffs = [float(o) - float(m) for o, m in zip(obs_vals, m_interp) if o is not None and not np.isnan(o)]
            if diffs:
                rmse = round(float(np.sqrt(np.mean(np.square(diffs)))), 3)
                mean_bias = round(float(np.mean(diffs)), 3)
    except Exception:
        pass

    match_score = round(max(0.0, 100.0 - (dist / radius_km * 45.0) - (min(time_offset_hours, time_window_hours) / time_window_hours * 20.0) - (rmse * 12.0)), 1)
    sensor_id = str(platform.get("platform_id") or platform.get("id"))
    name = platform.get("name") or f"{platform_type.capitalize()} #{sensor_id}"

    return {
        "sensor_id": sensor_id,
        "platform_id": platform.get("platform_id"),
        "profile_id": platform.get("id"),
        "sensor_type": platform_type,
        "name": name,
        "latitude": plat_lat,
        "longitude": plat_lon,
        "timestamp": platform.get("timestamp"),
        "distance_km": round(dist, 1),
        "time_offset_hours": time_offset_hours,
        "temporal_delta_hours": time_offset_hours,
        "model_value": model_value,
        "observed_value": round(float(observed_value), 2) if observed_value is not None else None,
        "rmse": rmse,
        "bias": mean_bias,
        "mean_bias": mean_bias,
        "qc_passed": bool(platform.get("qc_flags", [1])[0] == 1 if "qc_flags" in platform else True),
        "n_soundings": len(obs_depths),
        "max_depth_m": max(obs_depths) if obs_depths else 0.0,
        "match_score": match_score,
        "surface_meteorology": platform.get("surface_meteorology"),
        "waypoints": platform.get("waypoints")
    }


@router.get("/colocate", response_model=CoLocationResponse)
def colocate_observations(
    request: Request,
    lat: float = Query(..., ge=-90.0, le=90.0, description="Target latitude"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Target longitude"),
    radius_km: float = Query(default=250.0, ge=1.0, le=1_000.0, description="Search radius in kilometers"),
    time_window_hours: float = Query(default=48.0, ge=1.0, le=720.0, description="Time window in hours"),
    variable: Literal["thetao", "so"] = Query(default="thetao", description="Variable to compare"),
    time_index: int = Query(default=0, ge=0, description="Time step index")
):
    """
    SAGAR-VIEW Spatial-Temporal Co-Location Engine.
    Finds and ranks all in-situ observation platforms (Argo, Moored Buoys, Gliders)
    within radius_km and time_window_hours of the query coordinate, bilinearly
    interpolates numerical model fields, and calculates spatial-temporal match metrics.
    """
    nc_service = request.app.state.nc_service
    argo_service = request.app.state.argo_service
    cache_service = getattr(request.app.state, "cache_service", None)

    if not nc_service.is_loaded or not argo_service.is_loaded:
        raise HTTPException(status_code=503, detail="Ocean data services not fully loaded")

    cache_key = f"colocate:{lat}:{lon}:{radius_km}:{time_window_hours}:{variable}:{time_index}"
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    query_time = datetime.now(timezone.utc)
    candidates = []

    # 1. Evaluate Argo profiles
    for p in argo_service.get_all_profiles():
        c = _evaluate_candidate(p, "argo", lat, lon, radius_km, time_window_hours, query_time, variable, time_index, nc_service)
        if c:
            candidates.append(c)

    # 2. Evaluate Moored Buoys
    for b in argo_service.get_moored_buoys():
        c = _evaluate_candidate(b, "moored_buoy", lat, lon, radius_km, time_window_hours, query_time, variable, time_index, nc_service)
        if c:
            candidates.append(c)

    # 3. Evaluate Gliders
    for g in argo_service.get_gliders():
        c = _evaluate_candidate(g, "glider", lat, lon, radius_km, time_window_hours, query_time, variable, time_index, nc_service)
        if c:
            candidates.append(c)

    candidates.sort(key=lambda x: x["match_score"], reverse=True)

    result = {
        "query": {
            "latitude": lat,
            "longitude": lon,
            "radius_km": radius_km,
            "time_window_hours": time_window_hours,
            "variable": variable,
            "time_index": time_index
        },
        "total_candidates": len(candidates),
        "matches": candidates,
    }
    if cache_service:
        cache_service.set(cache_key, result, ttl_seconds=900)
    return result


@router.get("/heat-potential", response_model=HeatPotentialResponse)
def calculate_heat_potential(
    request: Request,
    time_index: int = Query(default=0, ge=0, description="Model time step index"),
    lat_min: float = Query(default=0.0, ge=0.0, le=28.0, description="Minimum latitude"),
    lat_max: float = Query(default=28.0, ge=0.0, le=28.0, description="Maximum latitude"),
    lon_min: float = Query(default=60.0, ge=60.0, le=100.0, description="Minimum longitude"),
    lon_max: float = Query(default=100.0, ge=60.0, le=100.0, description="Maximum longitude"),
):
    """
    Tropical Cyclone Heat Potential (TCHP) & Marine Heatwave (MHW) diagnostic.
    Formula: Q_TCHP = rho * Cp * integral_0^{D_26} (T(z) - 26) dz
    where factor = 0.4085 kJ/(cm^2 * m * °C) and D_26 is 26°C isotherm depth.
    MHW categorisation follows Hobday et al. (2016) Cat 1–4.
    """
    nc_service = request.app.state.nc_service
    cache_service = getattr(request.app.state, "cache_service", None)

    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")

    actual_lat_min = min(lat_min, lat_max)
    actual_lat_max = max(lat_min, lat_max)
    actual_lon_min = min(lon_min, lon_max)
    actual_lon_max = max(lon_min, lon_max)

    cache_key = f"heat_potential:{time_index}:{actual_lat_min}:{actual_lat_max}:{actual_lon_min}:{actual_lon_max}"
    if cache_service:
        cached = cache_service.get(cache_key)
        if cached:
            return cached

    ds = nc_service.dataset
    lat_name = nc_service._find_coord('lat', 'latitude')
    lon_name = nc_service._find_coord('lon', 'longitude')
    depth_name = nc_service._find_coord('depth', 'lev')
    time_name = nc_service._find_coord('time', 't')

    if not all((lat_name, lon_name, depth_name, time_name)):
        raise HTTPException(status_code=500, detail="Missing coordinate dimensions in model dataset")

    if time_index >= ds.sizes[time_name]:
        raise HTTPException(status_code=400, detail=f"Time index {time_index} outside range (max {ds.sizes[time_name] - 1})")

    sub = ds["thetao"].isel({time_name: time_index})
    if actual_lat_min < actual_lat_max:
        sub = sub.sel({lat_name: slice(actual_lat_min, actual_lat_max)})
    if actual_lon_min < actual_lon_max:
        sub = sub.sel({lon_name: slice(actual_lon_min, actual_lon_max)})

    t_3d = np.ascontiguousarray(sub.values, dtype=np.float32)
    depths = np.ascontiguousarray(sub.coords[depth_name].values, dtype=np.float32)
    lats = [round(float(v), 4) for v in sub.coords[lat_name].values]
    lons = [round(float(v), 4) for v in sub.coords[lon_name].values]

    K, H, W = t_3d.shape
    d26 = np.zeros((H, W), dtype=np.float32)
    integral = np.zeros((H, W), dtype=np.float32)

    for i in range(K - 1):
        z_top = depths[i]
        z_bot = depths[i+1]
        dz = z_bot - z_top
        t_top = t_3d[i]
        t_bot = t_3d[i+1]

        # Case 1: both >= 26.0
        both = (t_top >= 26.0) & (t_bot >= 26.0)
        d26[both] = z_bot
        integral[both] += 0.5 * ((t_top[both] - 26.0) + (t_bot[both] - 26.0)) * dz

        # Case 2: isotherm crossing (t_top >= 26.0 and t_bot < 26.0)
        crossing = (t_top >= 26.0) & (t_bot < 26.0)
        denom = np.maximum(t_top[crossing] - t_bot[crossing], 1e-6)
        f = (t_top[crossing] - 26.0) / denom
        sub_dz = f * dz
        d26[crossing] = z_top + sub_dz
        integral[crossing] += 0.5 * (t_top[crossing] - 26.0) * sub_dz

    # TCHP factor: 0.4085 kJ/(cm^2 * m * °C)
    tchp = integral * 0.4085
    sst = t_3d[0]

    # Surface below 26.0: no 26 isotherm
    below_26 = sst < 26.0
    d26[below_26] = 0.0
    tchp[below_26] = 0.0

    # Land mask
    is_land = np.isnan(sst)
    d26[is_land] = np.nan
    tchp[is_land] = np.nan

    # Warm-SST classes relative to a fixed 28 C convective baseline. NOTE: this is
    # NOT a Hobday et al. (2016) marine heatwave (that needs a 30-yr daily
    # climatology and 90th-percentile threshold); the label says so explicitly.
    sst_anomaly = sst - 28.0
    mhw_cat = np.zeros((H, W), dtype=np.int32)
    mhw_cat[sst_anomaly >= 1.0] = 1
    mhw_cat[sst_anomaly >= 2.0] = 2
    mhw_cat[sst_anomaly >= 3.0] = 3
    mhw_cat[sst_anomaly >= 4.0] = 4

    valid_mask = ~is_land
    valid_tchp = tchp[valid_mask]
    valid_d26 = d26[valid_mask]
    valid_sst = sst[valid_mask]

    n_ocean_cells = int(np.sum(valid_mask))
    if n_ocean_cells > 0:
        tchp_min_val = round(float(np.nanmin(valid_tchp)), 2)
        tchp_max_val = round(float(np.nanmax(valid_tchp)), 2)
        tchp_mean_val = round(float(np.nanmean(valid_tchp)), 2)
        d26_min_val = round(float(np.nanmin(valid_d26)), 1)
        d26_max_val = round(float(np.nanmax(valid_d26)), 1)
        d26_mean_val = round(float(np.nanmean(valid_d26)), 1)
        sst_min_val = round(float(np.nanmin(valid_sst)), 2)
        sst_max_val = round(float(np.nanmax(valid_sst)), 2)
        sst_mean_val = round(float(np.nanmean(valid_sst)), 2)
        high_risk_cells = int(np.sum(valid_tchp >= 50.0))
        high_risk_pct = round(float(high_risk_cells / n_ocean_cells * 100.0), 2)
    else:
        tchp_min_val = tchp_max_val = tchp_mean_val = 0.0
        d26_min_val = d26_max_val = d26_mean_val = 0.0
        sst_min_val = sst_max_val = sst_mean_val = 0.0
        high_risk_cells = 0
        high_risk_pct = 0.0

    tchp_list = [[None if np.isnan(v) else round(float(v), 2) for v in row] for row in tchp]
    d26_list = [[None if np.isnan(v) else round(float(v), 1) for v in row] for row in d26]
    mhw_list = [[None if np.isnan(sst[r, c]) else int(mhw_cat[r, c]) for c in range(W)] for r in range(H)]

    response_data = {
        "metadata": {
            "time_index": time_index,
            "lat_min": actual_lat_min,
            "lat_max": actual_lat_max,
            "lon_min": actual_lon_min,
            "lon_max": actual_lon_max,
            "width": W,
            "height": H,
            "formula": "Q_TCHP = rho * Cp * integral_0^{D_26} (T(z) - 26) dz (factor = 0.4085 kJ/(cm^2·m·°C))",
            "provenance": f"TCHP computed from {nc_service.source_name}",
            "unit": "kJ/cm^2",
            "valid_time": _valid_time(nc_service, time_index),
            "time_role": _time_role(nc_service, time_index),
            "mhw_method": "Warm-SST class vs fixed 28 C baseline (not a climatology-based Hobday MHW)",
        },
        "statistics": {
            "tchp_min": tchp_min_val,
            "tchp_max": tchp_max_val,
            "tchp_mean": tchp_mean_val,
            "d26_min": d26_min_val,
            "d26_max": d26_max_val,
            "d26_mean": d26_mean_val,
            "sst_min": sst_min_val,
            "sst_max": sst_max_val,
            "sst_mean": sst_mean_val,
            "high_risk_cells": high_risk_cells,
            "high_risk_percentage": high_risk_pct,
            "cyclone_intensification_threshold": 50.0
        },
        "lats": lats,
        "lons": lons,
        "tchp": tchp_list,
        "d26": d26_list,
        "mhw_category": mhw_list
    }

    if cache_service:
        cache_service.set(cache_key, response_data, ttl_seconds=900)

    return response_data


@router.get("/heat-potential/point", response_model=HeatPotentialPoint)
def inspect_heat_potential_point(
    request: Request,
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude"),
    time_index: int = Query(default=0, ge=0)
):
    """Point inspection of TCHP, D26, SST and warm-SST class for the HUD."""
    nc_service = request.app.state.nc_service
    if not nc_service.is_loaded:
        raise HTTPException(status_code=503, detail="Model data not loaded")

    m = _tchp_point(nc_service, lat, lon, time_index)
    if m is None:
        raise HTTPException(status_code=404, detail="No model water column (or D26 deeper than the model) at this coordinate")

    tchp, d26, sst = m["tchp"], m["d26"], round(m["sst"], 2)
    anomaly = sst - 28.0
    if anomaly < 1.0:
        mhw_cat, mhw_label = 0, "SST < 29 °C (no warm-SST class)"
    elif anomaly < 2.0:
        mhw_cat, mhw_label = 1, "Warm class 1 (SST 29–30 °C)"
    elif anomaly < 3.0:
        mhw_cat, mhw_label = 2, "Warm class 2 (SST 30–31 °C)"
    elif anomaly < 4.0:
        mhw_cat, mhw_label = 3, "Warm class 3 (SST 31–32 °C)"
    else:
        mhw_cat, mhw_label = 4, "Warm class 4 (SST ≥ 32 °C)"

    if tchp < 30.0:
        cyclone_risk = "Low Risk"
    elif tchp < 50.0:
        cyclone_risk = "Moderate Risk"
    elif tchp < 80.0:
        cyclone_risk = "High Cyclone Intensification Risk"
    else:
        cyclone_risk = "Extreme Cyclogenesis Risk"

    return {
        "latitude": lat,
        "longitude": lon,
        "tchp": tchp,
        "d26": d26,
        "sst": sst,
        "mhw_category": mhw_cat,
        "mhw_label": mhw_label,
        "cyclone_risk": cyclone_risk,
        "high_risk_flag": tchp >= 50.0,
        "unit": "kJ/cm^2",
        "formula": "Q_TCHP = rho * Cp * integral_0^{D_26} (T(z) - 26) dz",
        "model_source": nc_service.source_name,
        "valid_time": _valid_time(nc_service, time_index),
        "time_role": _time_role(nc_service, time_index),
    }


def _valid_time(nc_service, time_index: int) -> Optional[str]:
    try:
        import pandas as pd
        tname = nc_service._find_coord("time", "t")
        return pd.Timestamp(nc_service.dataset[tname].values[time_index]).isoformat() + "Z"
    except Exception:
        return None


def _time_role(nc_service, time_index: int) -> Optional[str]:
    roles = nc_service.get_time_roles()
    return roles[time_index] if 0 <= time_index < len(roles) else None
