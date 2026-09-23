/**
 * OCEAN-X TypeScript type definitions.
 * Matches the backend's Pydantic schemas.
 */

export interface ArgoProfileSummary {
  id: string;
  platform_id: string;
  platform_type: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  n_depths: number;
  max_depth: number;
}

export interface ArgoProfile {
  id: string;
  platform_id: string;
  platform_type: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  depths: number[];
  temperatures: number[] | null;
  salinities: number[] | null;
  qc_flags?: number[];
  surface_meteorology?: {
    sea_surface_temp?: number;
    air_temperature?: number;
    wind_speed_kts?: number;
    wind_direction_deg?: number;
    sea_level_pressure_hpa?: number;
    relative_humidity_pct?: number;
  };
  source: string;
}

export interface ComparisonEntry {
  depth: number;
  model_value: number;
  observed_value: number;
  delta: number;
  unit: string;
  anomaly_flag: boolean;
}

export interface ComparisonResponse {
  observation_id: string;
  platform_type: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  variable: string;
  comparisons: ComparisonEntry[];
  anomaly_detected: boolean;
  anomaly_threshold: number;
}

export interface ModelSliceMetadata {
  variable: string;
  depth: number;
  time_index: number;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  width: number;
  height: number;
  value_min: number;
  value_max: number;
}

export interface DatasetInfo {
  filename: string;
  variables: string[];
  dimensions: Record<string, number>;
  lat_range: number[];
  lon_range: number[];
  depth_levels: number[];
  time_steps: number;
  is_synthetic: boolean;
  dataset_time_range?: [string | null, string | null];
  source_provenance?: string | null;
  loaded_at?: string | null;
}

export type OceanVariable = 'thetao' | 'so' | 'uo' | 'vo';

export const VARIABLE_LABELS: Record<OceanVariable, string> = {
  thetao: 'Temperature',
  so: 'Salinity',
  uo: 'Eastward Current',
  vo: 'Northward Current',
};

export const VARIABLE_UNITS: Record<OceanVariable, string> = {
  thetao: '°C',
  so: 'PSU',
  uo: 'm/s',
  vo: 'm/s',
};

export interface AnomalyFleetMember {
  id: string;
  platform_id: string;
  latitude: number;
  longitude: number;
  status: 'CRITICAL_ANOMALY' | 'WARNING' | 'NOMINAL';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  anomaly_score: number;
  max_delta: number;
  max_depth: number;
  hypothesis: string;
  advisories?: string[];
}

export interface AnomalyFleetSummary {
  total_floats: number;
  critical_count: number;
  warning_count: number;
  nominal_count: number;
  highest_anomaly_float: AnomalyFleetMember | null;
  fleet: AnomalyFleetMember[];
}

export interface AnomalyLayerEntry {
  depth: number;
  model: number;
  observed: number;
  delta: number;
  is_anomaly: boolean;
}

export interface AnomalyFeatures {
  mean_delta: number;
  max_delta: number;
  upper_200m_heat_delta: number;
  thermocline_gradient_diff: number;
  max_layer_depth: number;
}

export interface AnomalyAnalysisResponse {
  profile_id: string;
  variable: string;
  anomaly_score: number;
  status: 'CRITICAL_ANOMALY' | 'WARNING' | 'NOMINAL';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  features: AnomalyFeatures;
  hypothesis: string;
  advisories?: string[];
  anomalous_depths: number[];
  layer_anomalies: AnomalyLayerEntry[];
}

export interface OceanDossierResponse {
  coordinate: {
    latitude: number;
    longitude: number;
    formatted: string;
  };
  depth_m: number;
  time_index: number;
  telemetry: {
    temperature: number;
    temperature_unit: string;
    salinity: number;
    salinity_unit: string;
    current_speed: number;
    current_speed_unit: string;
    current_direction: string;
    current_degrees: number;
  };
  profile_preview: {
    depths: number[];
    temperatures: (number | null)[];
    salinities: (number | null)[];
  };
  ocean_context: {
    model_dataset: string;
    nearby_argo_count: number;
    nearest_float_id: string | null;
    nearest_float_dist_km: number | null;
    estimated_model_error: number;
    anomaly_status: string;
  };
  nearby_floats: Array<{
    id: string;
    platform_id: string;
    distance_km: number;
    latitude: number;
    longitude: number;
    last_reported: string;
  }>;
}

