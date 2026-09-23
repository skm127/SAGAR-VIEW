/**
 * API client for OCEAN-X backend.
 * Features transparent data source modes:
 * - 'live': Live streaming from INCOIS NetCDF FastAPI backend
 * - 'demo': Client-side simulation fallback when backend is unreachable or explicitly requested
 */
import axios from 'axios';
import type {
  ArgoProfile,
  ArgoProfileSummary,
  ComparisonResponse,
  DatasetInfo,
  AnomalyFleetSummary,
  AnomalyAnalysisResponse,
  OceanDossierResponse,
  RegionStatsResponse,
  TransectResponse,
  AiAnalystResponse,
  HeatPotentialResponse,
  HeatPotentialPoint,
  LiveOceanResponse,
  LiveFleetResponse,
} from '../types';



const API_BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
});

api.interceptors.response.use((response) => {
  const requestPath = response.config.url ?? '';
  const contentType = String(response.headers['content-type'] ?? '');

  if (requestPath.startsWith('/api/') && contentType.includes('text/html')) {
    return Promise.reject(new Error('Ocean API is unavailable at the configured endpoint'));
  }

  return response;
});

export type DataSourceMode = 'live' | 'offline';

let currentMode: DataSourceMode = 'live';
const modeListeners = new Set<(mode: DataSourceMode) => void>();

export function getDataSourceMode(): DataSourceMode {
  return currentMode;
}

