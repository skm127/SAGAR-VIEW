"""Pydantic schemas for OCEAN-X data models.

These match the internal data model specification:
- Observation: normalized observation from any platform (Argo, Glider, CTD, etc.)
- ModelField: normalized model grid point value
- ComparisonResult: model vs observation deviation at a depth level
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Union
from datetime import datetime
from enum import Enum


class PlatformType(str, Enum):
    ARGO = "argo"
    GLIDER = "glider"
    CTD = "ctd"
    BGC = "bgc"
    MOORING = "mooring"
    MOORED_BUOY = "moored_buoy"


class Variable(str, Enum):
    TEMPERATURE = "thetao"
    SALINITY = "so"
    EASTWARD_CURRENT = "uo"
    NORTHWARD_CURRENT = "vo"


class Observation(BaseModel):
    """A single observation measurement at a specific depth."""
    id: str
    platform_type: Union[PlatformType, str]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=360)
    timestamp: Union[datetime, str]
    depth: float = Field(ge=0, description="Depth in meters")
    variable: Union[Variable, str]
    value: float
    unit: str
    source: str


class ModelFieldPoint(BaseModel):
    """A single model grid point value."""
    dataset_id: str
    variable: Union[Variable, str]
    timestamp: Union[datetime, str]
    latitude: float
    longitude: float
    depth: float
    value: float
    unit: str


class ComparisonResult(BaseModel):
    """Comparison between model and observation at one depth."""
    depth: float
    model_value: float
    observed_value: float
    delta: float
    unit: str
    anomaly_flag: bool = Field(default=False, description="True if |delta| exceeds threshold")


class ComparisonResponse(BaseModel):
    """Full comparison response for an observation profile."""
    observation_id: str
    platform_type: Union[PlatformType, str]
    latitude: float
    longitude: float
    timestamp: Union[datetime, str]
    variable: Union[Variable, str]
    comparisons: List[ComparisonResult]
    anomaly_detected: bool = False
    anomaly_threshold: float = 1.0
    model_time_index: Optional[int] = None
    time_offset_hours: Optional[float] = None
    model_source: Optional[str] = None


class ObservationProfile(BaseModel):
    """A complete observation profile (all depths for one float/cast)."""
    id: str
    platform_id: Optional[str] = None
    platform_type: Union[PlatformType, str]
    latitude: float
    longitude: float
    timestamp: Union[datetime, str]
    depths: List[float]
    temperatures: Optional[List[Optional[float]]] = None
    salinities: Optional[List[Optional[float]]] = None
    source: Optional[str] = "Argo GDAC"


class ModelSliceMetadata(BaseModel):
    """Metadata returned with a binary model data slice."""
    variable: str
    depth: float
    time_index: int
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    width: int
    height: int
    value_min: float
    value_max: float


class DatasetInfo(BaseModel):
    """Information about a loaded dataset."""
    filename: Optional[str] = None
    variables: List[str]
    dimensions: dict
    lat_range: List[float]
    lon_range: List[float]
    depth_levels: List[float]
    time_steps: int
    is_synthetic: bool = True
    # Real time coverage of the dataset (ISO strings) — None when undated
    dataset_time_range: Optional[List[Optional[str]]] = None
    source_provenance: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    app_name: str
    model_data_loaded: bool
    argo_data_loaded: bool
    model_info: Optional[DatasetInfo] = None
    argo_info: Optional[dict] = None


class DataFreshness(BaseModel):
    """Real timestamps of the loaded datasets, surfaced in the UI so users can
    see how fresh the served data is (Phase 2c)."""
    model_dataset_time_range: Optional[List[Optional[str]]] = None
    model_file_loaded_at: Optional[str] = None
    argo_most_recent_profile: Optional[str] = None
    checked_at: Optional[str] = None


class CoLocationMatch(BaseModel):
    """One in-situ platform matched to the model grid near the query point."""
    sensor_id: str
    platform_id: Optional[str] = None
    profile_id: Optional[str] = None
    sensor_type: str
    name: Optional[str] = None
    latitude: float
    longitude: float
    timestamp: Optional[str] = None
    distance_km: float
    time_offset_hours: float
    temporal_delta_hours: float
    model_value: Optional[float] = None
    observed_value: Optional[float] = None
    rmse: Optional[float] = None
    bias: Optional[float] = None
    qc_passed: bool = True
    n_soundings: int = 0
    max_depth_m: float = 0.0
    match_score: float


class CoLocationQuery(BaseModel):
    latitude: float
    longitude: float
    radius_km: float
    time_window_hours: float
    variable: str
    time_index: int


class CoLocationResponse(BaseModel):
    """Response contract for /api/analytics/colocate (matches frontend api.ts)."""
    query: CoLocationQuery
    matches: List[CoLocationMatch]
    total_candidates: int


class AnomalyFeatures(BaseModel):
    mean_delta: float
    max_delta: float
    upper_200m_heat_delta: float
    thermocline_gradient_diff: float
    max_layer_depth: float


class AnomalyFleetMember(BaseModel):
    id: str
    platform_id: str
    latitude: float
    longitude: float
    status: str
    severity: str
    anomaly_score: float
    max_delta: float
    max_depth: float
    hypothesis: str
    timestamp: Optional[str] = None
    time_offset_hours: Optional[float] = None


class AnomalyFleetSummary(BaseModel):
    """Fleet-wide Isolation Forest summary driving the header anomaly badge."""
    total_floats: int
    critical_count: int
    warning_count: int
    nominal_count: int
    highest_anomaly_float: Optional[AnomalyFleetMember] = None
    fleet: List[AnomalyFleetMember]
    excluded_outside_model_window: int = 0
    model_source: Optional[str] = None
    ml_training_source: Optional[str] = None
    ml_training_profiles: int = 0


class AnomalyLayerEntry(BaseModel):
    depth: float
    model: float
    observed: float
    delta: float
    is_anomaly: bool


class AnomalyAnalysisResponse(BaseModel):
    """Single-profile Isolation Forest analysis (/api/anomaly/detect/{id})."""
    profile_id: str
    variable: str
    anomaly_score: float
    status: str
    severity: str
    features: AnomalyFeatures
    hypothesis: str
    anomalous_layer_count: int
    anomalous_depth_range: Optional[List[float]] = None
    layer_breakdown: List[AnomalyLayerEntry]
    ml_metadata: dict


class HeatPotentialStatistics(BaseModel):
    """Aggregated statistical telemetry for Tropical Cyclone Heat Potential."""
    tchp_min: float
    tchp_max: float
    tchp_mean: float
    d26_min: float
    d26_max: float
    d26_mean: float
    sst_min: float
    sst_max: float
    sst_mean: float
    high_risk_cells: int
    high_risk_percentage: float
    cyclone_intensification_threshold: float = 50.0


class HeatPotentialMetadata(BaseModel):
    """Metadata describing the spatial bounds and scientific formula."""
    time_index: int
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    width: int
    height: int
    formula: str
    provenance: str
    unit: str = "kJ/cm^2"
    valid_time: Optional[str] = None
    time_role: Optional[str] = None
    mhw_method: Optional[str] = None


class HeatPotentialResponse(BaseModel):
    """2D spatial grid response for Tropical Cyclone Heat Potential and Marine Heatwaves."""
    metadata: HeatPotentialMetadata
    statistics: HeatPotentialStatistics
    lats: List[float]
    lons: List[float]
    tchp: List[List[Optional[float]]]
    d26: List[List[Optional[float]]]
    mhw_category: List[List[Optional[int]]]


class HeatPotentialPoint(BaseModel):
    """Point inspection result for a single geographic coordinate."""
    latitude: float
    longitude: float
    tchp: float
    d26: float
    sst: float
    mhw_category: int
    mhw_label: str
    cyclone_risk: str
    high_risk_flag: bool
    unit: str = "kJ/cm^2"
    formula: str
    model_source: Optional[str] = None
    valid_time: Optional[str] = None
    time_role: Optional[str] = None

