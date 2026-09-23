/**
 * Clients for Cyclone Intelligence, Model Trust, Advisories and Data Status.
 * Every endpoint here serves real data (HYCOM/CMEMS, Argo GDAC, GDACS,
 * IBTrACS); failures are thrown to the caller, never replaced by mock values.
 */
import { api } from './api';
import type { DatasetInfo } from '../types';

export interface TrackPoint {
  time: string;
  lat: number;
  lon: number;
  wind_kt?: number | null;
  forecast?: boolean;
  nature?: string;
}

export interface RiEvent {
  onset_time: string;
  onset_wind_kt: number;
  wind_24h_later_kt: number;
  delta_kt_24h: number;
  lat: number;
  lon: number;
  definition: string;
}

export interface HistoricalStorm {
  sid: string;
  name: string;
  season: number;
  subbasin: string;
  peak_wind_kt: number | null;
  ri: RiEvent | null;
  track: TrackPoint[];
}

export interface HistoricalTracksResponse {
  status: string;
  source?: string;
  n_storms: number;
  n_with_ri: number;
  storms: HistoricalStorm[];
}

export interface LiveStorm {
  event_id: number;
  episode_id: number;
  name: string;
  alert_level: string;
  is_current: boolean;
  from: string;
  to: string;
  lat: number;
  lon: number;
  max_wind_kt?: number;
  severity_text?: string;
  countries?: string;
  report_url?: string;
  in_north_indian_ocean: boolean;
  track: TrackPoint[];
}

export interface ActiveStormsResponse {
  status: 'ok' | 'unavailable';
  source?: string;
  error?: string;
  checked_at: string;
  n_active_global?: number;
  n_north_indian_ocean?: number;
  storms: LiveStorm[];
}

export interface BacktestSummary {
  key: string;
  name: string;
  season: number;
  subbasin?: string;
  status: string;
  peak_wind_kt: number | null;
  ri_onset: string | null;
  ml_lead_time_hours: number | null;
  significant_lead_time_hours: number | null;
  threshold_lead_time_hours: number | null;
  false_alarm_rate: number | null;
  flag_rate: number | null;
  p_value: number | null;
  tchp_anomaly_vs_clim: number | null;
  pct_clim_above_threshold: number | null;
  n_pre_storm_profiles: number;
  n_climatology_profiles: number;
  headline: string | null;
  summary: string | null;
}

export interface BacktestListResponse {
  backtests: BacktestSummary[];
  scorecard: {
    storms_evaluated: number;
    storms_with_ri: number;
    significant_early_signals: number;
    median_significant_lead_hours: number | null;
    mean_false_alarm_rate: number | null;
    mean_pct_clim_above_50: number | null;
  };
}

export interface BacktestTimelineEntry {
  time: string;
  platform_id: string;
  profile_id?: string;
  lat: number;
  lon: number;
  dist_to_track_km: number;
  hours_before_passage: number | null;
  sst: number;
  t100: number;
  d26: number;
  tchp: number;
  t0_100: number;
  z: Record<string, number>;
  anomaly_score: number;
  ml_flag: boolean;
  above_threshold: boolean;
}

export interface BacktestDetail {
  status: string;
  mode: 'backtest' | 'live';
  message?: string;
  storm: { name: string; season: number; sid: string };
  genesis_time: string;
  peak_time: string;
  peak_wind_kt: number;
  ri: RiEvent | null;
  track?: TrackPoint[];
  method: {
    radius_km: number;
    lead_days: number;
    clim_years: number;
    flag_rule: string;
    threshold_baseline: string;
    pre_storm_only: string;
    data_source: string;
    window?: { start: string; end: string };
  };
  counts: {
    storm_year_profiles_in_box: number;
    storm_year_profiles_pre_storm_in_corridor: number;
    climatology_profiles: number;
    climatology_years_with_data: number;
  };
  climatology?: { tchp_mean: number; tchp_std: number; tchp_p90: number; pct_profiles_above_threshold: number };
  storm_year?: {
    tchp_mean: number;
    tchp_max: number;
    tchp_anomaly_vs_clim: number;
    n_flagged: number;
    n_above_threshold: number;
    flag_rate: number | null;
    binomial_p_value_vs_climatology: number | null;
    signal_significant: boolean;
  };
  false_alarm?: { weighted_flag_rate: number | null; leave_one_year_out: { year: number; n: number; flag_rate: number }[] };
  events?: {
    first_ml_flag: BacktestTimelineEntry | null;
    first_significant_signal: (BacktestTimelineEntry & { p_value: number }) | null;
    first_threshold_crossing: BacktestTimelineEntry | null;
    ml_lead_time_hours_before_ri: number | null;
    significant_lead_time_hours_before_ri: number | null;
    threshold_lead_time_hours_before_ri: number | null;
  };
  timeline?: BacktestTimelineEntry[];
  verdict?: { headline: string; summary: string };
}