export function onDataSourceModeChange(listener: (mode: DataSourceMode) => void) {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

function notifySuccess() {
  if (currentMode !== 'live') {
    currentMode = 'live';
    modeListeners.forEach((fn) => fn('live'));
  }
}

/** Health check */
export async function getHealth() {
  try {
    const res = await api.get('/api/health');
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get model dataset info */
export async function getModelInfo(): Promise<DatasetInfo> {
  try {
    const res = await api.get('/api/model/info');
    if (!res.data || !Array.isArray(res.data.depth_levels) || !Array.isArray(res.data.variables)) {
      throw new Error('Model information response is invalid');
    }
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get a 2D depth slice as binary Float32Array */
export async function getModelSlice(
  variable: string = 'thetao',
  depth: number = 0,
  timeIndex: number = 0
): Promise<{ data: Float32Array; metadata: Record<string, string> }> {
  try {
    const res = await api.get('/api/model/slice', {
      params: { variable, depth, time_index: timeIndex },
      responseType: 'arraybuffer',
    });

    const metadata: Record<string, string> = {};
    ['x-width', 'x-height', 'x-min', 'x-max', 'x-variable', 'x-depth',
     'x-lat-min', 'x-lat-max', 'x-lon-min', 'x-lon-max'].forEach((key) => {
      const val = res.headers[key];
      if (val) metadata[key] = val;
    });

    const width = Number(metadata['x-width']);
    const height = Number(metadata['x-height']);
    const data = new Float32Array(res.data);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length !== width * height) {
      throw new Error('Model slice response is incomplete or invalid');
    }

    notifySuccess();
    return {
      data,
      metadata,
    };
  } catch (e) { throw e; }
}

/** Get a vertical profile from the model */
export async function getModelProfile(
  variable: string,
  lat: number,
  lon: number,
  timeIndex: number = 0
) {
  try {
    const res = await api.get('/api/model/profile', {
      params: { variable, lat, lon, time_index: timeIndex },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get all Argo profiles in region */
export async function getArgoProfiles(
  latMin = 0, latMax = 28, lonMin = 60, lonMax = 100
): Promise<{ profiles: ArgoProfileSummary[]; count: number }> {
  try {
    const res = await api.get('/api/observations/argo', {
      params: { lat_min: latMin, lat_max: latMax, lon_min: lonMin, lon_max: lonMax },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get a specific Argo profile with full data */
export async function getArgoProfile(profileId: string): Promise<ArgoProfile> {
  try {
    const res = await api.get(`/api/observations/argo/${profileId}`);
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Compare an Argo profile against the model */
export async function compareProfile(
  profileId: string,
  variable: string = 'thetao',
  timeIndex: number = 0,
  anomalyThreshold: number = 1.0
): Promise<ComparisonResponse> {
  try {
    const res = await api.get(`/api/compare/profile/${profileId}`, {
      params: { variable, time_index: timeIndex, anomaly_threshold: anomalyThreshold },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get current vectors for visualization */
export async function getCurrentVectors(
  depth: number = 0,
  timeIndex: number = 0,
  subsample: number = 5
) {
  try {
    const res = await api.get('/api/model/currents', {
      params: { depth, time_index: timeIndex, subsample },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get time step dates */
export async function getTimeInfo(): Promise<{ dates: string[]; count: number }> {
  try {
    const res = await api.get('/api/model/time_info');
    if (!res.data || !Array.isArray(res.data.dates)) {
      throw new Error('Model time response is invalid');
    }
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get fleet-wide ML anomaly intelligence summary */
export async function getAnomalySummary(): Promise<AnomalyFleetSummary> {
  try {
    const res = await api.get('/api/anomaly/summary');
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Run deep ML anomaly detection on a single float profile */
export async function detectAnomaly(
  profileId: string,
  variable: string = 'thetao',
  threshold: number = 1.0,
  timeIndex: number = 0
): Promise<AnomalyAnalysisResponse> {
  try {
    const res = await api.get(`/api/anomaly/detect/${profileId}`, {
      params: { variable, threshold, time_index: timeIndex },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Contextual Ocean Region Dossier for right-click inspection */
export async function getOceanDossier(
  lat: number,
  lon: number,
  depth: number = 0,
  timeIndex: number = 0
): Promise<OceanDossierResponse> {
  try {
    const res = await api.get('/api/analytics/dossier', {
      params: { lat, lon, depth, time_index: timeIndex },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Calculate spatial statistics over a bounding box region */
export async function calculateRegionStats(params: {
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  depth?: number;
  time_index?: number;
  variable?: string;
}): Promise<RegionStatsResponse> {
  try {
    const res = await api.post('/api/analytics/region/stats', {
      lat_min: params.lat_min,
      lat_max: params.lat_max,
      lon_min: params.lon_min,
      lon_max: params.lon_max,
      depth: params.depth ?? 0.0,
      time_index: params.time_index ?? 0,
      variable: params.variable ?? 'thetao',
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Calculate ocean transect vertical depth-distance cross section */
export async function calculateTransect(params: {
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  variable?: string;
  time_index?: number;
  num_samples?: number;
}): Promise<TransectResponse> {
  try {
    const res = await api.post('/api/analytics/transect', {
      lat1: params.lat1,
      lon1: params.lon1,
      lat2: params.lat2,
      lon2: params.lon2,
      variable: params.variable ?? 'thetao',
      time_index: params.time_index ?? 0,
      num_samples: params.num_samples ?? 25,
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Grounded AI ocean analyst query */
export async function queryAiAnalyst(params: {
  query: string;
  lat?: number;
  lon?: number;
  depth?: number;
  profile_id?: string;
  time_index?: number;
}): Promise<AiAnalystResponse> {
  try {
    const res = await api.post('/api/analytics/ai/analyze', {
      query: params.query,
      lat: params.lat,
      lon: params.lon,
      depth: params.depth ?? 100.0,
      profile_id: params.profile_id,
      time_index: params.time_index ?? 0,
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

// ═══════════════════════════════════════════════════════════════
// SAGAR-VIEW Multi-Sensor INCOIS Network APIs
// ═══════════════════════════════════════════════════════════════

export interface SensorSummary {
  id: string;
  type: 'argo' | 'moored_buoy' | 'glider';
  platform_id: string;
  latitude: number;
  longitude: number;
  status: string;
  last_report?: string;
}

export interface AllObservationsResponse {
  argo: SensorSummary[];
  moored_buoys: SensorSummary[];
  gliders: SensorSummary[];
  total_platforms: number;
}

export interface CoLocationMatch {
  sensor_id: string;
  sensor_type: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  time_offset_hours: number;
  model_value: number | null;
  observed_value: number | null;
  rmse: number | null;
  bias: number | null;
  match_score: number;
}

export interface CoLocationResponse {
  query: { lat: number; lon: number; radius_km: number; time_window_hours: number };
  matches: CoLocationMatch[];
  total_candidates: number;
}

/** Get all observations across all sensor types (Argo + Buoys + Gliders) */
export async function getAllObservations(): Promise<AllObservationsResponse> {
  try {
    const res = await api.get('/api/observations/all');
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Spatial-temporal co-location: find nearby observations for a model grid point */
export async function getCoLocationResults(params: {
  lat: number;
  lon: number;
  radius_km?: number;
  time_window_hours?: number;
  variable?: string;
  time_index?: number;
}): Promise<CoLocationResponse> {
  try {
    const res = await api.get('/api/analytics/colocate', {
      params: {
        lat: params.lat,
        lon: params.lon,
        radius_km: params.radius_km ?? 200,
        time_window_hours: params.time_window_hours ?? 24,
        variable: params.variable ?? 'thetao',
        time_index: params.time_index ?? 0,
      },
    });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Get 2D Tropical Cyclone Heat Potential (TCHP) & Marine Heatwave (MHW) grid */
export async function getHeatPotential(params?: {
  time_index?: number;
  lat_min?: number;
  lat_max?: number;
  lon_min?: number;
  lon_max?: number;
}): Promise<HeatPotentialResponse> {
  try {
    const res = await api.get('/api/v1/analytics/heat-potential', { params });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/** Point inspection for Tropical Cyclone Heat Potential HUD */
export async function inspectHeatPotentialPoint(params: {
  lat: number;
  lon: number;
  time_index?: number;
}): Promise<HeatPotentialPoint> {
  try {
    const res = await api.get('/api/v1/analytics/heat-potential/point', { params });
    notifySuccess();
    return res.data;
  } catch (e) { throw e; }
}

/**
 * Real-time sea state and 72-hour forecast (Open-Meteo Marine). Throws if the
 * provider is unavailable — the UI shows the error instead of invented values.
 */
export async function getRealtimeOcean(lat: number = 14.5, lon: number = 84.8): Promise<LiveOceanResponse> {
  const res = await api.get<LiveOceanResponse>('/api/realtime/live-ocean', { params: { lat, lon }, timeout: 20000 });
  return res.data;
}

/** Live Argo float network index from Ifremer ERDDAP (upstream query can take 10–15 s). */
export async function getRealtimeFleet(): Promise<LiveFleetResponse> {
  const res = await api.get<LiveFleetResponse>('/api/realtime/fleet-live', { timeout: 30000 });
  return res.data;
}

/**
 * Send a message to the AI Guide chatbot and get an intelligent response.
 */
export interface GuideChatMessage {
  sender: 'user' | 'ai';
  text: string;
}

export interface GuideChatResponse {
  reply: string;
  source: 'gemini' | 'fallback';
}

export async function chatWithGuide(
  message: string,
  context?: Record<string, unknown>,
  history?: GuideChatMessage[],
): Promise<GuideChatResponse> {
  try {
    const res = await api.post<GuideChatResponse>(
      '/api/guide/chat',
      {
        message,
        context: context || {},
        history: history || [],
      },
      // LLM replies routinely take >10s; the 8s global axios timeout aborts
      // them mid-flight, so this endpoint gets its own generous budget.
      { timeout: 45000 }
    );
    return res.data;
  } catch (e) { throw e; }
}