export interface RegionHistogramBin {
  range: string;
  count: number;
  percentage: number;
}

export interface RegionStatsResponse {
  bounds: {
    lat_min: number;
    lat_max: number;
    lon_min: number;
    lon_max: number;
  };
  area_km2: number;
  depth: number;
  time_index: number;
  temperature: {
    mean: number;
    min: number;
    max: number;
    std: number;
    histogram: RegionHistogramBin[];
  };
  salinity: {
    mean: number;
    min: number;
    max: number;
  };
  currents: {
    mean_speed_ms: number;
    max_speed_ms: number;
  };
  observations_count: number;
  model_mean_residual: number;
  anomalies_detected: number;
  sample_points: number;
}

export interface TransectResponse {
  variable: string;
  unit: string;
  point_a: { lat: number; lon: number };
  point_b: { lat: number; lon: number };
  total_distance_km: number;
  stations_count: number;
  depths: number[];
  distances_km: number[];
  grid_matrix: (number | null)[][];
  min_val: number;
  max_val: number;
  time_index: number;
}

export interface AiAnalystResponse {
  query: string;
  location: { latitude: number; longitude: number; depth_m: number };
  severity: 'CRITICAL' | 'WARNING' | 'NOMINAL' | 'UNVERIFIED';
  confidence_percent: number;
  confidence_basis?: string;
  title: string;
  scientific_narrative: string;
  evidence: {
    model_value: number;
    observed_value: number | null;
    residual_delta: number | null;
    unit: string;
    depth_range: string;
    supporting_argo_count: number;
    model_dataset: string;
    primary_float_id: string | null;
    evidence_distance_km?: number | null;
    evidence_time_offset_hours?: number | null;
    tchp_kj_cm2?: number | null;
    d26_m?: number | null;
    model_skill_band?: { band: string; rmse: number | null; bias: number | null; verdict: string; n_profiles: number } | null;
  };
  recommendations: string;
}

export interface HeatPotentialStatistics {
  tchp_min: number;
  tchp_max: number;
  tchp_mean: number;
  d26_min: number;
  d26_max: number;
  d26_mean: number;
  sst_min: number;
  sst_max: number;
  sst_mean: number;
  high_risk_cells: number;
  high_risk_percentage: number;
  cyclone_intensification_threshold: number;
}

export interface HeatPotentialMetadata {
  time_index: number;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  width: number;
  height: number;
  formula: string;
  provenance: string;
  unit: string;
}

export interface HeatPotentialResponse {
  metadata: HeatPotentialMetadata;
  statistics: HeatPotentialStatistics;
  lats: number[];
  lons: number[];
  tchp: (number | null)[][];
  d26: (number | null)[][];
  mhw_category: (number | null)[][];
}

export interface HeatPotentialPoint {
  latitude: number;
  longitude: number;
  tchp: number;
  d26: number;
  sst: number;
  mhw_category: number;
  mhw_label: string;
  cyclone_risk: string;
  high_risk_flag: boolean;
  unit: string;
  formula: string;
}

export interface LiveOceanHourlyPrediction {
  time: string;
  hour_offset: number;
  wave_height_m: number;
  current_velocity_ms: number;
  current_direction_deg: number;
  cyclone_risk: 'NOMINAL' | 'WARNING' | 'CRITICAL';
}

export interface LiveOceanResponse {
  status: string;
  source: string;
  latitude: number;
  longitude: number;
  timestamp_utc: string;
  current_observations: {
    wave_height_m: number;
    wave_period_s: number;
    wave_direction_deg: number;
    swell_wave_height_m: number;
    wind_wave_height_m: number;
    current_velocity_ms: number;
    current_direction_deg: number;
    sea_surface_temp_estimate_c: number;
  };
  prediction_summary: {
    forecast_horizon_hours: number;
    peak_wave_height_m: number;
    peak_current_velocity_ms: number;
    primary_risk: string;
    recommendation: string;
  };
  hourly_forecast: LiveOceanHourlyPrediction[];
}

export interface LiveArgoPlatform {
  platform_id: string;
  type: string;
  institution?: string;
  latitude: number;
  longitude: number;
  last_observation_utc?: string;
  status: string;
  file_uri?: string;
}

export interface LiveFleetResponse {
  status: string;
  source: string;
  total_profiles_found: number;
  unique_active_floats: number;
  platforms: LiveArgoPlatform[];
  timestamp: string;
}



