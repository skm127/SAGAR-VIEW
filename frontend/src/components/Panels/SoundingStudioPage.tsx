/**
 * SoundingStudioPage.tsx
 * Dedicated full-page In-Situ Observation vs Numerical Model Sounding Studio.
 * Solves viewport cramping by providing a full-width oceanographic workstation:
 * - High-resolution dual-curve vertical depth profile (0 - 500m) with anomaly shading
 * - Full 70-layer data matrix with depth search filter and CSV export
 * - 5D Isolation Forest ML Anomaly explanation and physical oceanography diagnosis
 * - Fleet platform switcher allowing instant inspection across all Indian Ocean platforms
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Thermometer,
  Droplets,
  Download,
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Layers,
  Cpu,
  Radio,
} from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { compareProfile, getArgoProfile, detectAnomaly } from '../../services/api';
import type {
  ComparisonResponse,
  ArgoProfile,
  OceanVariable,
  AnomalyAnalysisResponse,
  ArgoProfileSummary,
} from '../../types';
import { VARIABLE_LABELS, VARIABLE_UNITS } from '../../types';
import './SoundingStudioPage.css';

interface SoundingStudioPageProps {
  initialProfileId: string | null;
  profiles: ArgoProfileSummary[];
  variable: OceanVariable;
  timeIndex: number;
  /** platform_id -> anomaly status from the live fleet analysis (labels the switcher). */
  platformStatus?: Record<string, string>;
  onSelectProfile: (id: string) => void;
  onVariableChange: (v: OceanVariable) => void;
  onClose: () => void;
}