export interface TchpAlongTrackPoint extends TrackPoint {
  tchp: number | null;
  d26: number | null;
  sst: number | null;
  ri_supportive: boolean;
  model_time: string;
}

export interface LiveWatchResponse {
  status: 'ok' | 'computing' | 'not_found';
  message?: string;
  storm?: Partial<LiveStorm>;
  track?: TrackPoint[];
  tchp_along_track?: TchpAlongTrackPoint[];
  max_tchp_ahead?: number | null;
  model_source?: string;
  ocean_anomaly?: BacktestDetail;
}

export interface SkillBand {
  band: string;
  top_m: number;
  bottom_m: number;
  n_profiles: number;
  n_levels: number;
  bias: number | null;
  rmse: number | null;
  mae: number | null;
  p90_abs_error?: number;
  verdict: 'good' | 'fair' | 'poor' | 'no_data';
}

export interface DepthSkillResponse {
  variable: 'thetao' | 'so';
  unit: string;
  model_source: string;
  n_profiles_colocated: number;
  n_floats_colocated: number;
  n_profiles_excluded_time_window: number;
  max_time_offset_hours: number;
  tiers: { good_rmse_max: number; fair_rmse_max: number };
  overall: { n_levels: number; bias: number | null; rmse: number | null };
  bands: SkillBand[];
  reliable_to_m: number | null;
  worst_band: string | null;
  headline: string;
}

export interface ConfidenceFieldResponse {
  metadata: {
    lat_min: number;
    lat_max: number;
    lon_min: number;
    lon_max: number;
    width: number;
    height: number;
    length_scale_km: number;
    unverified_prior: number;
    formula: string;
    model_source: string;
  };
  statistics: {
    n_verifying_profiles: number;
    n_verifying_floats: number;
    ocean_cells: number;
    pct_ocean_verified: number;
    pct_ocean_unverified: number;
    mean_confidence: number | null;
  };
  confidence: (number | null)[][];
  coverage: (number | null)[][];
  local_rmse: (number | null)[][];
  verifying_points: { lat: number; lon: number; rmse_0_200m: number; platform_id: string }[];
}

export interface Advisory {
  level: 'warning' | 'watch' | 'info';
  kind: string;
  title: string;
  message: string;
  region?: Record<string, number | null>;
  evidence?: Record<string, unknown>;
}

export interface AdvisoriesResponse {
  generated_at: string;
  valid_time: string;
  model_source: string;
  advisories: Advisory[];
}

export interface DataStatusResponse {
  model: Partial<DatasetInfo> & {
    source_provenance?: string;
    retrieved_at?: string;
    loaded_at?: string;
    time_roles?: string[];
    native_resolution?: string;
  };
  argo: {
    loaded: boolean;
    source?: string;
    ingested_at?: string;
    n_argo_profiles: number;
    n_unique_floats: number;
    n_moored_buoys?: number;
    levels_qc_passed?: number;
    levels_qc_rejected?: number;
    profiles_qc_rejected?: number;
    qc_policy?: string;
  };
  anomaly_model: { training_source: string; n_training_profiles: number; trained_at: string | null };
  moored_buoys?: { status: string; reason?: string; source?: string };
  last_refresh: Record<string, unknown> | null;
}

export async function getActiveCyclones(): Promise<ActiveStormsResponse> {
  const res = await api.get('/api/cyclones/active', { timeout: 45000 });
  return res.data;
}

export async function getCycloneHistory(since = 2015): Promise<HistoricalTracksResponse> {
  const res = await api.get('/api/cyclones/history', { params: { since } });
  return res.data;
}

export async function getBacktests(): Promise<BacktestListResponse> {
  const res = await api.get('/api/cyclones/backtests');
  return res.data;
}

export async function getBacktest(key: string): Promise<BacktestDetail> {
  const res = await api.get(`/api/cyclones/backtests/${encodeURIComponent(key)}`);
  return res.data;
}

export async function getLiveWatch(eventId: number): Promise<LiveWatchResponse> {
  const res = await api.get(`/api/cyclones/live-watch/${eventId}`, { timeout: 60000 });
  return res.data;
}

export async function getDepthSkill(variable: 'thetao' | 'so' = 'thetao'): Promise<DepthSkillResponse> {
  const res = await api.get('/api/skill/depth-bands', { params: { variable }, timeout: 30000 });
  return res.data;
}

export async function getConfidenceField(): Promise<ConfidenceFieldResponse> {
  const res = await api.get('/api/skill/confidence', { timeout: 30000 });
  return res.data;
}

export async function getAdvisories(): Promise<AdvisoriesResponse> {
  const res = await api.get('/api/advisories', { timeout: 60000 });
  return res.data;
}

export async function getDataStatus(): Promise<DataStatusResponse> {
  const res = await api.get('/api/data/status');
  return res.data;
}