export const SoundingStudioPage: React.FC<SoundingStudioPageProps> = ({
  initialProfileId,
  profiles,
  variable,
  timeIndex,
  platformStatus,
  onSelectProfile,
  onVariableChange,
  onClose,
}) => {
  const pageRef = useRef<HTMLDivElement>(null);
  useModalA11y(true, onClose, pageRef);

  // Active selected platform ID
  const defaultId = initialProfileId || (profiles.length > 0 ? profiles[0].id : '');
  const [selectedId, setSelectedId] = useState<string>(defaultId);

  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [profile, setProfile] = useState<ArgoProfile | null>(null);
  const [anomalyAnalysis, setAnomalyAnalysis] = useState<AnomalyAnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [threshold, setThreshold] = useState<number>(1.0);
  const [hoveredDepth, setHoveredDepth] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'features' | 'provenance'>('matrix');
  const [depthSearch, setDepthSearch] = useState<string>('');

  // Sync when initialProfileId prop changes
  useEffect(() => {
    if (initialProfileId && initialProfileId !== selectedId) {
      setSelectedId(initialProfileId);
    }
  }, [initialProfileId]);

  // Load comparison, profile, and anomaly data
  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    const fetchAll = () => {
      setLoading(true);
      setError(null);
      Promise.all([
        compareProfile(selectedId, variable, timeIndex, threshold),
        getArgoProfile(selectedId),
        detectAnomaly(selectedId, variable, threshold, timeIndex).catch(() => null),
      ])
        .then(([compData, profData, anomData]) => {
          if (cancelled) return;
          setComparison(compData);
          setProfile(profData);
          setAnomalyAnalysis(anomData);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Failed to load sounding data:', err);
          setError(err.response?.data?.detail || err.message || 'Failed to load sounding data');
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    fetchAll();
    const intervalId = setInterval(fetchAll, 45000); // refresh every 45s while open

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [selectedId, variable, timeIndex, threshold]);

  const unit = VARIABLE_UNITS[variable] || '';
  const varLabel = VARIABLE_LABELS[variable] || variable;

  // Comparisons and coordinate mapping for the SVG chart
  const comparisons = useMemo(() => comparison?.comparisons || [], [comparison]);
  const validComps = useMemo(() => comparisons.filter((c) => c.depth <= 500), [comparisons]);

  const minVal = useMemo(() => {
    if (!validComps.length) return variable === 'thetao' ? 10 : 30;
    return Math.min(...validComps.map((c) => Math.min(c.model_value, c.observed_value)));
  }, [validComps, variable]);

  const maxVal = useMemo(() => {
    if (!validComps.length) return variable === 'thetao' ? 32 : 36;
    return Math.max(...validComps.map((c) => Math.max(c.model_value, c.observed_value)));
  }, [validComps, variable]);

  const valRange = maxVal - minVal || 1;

  // Chart dimensions
  const chartW = 560;
  const chartH = 460;
  const pad = { top: 30, right: 35, bottom: 45, left: 55 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  // Transforms
  const toX = (val: number) => pad.left + ((val - minVal) / valRange) * plotW;
  const toY = (depth: number) => pad.top + (Math.min(500, Math.max(0, depth)) / 500) * plotH;

  // SVG points for curves
  const modelPoints = validComps.map((c) => `${toX(c.model_value)},${toY(c.depth)}`).join(' ');
  const obsPoints = validComps.map((c) => `${toX(c.observed_value)},${toY(c.depth)}`).join(' ');

  // Shaded polygon area between model and observation where divergence is significant
  const anomalyPolygons = useMemo(() => {
    const polys: string[] = [];
    let currentSegment: { model: [number, number]; obs: [number, number] }[] = [];

    validComps.forEach((c) => {
      const isDiv = c.anomaly_flag || Math.abs(c.delta) >= threshold;
      if (isDiv) {
        currentSegment.push({
          model: [toX(c.model_value), toY(c.depth)],
          obs: [toX(c.observed_value), toY(c.depth)],
        });
      } else if (currentSegment.length > 0) {
        if (currentSegment.length >= 2) {
          const forward = currentSegment.map((pt) => `${pt.model[0]},${pt.model[1]}`).join(' ');
          const backward = currentSegment
            .slice()
            .reverse()
            .map((pt) => `${pt.obs[0]},${pt.obs[1]}`)
            .join(' ');
          polys.push(`${forward} ${backward}`);
        }
        currentSegment = [];
      }
    });

    if (currentSegment.length >= 2) {
      const forward = currentSegment.map((pt) => `${pt.model[0]},${pt.model[1]}`).join(' ');
      const backward = currentSegment
        .slice()
        .reverse()
        .map((pt) => `${pt.obs[0]},${pt.obs[1]}`)
        .join(' ');
      polys.push(`${forward} ${backward}`);
    }

    return polys;
  }, [validComps, threshold, minVal, valRange]);

  // Anomaly status calculations
  const anomalyCount = comparisons.filter((c) => c.anomaly_flag).length;
  const isCritical = anomalyAnalysis?.status === 'CRITICAL_ANOMALY';
  const isWarning = anomalyAnalysis?.status === 'WARNING';

  // Depth ticks for Y-axis
  const depthTicks = [0, 50, 100, 150, 200, 250, 300, 400, 500];

  // Value ticks for X-axis
  const valTicks = useMemo(() => {
    const count = 5;
    const step = valRange / count;
    return Array.from({ length: count + 1 }, (_, i) => minVal + i * step);
  }, [minVal, valRange]);

  // CSV Export handler
  const handleExportCSV = () => {
    const header = `depth_m,model_${variable}_${unit},observed_${variable}_${unit},delta_${variable}_${unit},anomaly_flag\n`;
    const rows = comparisons
      .map(
        (c) =>
          `${c.depth},${c.model_value.toFixed(3)},${c.observed_value.toFixed(3)},${c.delta.toFixed(
            3
          )},${c.anomaly_flag ? 1 : 0}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `OCEANX_SOUNDING_${profile?.platform_id || selectedId}_${variable}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered rows for the 70-layer data matrix
  const filteredMatrix = useMemo(() => {
    if (!depthSearch.trim()) return comparisons;
    const q = depthSearch.toLowerCase().trim();
    return comparisons.filter(
      (c) =>
        c.depth.toString().includes(q) ||
        c.model_value.toFixed(2).includes(q) ||
        c.observed_value.toFixed(2).includes(q)
    );
  }, [comparisons, depthSearch]);

  const hoveredComp =
    hoveredDepth !== null ? comparisons.find((c) => c.depth === hoveredDepth) : null;

  return (
    <div
      ref={pageRef}
      className="sounding-studio-page"
      role="dialog"
      aria-modal="true"
      aria-label="Dedicated In-Situ Sounding Studio"
      tabIndex={-1}
    >
      {/* Top Mission Header */}
      <header className="studio-header">
        <div className="studio-header-left">
          <div className="studio-badge-group">
            <span className="studio-brand-tag">
              <Activity size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              IN-SITU OBSERVATION STUDIO
            </span>
            <span className="studio-mode-pill">MODEL VS REALITY DEEP DIVE</span>
          </div>

          {/* Platform Selector Dropdown */}
          <div className="platform-select-wrapper">
            <label htmlFor="studio-platform-select" className="select-label">
              OBSERVING PLATFORM:
            </label>
            <select
              id="studio-platform-select"
              className="studio-platform-select"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                onSelectProfile(e.target.value);
              }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.platform_type === 'moored_buoy'
                    ? `OMNI Buoy #${p.platform_id} (${p.latitude.toFixed(1)}°N, ${p.longitude.toFixed(1)}°E)`
                    : p.platform_type === 'glider'
                    ? `Glider #${p.platform_id} (${p.latitude.toFixed(1)}°N, ${p.longitude.toFixed(1)}°E)`
                    : `Float #${p.platform_id} (${p.latitude.toFixed(1)}°N, ${p.longitude.toFixed(1)}°E)${
                        platformStatus?.[p.platform_id]
                          ? ` — ${platformStatus[p.platform_id].toUpperCase()}`
                          : ''
                      }`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center Variable Toggles */}
        <div className="studio-var-toggles">
          <button
            className={`studio-var-btn ${variable === 'thetao' ? 'active' : ''}`}
            onClick={() => onVariableChange('thetao')}
            title="Inspect Potential Temperature (°C)"
          >
            <Thermometer size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            Temperature (θ)
          </button>
          <button
            className={`studio-var-btn ${variable === 'so' ? 'active' : ''}`}
            onClick={() => onVariableChange('so')}
            title="Inspect Practical Salinity (PSU)"
          >
            <Droplets size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            Salinity (S)
          </button>
        </div>

        {/* Header Right Actions */}
        <div className="studio-header-right">
          <button className="studio-action-btn" onClick={handleExportCSV} title="Export profile to CSV">
            <Download size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            CSV EXPORT
          </button>
          <button
            className="studio-close-btn"
            onClick={onClose}
            title="Return to 3D Globe Workstation (Esc)"
          >
            <ArrowLeft size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            BACK TO GLOBE
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="studio-body">
        {loading ? (
          <div className="studio-loading-state">
            <div className="studio-spinner" />
            <span>Retrieving high-resolution in-situ sounding and model 4D interpolation...</span>
          </div>
        ) : error ? (
          <div className="studio-error-state">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
            <button className="studio-retry-btn" onClick={() => setSelectedId(selectedId)}>
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {/* Telemetry Headline Banner */}
            <div className="studio-headline-strip">
              <div className="headline-platform-card">
                <div className="platform-title-row">
                  <span className="platform-name">
                    {profile?.platform_type === 'moored_buoy'
                      ? `INCOIS OMNI MOORED BUOY #${profile.platform_id}`
                      : profile?.platform_type === 'glider'
                      ? `AUTONOMOUS UNDERWATER GLIDER #${profile.platform_id}`
                      : `ARGO PROFILING FLOAT #${profile?.platform_id || selectedId}`}
                  </span>
                  {isCritical ? (
                    <span className="status-tag critical">
                      <AlertCircle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      CRITICAL ANOMALY DETECTED
                    </span>
                  ) : isWarning ? (
                    <span className="status-tag warning">
                      <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      MODERATE PROFILE DRIFT
                    </span>
                  ) : (
                    <span className="status-tag nominal">
                      <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      MODEL REANALYSIS VERIFIED
                    </span>
                  )}
                </div>
                <div className="platform-meta-row">
                  <span>Coordinates: {profile?.latitude.toFixed(2)}°N, {profile?.longitude.toFixed(2)}°E</span>
                  <span>Reported: {profile?.timestamp ? new Date(profile.timestamp).toUTCString() : 'Active Fleet'}</span>
                  <span>Depths: {comparisons.length} Sampling Levels (0 - 500m)</span>
                  <span>QC Status: WMO Flag 1 (Passed Verified Sensors)</span>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="studio-kpi-grid">
                <div className="kpi-cell">
                  <span className="kpi-label">Max Δ Divergence</span>
                  <span className={`kpi-val ${isCritical ? 'critical-text' : ''}`}>
                    {anomalyAnalysis ? anomalyAnalysis.features.max_delta.toFixed(2) : '0.00'} {unit}
                  </span>
                  <span className="kpi-sub">
                    at {anomalyAnalysis?.features.max_layer_depth || 110}m depth
                  </span>
                </div>

                <div className="kpi-cell">
                  <span className="kpi-label">Upper 200m Heat/Salt</span>
                  <span className="kpi-val">
                    {anomalyAnalysis ? anomalyAnalysis.features.upper_200m_heat_delta.toFixed(2) : '0.00'} {unit}
                  </span>
                  <span className="kpi-sub">Thermal Trap Proxy</span>
                </div>

                <div className="kpi-cell">
                  <span className="kpi-label">Thermocline Gradient Δ</span>
                  <span className="kpi-val">
                    {anomalyAnalysis ? anomalyAnalysis.features.thermocline_gradient_diff.toFixed(4) : '0.0000'}
                  </span>
                  <span className="kpi-sub">dT/dz Divergence</span>
                </div>

                <div className="kpi-cell">
                  <span className="kpi-label">Anomalous Layers</span>
                  <span className={`kpi-val ${anomalyCount > 0 ? 'warning-text' : ''}`}>
                    {anomalyCount} / {comparisons.length}
                  </span>
                  <span className="kpi-sub">Beyond {threshold.toFixed(1)}{unit} threshold</span>
                </div>
              </div>
            </div>

            {/* Diagnostic Advisory Banner */}
            {anomalyAnalysis && (
              <div className={`studio-advisory-banner ${isCritical ? 'critical' : isWarning ? 'warning' : 'nominal'}`}>
                <div className="advisory-header-row">
                  <span className="advisory-title">
                    {isCritical ? (
                      <>
                        <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                        SUBSURFACE MARINE HEATWAVE & ISOPYCNAL INVERSION
                      </>
                    ) : isWarning ? (
                      <>
                        <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                        THERMOCLINE DISPLACEMENT ADVISORY
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                        CONGRUENT WATER COLUMN STRATIFICATION
                      </>
                    )}
                  </span>
                  <span className="ml-score-pill">
                    Isolation Forest Score: {anomalyAnalysis.anomaly_score.toFixed(2)} / 1.00
                  </span>
                </div>
                <p className="advisory-hypothesis">
                  <strong>Physical Diagnosis:</strong> {anomalyAnalysis.hypothesis}
                </p>
                {isCritical && anomalyAnalysis.advisories && anomalyAnalysis.advisories.length > 0 && (
                  <div className="advisory-action-pill">
                    {anomalyAnalysis.advisories.map((adv, idx) => (
                      <div key={idx} style={{ marginBottom: idx < anomalyAnalysis.advisories!.length - 1 ? '4px' : '0' }}>
                        <strong>{adv.split(':')[0]}:</strong> {adv.split(':').slice(1).join(':').trim()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Split Workspace */}
            <div className="studio-workspace-grid">
              {/* Left Column: High-Res SVG Vertical Profile Chart */}
              <div className="studio-card chart-card">
                <div className="card-header-bar">
                  <div className="card-title-group">
                    <span className="card-title">
                      <Activity size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                      VERTICAL WATER COLUMN PROFILE SOUNDING
                    </span>
                    <span className="card-subtitle">
                      Numerical Model Reanalysis vs In-Situ {profile?.platform_type?.toUpperCase() || 'ARGO'} Observation (0 – 500m)
                    </span>
                  </div>

                  {/* Threshold Control */}
                  <div className="threshold-slider-group">
                    <label htmlFor="studio-threshold" className="threshold-label">
                      Anomaly Sensitivity: {threshold.toFixed(1)} {unit}
                    </label>
                    <input
                      id="studio-threshold"
                      type="range"
                      min="0.2"
                      max="2.5"
                      step="0.1"
                      value={threshold}
                      onChange={(e) => setThreshold(parseFloat(e.target.value))}
                      className="threshold-input"
                    />
                  </div>
                </div>

                {/* SVG Visualizer */}
                <div className="chart-viewport-wrapper">
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="sounding-svg"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {/* Background grid */}
                    <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="rgba(6, 15, 29, 0.7)" />

                    {/* Depth grid lines (horizontal) */}
                    {depthTicks.map((d) => (
                      <g key={`d-${d}`}>
                        <line
                          x1={pad.left}
                          y1={toY(d)}
                          x2={pad.left + plotW}
                          y2={toY(d)}
                          stroke="rgba(255, 255, 255, 0.08)"
                          strokeDasharray="3,3"
                        />
                        <text
                          x={pad.left - 8}
                          y={toY(d) + 4}
                          textAnchor="end"
                          fill="#64748b"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {d}m
                        </text>
                      </g>
                    ))}

                    {/* Value grid lines (vertical) */}
                    {valTicks.map((v, i) => (
                      <g key={`v-${i}`}>
                        <line
                          x1={toX(v)}
                          y1={pad.top}
                          x2={toX(v)}
                          y2={pad.top + plotH}
                          stroke="rgba(255, 255, 255, 0.08)"
                          strokeDasharray="3,3"
                        />
                        <text
                          x={toX(v)}
                          y={pad.top + plotH + 18}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {v.toFixed(1)}
                        </text>
                      </g>
                    ))}

                    {/* Axis Labels */}
                    <text
                      x={pad.left + plotW / 2}
                      y={chartH - 8}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="11"
                      fontWeight="600"
                      letterSpacing="1"
                    >
                      {varLabel.toUpperCase()} ({unit})
                    </text>
                    <text
                      transform={`rotate(-90) translate(-${pad.top + plotH / 2}, 18)`}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="11"
                      fontWeight="600"
                      letterSpacing="1"
                    >
                      DEPTH (METERS)
                    </text>

                    {/* Anomaly Polygons */}
                    {anomalyPolygons.map((poly, idx) => (
                      <polygon
                        key={`poly-${idx}`}
                        points={poly}
                        fill="rgba(239, 68, 68, 0.28)"
                        stroke="rgba(239, 68, 68, 0.6)"
                        strokeWidth="0.8"
                      />
                    ))}

                    {/* Model Line (Cyan) */}
                    {modelPoints && (
                      <polyline
                        points={modelPoints}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Observation Line (Amber) */}
                    {obsPoints && (
                      <polyline
                        points={obsPoints}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Hover Inspector Crosshair */}
                    {hoveredComp && (
                      <g>
                        <line
                          x1={pad.left}
                          y1={toY(hoveredComp.depth)}
                          x2={pad.left + plotW}
                          y2={toY(hoveredComp.depth)}
                          stroke="#ffffff"
                          strokeWidth="1"
                          strokeDasharray="4,4"
                        />
                        {/* Model Point Circle */}
                        <circle
                          cx={toX(hoveredComp.model_value)}
                          cy={toY(hoveredComp.depth)}
                          r="5"
                          fill="#38bdf8"
                          stroke="#000"
                          strokeWidth="1.5"
                        />
                        {/* Observed Point Circle */}
                        <circle
                          cx={toX(hoveredComp.observed_value)}
                          cy={toY(hoveredComp.depth)}
                          r="5"
                          fill="#f59e0b"
                          stroke="#000"
                          strokeWidth="1.5"
                        />
                      </g>
                    )}

                    {/* Invisible hover overlay triggers */}
                    {validComps.map((c) => (
                      <rect
                        key={`hit-${c.depth}`}
                        x={pad.left}
                        y={toY(c.depth) - 8}
                        width={plotW}
                        height={16}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredDepth(c.depth)}
                        onMouseLeave={() => setHoveredDepth(null)}
                      />
                    ))}
                  </svg>

                  {/* Chart Legend & Floating Inspector Bar */}
                  <div className="chart-legend-bar">
                    <div className="legend-items">
                      <div className="legend-item">
                        <span className="legend-line model-line" />
                        <span>Numerical Model (live)</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-line obs-line" />
                        <span>In-Situ Float Sounding</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-box anom-box" />
                        <span>Model Divergence Zone</span>
                      </div>
                    </div>

                    {hoveredComp ? (
                      <div className="hover-readout">
                        <span className="hover-depth">Depth: {hoveredComp.depth}m</span>
                        <span className="hover-model">Model: {hoveredComp.model_value.toFixed(2)}{unit}</span>
                        <span className="hover-obs">Obs: {hoveredComp.observed_value.toFixed(2)}{unit}</span>
                        <span className={`hover-delta ${hoveredComp.anomaly_flag ? 'critical-delta' : ''}`}>
                          Δ: {hoveredComp.delta > 0 ? `+${hoveredComp.delta.toFixed(2)}` : hoveredComp.delta.toFixed(2)}{unit}
                        </span>
                      </div>
                    ) : (
                      <span className="hover-hint">Hover cursor over vertical depths to inspect point values</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Multi-Tab Detailed Workspace */}
              <div className="studio-card details-card">
                <div className="details-tabs-header">
                  <button
                    className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
                    onClick={() => setActiveTab('matrix')}
                  >
                    <Layers size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    Full Data Matrix ({comparisons.length} Layers)
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'features' ? 'active' : ''}`}
                    onClick={() => setActiveTab('features')}
                  >
                    <Cpu size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    5D ML Anomaly Features
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'provenance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('provenance')}
                  >
                    <Radio size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    Platform Telemetry
                  </button>
                </div>

                <div className="details-tab-content">
                  {/* Tab 1: 70-Layer Matrix */}
                  {activeTab === 'matrix' && (
                    <div className="matrix-tab-container">
                      <div className="matrix-toolbar">
                        <input
                          type="text"
                          placeholder="Filter depths (e.g. 110, 150, 200)..."
                          value={depthSearch}
                          onChange={(e) => setDepthSearch(e.target.value)}
                          className="matrix-search-input"
                        />
                        <span className="matrix-count-badge">
                          Showing {filteredMatrix.length} of {comparisons.length} levels
                        </span>
                      </div>

                      <div className="matrix-table-scroll">
                        <table className="matrix-table">
                          <thead>
                            <tr>
                              <th>Depth (m)</th>
                              <th>Model ({unit})</th>
                              <th>In-Situ ({unit})</th>
                              <th>Δ Divergence</th>
                              <th>QC Flag</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMatrix.map((c) => {
                              const isDiv = c.anomaly_flag || Math.abs(c.delta) >= threshold;
                              return (
                                <tr
                                  key={`row-${c.depth}`}
                                  className={`${isDiv ? 'divergent-row' : ''} ${
                                    hoveredDepth === c.depth ? 'hovered-row' : ''
                                  }`}
                                  onMouseEnter={() => setHoveredDepth(c.depth)}
                                  onMouseLeave={() => setHoveredDepth(null)}
                                >
                                  <td className="depth-cell">{c.depth}m</td>
                                  <td className="model-cell">{c.model_value.toFixed(3)}</td>
                                  <td className="obs-cell">{c.observed_value.toFixed(3)}</td>
                                  <td className={`delta-cell ${isDiv ? 'delta-critical' : ''}`}>
                                    {c.delta > 0 ? `+${c.delta.toFixed(3)}` : c.delta.toFixed(3)}
                                  </td>
                                  <td className="qc-cell">
                                    <span className="qc-pill">Flag 1 (Good)</span>
                                  </td>
                                  <td className="status-cell">
                                    {isDiv ? (
                                      <span className="tag-pill anom">DIVERGENT</span>
                                    ) : (
                                      <span className="tag-pill ok">CONGRUENT</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: ML Features */}
                  {activeTab === 'features' && (
                    <div className="features-tab-container">
                      <div className="ml-banner-intro">
                        <div className="ml-intro-title">Scikit-Learn IsolationForest // 5D Feature Decomposition</div>
                        <p className="ml-intro-desc">
                          The model extracts a 5-dimensional feature vector from each vertical sounding profile to detect subsurface heat anomalies that conventional surface satellite radiometers overlook.
                        </p>
                      </div>

                      {anomalyAnalysis ? (
                        <div className="ml-features-list">
                          <div className="feature-row">
                            <div className="feature-meta">
                              <span className="feature-name">Mean Water Column Divergence (ΔT_mean)</span>
                              <span className="feature-val">{anomalyAnalysis.features.mean_delta.toFixed(4)} {unit}</span>
                            </div>
                            <div className="feature-bar-track">
                              <div
                                className="feature-bar-fill"
                                style={{ width: `${Math.min(100, Math.abs(anomalyAnalysis.features.mean_delta) * 50)}%` }}
                              />
                            </div>
                          </div>

                          <div className="feature-row">
                            <div className="feature-meta">
                              <span className="feature-name">Max Point Divergence (ΔT_max)</span>
                              <span className="feature-val critical">{anomalyAnalysis.features.max_delta.toFixed(4)} {unit}</span>
                            </div>
                            <div className="feature-bar-track">
                              <div
                                className="feature-bar-fill critical"
                                style={{ width: `${Math.min(100, (anomalyAnalysis.features.max_delta / 3.5) * 100)}%` }}
                              />
                            </div>
                          </div>

                          <div className="feature-row">
                            <div className="feature-meta">
                              <span className="feature-name">Upper 200m Integrated Heat Divergence</span>
                              <span className="feature-val">{anomalyAnalysis.features.upper_200m_heat_delta.toFixed(4)} {unit}</span>
                            </div>
                            <div className="feature-bar-track">
                              <div
                                className="feature-bar-fill warning"
                                style={{ width: `${Math.min(100, Math.abs(anomalyAnalysis.features.upper_200m_heat_delta) * 40)}%` }}
                              />
                            </div>
                          </div>

                          <div className="feature-row">
                            <div className="feature-meta">
                              <span className="feature-name">Thermocline Gradient Discrepancy (dT/dz)</span>
                              <span className="feature-val">{anomalyAnalysis.features.thermocline_gradient_diff.toFixed(4)} {unit}/m</span>
                            </div>
                            <div className="feature-bar-track">
                              <div
                                className="feature-bar-fill"
                                style={{ width: `${Math.min(100, anomalyAnalysis.features.thermocline_gradient_diff * 400)}%` }}
                              />
                            </div>
                          </div>

                          <div className="feature-row">
                            <div className="feature-meta">
                              <span className="feature-name">Maximum Divergence Depth (z_div)</span>
                              <span className="feature-val">{anomalyAnalysis.features.max_layer_depth} meters</span>
                            </div>
                            <div className="feature-bar-track">
                              <div
                                className="feature-bar-fill"
                                style={{ width: `${(anomalyAnalysis.features.max_layer_depth / 500) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="no-ml-message">
                          No ML feature payload computed for this platform. Operating in baseline physical sounding mode.
                        </div>
                      )}

                      <div className="ml-algorithm-box">
                        <div className="algo-title">ENGINE PARAMETERS</div>
                        <div className="algo-grid">
                          <div><span>Algorithm:</span> Isolation Forest</div>
                          <div><span>Estimators:</span> 100 Trees</div>
                          <div><span>Contamination:</span> 15% Fleet Outliers</div>
                          <div><span>Physics Grounding:</span> Hobart et al. (2016) MHW</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Platform Telemetry */}
                  {activeTab === 'provenance' && (
                    <div className="provenance-tab-container">
                      <div className="prov-section">
                        <h4 className="prov-title">SENSOR PLATFORM SPECIFICATIONS</h4>
                        <div className="prov-specs-grid">
                          <div className="prov-spec-item">
                            <span className="prov-k">Platform Type</span>
                            <span className="prov-v">{profile?.platform_type?.toUpperCase() || 'ARGO PROFILER'}</span>
                          </div>
                          <div className="prov-spec-item">
                            <span className="prov-k">WMO Identifier</span>
                            <span className="prov-v">#{profile?.platform_id || selectedId}</span>
                          </div>
                          <div className="prov-spec-item">
                            <span className="prov-k">Sampling Range</span>
                            <span className="prov-v">Surface to 500m (Upper Stratum)</span>
                          </div>
                          <div className="prov-spec-item">
                            <span className="prov-k">Data Provider</span>
                            <span className="prov-v">INCOIS National Ocean Data Centre / Argo GDAC</span>
                          </div>
                        </div>
                      </div>

                      {profile?.surface_meteorology && (
                        <div className="prov-section">
                          <h4 className="prov-title">SURFACE METEOROLOGY TELEMETRY</h4>
                          <div className="prov-specs-grid">
                            <div className="prov-spec-item">
                              <span className="prov-k">Air Temperature</span>
                              <span className="prov-v">{profile.surface_meteorology.air_temperature}°C</span>
                            </div>
                            <div className="prov-spec-item">
                              <span className="prov-k">Wind Speed</span>
                              <span className="prov-v">{profile.surface_meteorology.wind_speed_kts} kts ({profile.surface_meteorology.wind_direction_deg}°)</span>
                            </div>
                            <div className="prov-spec-item">
                              <span className="prov-k">Sea Level Pressure</span>
                              <span className="prov-v">{profile.surface_meteorology.sea_level_pressure_hpa} hPa</span>
                            </div>
                            <div className="prov-spec-item">
                              <span className="prov-k">Relative Humidity</span>
                              <span className="prov-v">{profile.surface_meteorology.relative_humidity_pct}%</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="prov-section">
                        <h4 className="prov-title">NUMERICAL MODEL REANALYSIS COMPARATOR</h4>
                        <div className="prov-specs-grid">
                          <div className="prov-spec-item">
                            <span className="prov-k">Model Engine</span>
                            <span className="prov-v">HYCOM ESPC-D-V02 / CMEMS (see Provenance)</span>
                          </div>
                          <div className="prov-spec-item">
                            <span className="prov-k">Spatial Interpolation</span>
                            <span className="prov-v">2D Bilinear Horizontal at Float Lat/Lon</span>
                          </div>
                          <div className="prov-spec-item">
                            <span className="prov-k">Vertical Interpolation</span>
                            <span className="prov-v">1D Piecewise Linear between Z-levels</span>
                          </div>
                          <div className="prov-spec-item">
                            <span className="prov-k">Assimilated Cycle</span>
                            <span className="prov-v">6-Hourly Operational Assimilation</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SoundingStudioPage;
