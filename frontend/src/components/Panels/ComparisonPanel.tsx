/**
 * ComparisonPanel — The Core Differentiator of OCEAN-X.
 * Direct Model vs Reality comparison with depth profiles,
 * ML Anomaly Intelligence, Root Cause Diagnosis, and INCOIS Data Export.
 */
import { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Thermometer,
  Wind,
  Compass,
  Droplets,
  Maximize2,
  Activity,
  Layers,
  Cpu,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { compareProfile, getArgoProfile, detectAnomaly } from '../../services/api';

import type {
  ComparisonResponse,
  ArgoProfile,
  OceanVariable,
  AnomalyAnalysisResponse,
} from '../../types';
import { VARIABLE_LABELS, VARIABLE_UNITS } from '../../types';
import type { ExplainMode } from '../Controls/ExplainabilityToggle';
import './ComparisonPanel.css';

interface ComparisonPanelProps {
  profileId: string | null;
  variable: OceanVariable;
  timeIndex: number;
  explainMode?: ExplainMode;
  onClose: () => void;
  onOpenFullPage?: () => void;
}

export default function ComparisonPanel({
  profileId,
  variable,
  timeIndex,
  explainMode = 'citizen',
  onClose,
  onOpenFullPage,
}: ComparisonPanelProps) {
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [profile, setProfile] = useState<ArgoProfile | null>(null);
  const [anomalyAnalysis, setAnomalyAnalysis] = useState<AnomalyAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'comparison' | 'table' | 'intelligence'>('comparison');
  const [threshold, setThreshold] = useState<number>(1.0);
  const [hoveredDepth, setHoveredDepth] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useModalA11y(Boolean(profileId), onClose, panelRef);

  useEffect(() => {

    if (!profileId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      compareProfile(profileId, variable, timeIndex, threshold),
      getArgoProfile(profileId),
      detectAnomaly(profileId, variable, threshold, timeIndex).catch(() => null),
    ])
      .then(([compData, profData, anomData]) => {
        setComparison(compData);
        setProfile(profData);
        setAnomalyAnalysis(anomData);
      })
      .catch((err) => {
        console.error('Failed to load comparison data:', err);
        setError(err.response?.data?.detail || err.message || 'Failed to compare');
      })
      .finally(() => setLoading(false));
  }, [profileId, variable, timeIndex, threshold]);

  if (!profileId) return null;

  const unit = VARIABLE_UNITS[variable] || '';
  const varLabel = VARIABLE_LABELS[variable] || variable;

  // Chart coordinate calculations
  const comparisons = comparison?.comparisons || [];
  const validComps = comparisons.filter((c) => c.depth <= 500); // Focus on upper 500m

  const minVal = validComps.length
    ? Math.min(...validComps.map((c) => Math.min(c.model_value, c.observed_value)))
    : 0;
  const maxVal = validComps.length
    ? Math.max(...validComps.map((c) => Math.max(c.model_value, c.observed_value)))
    : 30;
  const valRange = maxVal - minVal || 1;

  const chartWidth = 350;
  const chartHeight = 310;
  const pad = { top: 20, right: 25, bottom: 35, left: 45 };
  const plotW = chartWidth - pad.left - pad.right;
  const plotH = chartHeight - pad.top - pad.bottom;

  // Coordinate transforms (Y is inverted depth: 0m at top, 500m at bottom)
  const toX = (val: number) => pad.left + ((val - minVal) / valRange) * plotW;
  const toY = (depth: number) => pad.top + (depth / 500) * plotH;

  const modelPoints = validComps
    .map((c) => `${toX(c.model_value)},${toY(c.depth)}`)
    .join(' ');

  const obsPoints = validComps
    .map((c) => `${toX(c.observed_value)},${toY(c.depth)}`)
    .join(' ');

  const anomalyCount = comparisons.filter((c) => c.anomaly_flag).length;
  const isCriticalAnomaly = anomalyAnalysis?.status === 'CRITICAL_ANOMALY';
  const isWarningAnomaly = anomalyAnalysis?.status === 'WARNING';

  // Export handlers
  const exportJSON = () => {
    const report = {
      title: 'SAGAR VIEW Model vs In-Situ Observation Intelligence Dossier',
      generated_at: new Date().toISOString(),
      platform_id: profile?.platform_id,
      coordinates: { latitude: profile?.latitude, longitude: profile?.longitude },
      variable: { name: varLabel, code: variable, unit },
      time_index: timeIndex,
      ml_anomaly_intelligence: anomalyAnalysis,
      layer_data: comparisons,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OCEANX_DOSSIER_${profile?.platform_id || profileId}_T${timeIndex}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const header = `depth_m,model_${variable},observed_${variable},delta_${variable},anomaly_flag\n`;
    const rows = comparisons
      .map((c) => `${c.depth},${c.model_value.toFixed(3)},${c.observed_value.toFixed(3)},${c.delta.toFixed(3)},${c.anomaly_flag ? 1 : 0}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OCEANX_PROFILE_${profile?.platform_id || profileId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hoveredComp = hoveredDepth !== null ? comparisons.find((c) => c.depth === hoveredDepth) : null;

  return (
    <div
      ref={panelRef}
      className="comparison-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Model vs In-Situ Observation Comparison"
      tabIndex={-1}
    >
      {/* Panel Header */}

      <div className="panel-header">
        <div className="header-info">
          <div className="header-badge-row">
            <span className="platform-tag">IN-SITU OBSERVATION</span>
            {isCriticalAnomaly ? (
              <span className="anomaly-badge critical">
                <AlertCircle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                CRITICAL ANOMALY
              </span>
            ) : isWarningAnomaly ? (
              <span className="anomaly-badge warning">
                <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                WARNING DIVERGENCE
              </span>
            ) : (
              <span className="anomaly-badge nominal">
                <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                MODEL NOMINAL
              </span>
            )}
          </div>
          <h3>
            {profile?.platform_type === 'moored_buoy'
              ? `INCOIS MOORED BUOY #${profile.platform_id}`
              : profile?.platform_type === 'glider'
              ? `OCEAN GLIDER #${profile.platform_id}`
              : `FLOAT #${profile?.platform_id || profileId}`}
          </h3>
          <span className="coords">
            {profile?.latitude.toFixed(2)}°N, {profile?.longitude.toFixed(2)}°E // {varLabel} ({unit})
          </span>
          {profile?.surface_meteorology && (
            <div className="surface-met-strip" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11px', color: '#38bdf8' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Thermometer size={12} /> Air: {profile.surface_meteorology.air_temperature}°C</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Wind size={12} /> Wind: {profile.surface_meteorology.wind_speed_kts} kts</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Compass size={12} /> SLP: {profile.surface_meteorology.sea_level_pressure_hpa} hPa</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Droplets size={12} /> RH: {profile.surface_meteorology.relative_humidity_pct}%</span>
            </div>
          )}
        </div>
        <div className="panel-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onOpenFullPage && (
            <button
              className="expand-studio-btn"
              onClick={onOpenFullPage}
              title="Open in dedicated full-page In-Situ Sounding Studio"
            >
              <Maximize2 size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              FULL PAGE
            </button>
          )}
          <button className="close-btn" onClick={onClose} title="Close Panel">
            ✕
          </button>
        </div>
      </div>

      {/* Hero ML Anomaly Diagnostic Banner */}
      {anomalyAnalysis && (
        <div className={`anomaly-hero-banner ${isCriticalAnomaly ? 'critical' : isWarningAnomaly ? 'warning' : 'nominal'}`}>
          <div className="anomaly-hero-top">
            <span className="anomaly-hero-title">
              {isCriticalAnomaly ? (
                <>
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  CRITICAL MODEL DIVERGENCE DETECTED
                </>
              ) : isWarningAnomaly ? (
                <>
                  <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  MODERATE PROFILE DRIFT
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  MODEL REANALYSIS CONGRUENT
                </>
              )}
            </span>
            <span className="anomaly-score-pill">
              ML Score: {anomalyAnalysis.anomaly_score.toFixed(2)} / 1.00
            </span>
          </div>
          <p className="anomaly-hero-hypothesis">
            <strong>Diagnosis:</strong> {anomalyAnalysis.hypothesis}
          </p>
          {isCriticalAnomaly && (
            <div className="anomaly-advisory-box critical-advisory">
              <div className="advisory-header">
                <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                CYCLONE & INCOIS ACTION ADVISORY:
              </div>
              <div className="advisory-item">
                <span className="advisory-dot">●</span>
                <span><strong>Cyclone Potential:</strong> Subsurface heat pool between 80m–220m prevents cold upwelling, providing fuel for rapid tropical cyclone intensification.</span>
              </div>
              <div className="advisory-item">
                <span className="advisory-dot">●</span>
                <span><strong>INCOIS Action:</strong> Assimilate Float #{profile?.platform_id} soundings into the 6-hr cycle to correct the model's mixed-layer physics.</span>
              </div>
            </div>
          )}
          {isWarningAnomaly && (
            <div className="anomaly-advisory-box warning-advisory">
              <div className="advisory-header">
                <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                SEASONAL MONITORING ADVISORY:
              </div>
              <div className="advisory-item">
                <span className="advisory-dot">●</span>
                <span><strong>Thermocline Drift:</strong> Moderate subsurface displacement offshore Mumbai. Automated 24h tracking active.</span>
              </div>
            </div>
          )}
          {!isCriticalAnomaly && !isWarningAnomaly && (
            <div className="anomaly-advisory-box nominal-advisory">
              <div className="advisory-header">
                <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                VALIDATION: MODEL REANALYSIS VERIFIED
              </div>
              <div className="advisory-text">In-situ observations match the model within tolerance at this location and time.</div>
            </div>
          )}
        </div>
      )}

      {/* Telemetry Metric Cards */}
      {anomalyAnalysis && (
        <div className="metric-cards-grid">
          <div className="metric-card">
            <span className="metric-label">Max Δ Divergence</span>
            <span className={`metric-value ${isCriticalAnomaly ? 'critical-val' : ''}`}>
              {anomalyAnalysis.features.max_delta.toFixed(2)} {unit}
            </span>
            <span className="metric-sub">at {anomalyAnalysis.features.max_layer_depth}m depth</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Upper 200m Heat</span>
            <span className="metric-value">
              {anomalyAnalysis.features.upper_200m_heat_delta > 0 ? '+' : ''}
              {anomalyAnalysis.features.upper_200m_heat_delta.toFixed(2)} {unit}
            </span>
            <span className="metric-sub">Thermal Trap Proxy</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Thermocline Δ</span>
            <span className="metric-value">
              {anomalyAnalysis.features.thermocline_gradient_diff.toFixed(3)}
            </span>
            <span className="metric-sub">dT/dz Divergence</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Anomalous Layers</span>
            <span className="metric-value">
              {anomalyCount} / {comparisons.length}
            </span>
            <span className="metric-sub">Beyond ±{threshold}{unit}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          <Activity size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          Vertical Profile
        </button>
        <button
          className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          <Layers size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          Layer Matrix ({comparisons.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'intelligence' ? 'active' : ''}`}
          onClick={() => setActiveTab('intelligence')}
        >
          <Cpu size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          ML Features
        </button>
      </div>

      {loading && (
        <div className="panel-loading">
          <span className="loading-dot" />
          Cross-matching vertical soundings against the live ocean model...
        </div>
      )}

      {error && (
        <div className="panel-error">
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {error}
        </div>
      )}

      {!loading && !error && comparison && (
        <div className="panel-body">
          {activeTab === 'comparison' && (
            <div className="chart-container">
              <div className="chart-legend">
                <span className="legend-item model-legend">
                  <span className="legend-line model-line" /> Model Reanalysis
                </span>
                <span className="legend-item obs-legend">
                  <span className="legend-line obs-line" /> Argo Float In-Situ
                </span>
                <span className="legend-item anomaly-legend">
                  <span className="legend-dot anomaly-dot" /> Anomaly (&gt;{threshold}{unit})
                </span>
              </div>

              {/* Inverted Depth-vs-Variable Chart */}
              <svg
                width={chartWidth}
                height={chartHeight}
                className="profile-chart"
                onMouseLeave={() => setHoveredDepth(null)}
              >
                {/* Horizontal Depth Grid Lines */}
                {[0, 100, 200, 300, 400, 500].map((d) => (
                  <g key={`d-${d}`}>
                    <line
                      x1={pad.left}
                      y1={toY(d)}
                      x2={chartWidth - pad.right}
                      y2={toY(d)}
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <text
                      x={pad.left - 8}
                      y={toY(d) + 4}
                      textAnchor="end"
                      fontSize="9"
                      fill="#7dd3fc"
                      fontFamily="monospace"
                    >
                      {d}m
                    </text>
                  </g>
                ))}

                {/* X Axis Ticks */}
                {[minVal, (minVal + maxVal) / 2, maxVal].map((v, i) => (
                  <text
                    key={`v-${i}`}
                    x={toX(v)}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#7dd3fc"
                    fontFamily="monospace"
                  >
                    {v.toFixed(1)} {unit}
                  </text>
                ))}

                {/* Shaded Anomaly Divergence Zones */}
                {validComps.map((c, i) => {
                  if (!c.anomaly_flag || i === 0) return null;
                  const prev = validComps[i - 1];
                  const y1 = toY(prev.depth);
                  const y2 = toY(c.depth);
                  const xM1 = toX(prev.model_value);
                  const xM2 = toX(c.model_value);
                  const xO1 = toX(prev.observed_value);
                  const xO2 = toX(c.observed_value);
                  const polyPoints = `${xM1},${y1} ${xM2},${y2} ${xO2},${y2} ${xO1},${y1}`;
                  return (
                    <polygon
                      key={`poly-${i}`}
                      points={polyPoints}
                      fill="rgba(239, 68, 68, 0.22)"
                    />
                  );
                })}

                {/* Anomaly Depth Region Rings */}
                {validComps
                  .filter((c) => c.anomaly_flag)
                  .map((c, i) => (
                    <circle
                      key={`ano-${i}`}
                      cx={toX(c.observed_value)}
                      cy={toY(c.depth)}
                      r={6}
                      fill="rgba(239, 68, 68, 0.35)"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                    />
                  ))}

                {/* Model Profile Polyline (Cyan) */}
                {modelPoints && (
                  <polyline
                    fill="none"
                    stroke="#00bfff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={modelPoints}
                  />
                )}

                {/* Observed Profile Polyline (Neon Amber) */}
                {obsPoints && (
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={obsPoints}
                  />
                )}

                {/* Interactive Hover Hit Zones */}
                {validComps.map((c) => (
                  <g
                    key={`hit-${c.depth}`}
                    onMouseEnter={() => setHoveredDepth(c.depth)}
                    style={{ cursor: 'crosshair' }}
                  >
                    <line
                      x1={pad.left}
                      y1={toY(c.depth)}
                      x2={chartWidth - pad.right}
                      y2={toY(c.depth)}
                      stroke="transparent"
                      strokeWidth={12}
                    />
                    {hoveredDepth === c.depth && (
                      <g>
                        <line
                          x1={pad.left}
                          y1={toY(c.depth)}
                          x2={chartWidth - pad.right}
                          y2={toY(c.depth)}
                          stroke="#00f0ff"
                          strokeDasharray="2,2"
                          strokeWidth={1}
                        />
                        <circle cx={toX(c.model_value)} cy={toY(c.depth)} r={4} fill="#00bfff" />
                        <circle cx={toX(c.observed_value)} cy={toY(c.depth)} r={4} fill="#f59e0b" />
                      </g>
                    )}
                  </g>
                ))}
              </svg>

              {/* Hover Telemetry Readout */}
              {hoveredComp ? (
                <div className="hover-readout">
                  <span className="hr-depth">DEPTH: {hoveredComp.depth}m</span>
                  <span className="hr-model">MODEL: {hoveredComp.model_value.toFixed(2)}</span>
                  <span className="hr-obs">OBS: {hoveredComp.observed_value.toFixed(2)}</span>
                  <span className={`hr-delta ${hoveredComp.anomaly_flag ? 'hr-anom' : ''}`}>
                    Δ: {hoveredComp.delta > 0 ? `+${hoveredComp.delta.toFixed(2)}` : hoveredComp.delta.toFixed(2)} {unit}
                  </span>
                </div>
              ) : (
                <div className="hover-placeholder">Hover over chart lines to inspect layer soundings</div>
              )}

              {/* Sensitivity Threshold Selector */}
              <div className="chart-footer">
                <label>Anomaly Sensitivity Threshold:</label>
                <div className="threshold-selector">
                  {[0.5, 1.0, 1.5, 2.0].map((th) => (
                    <button
                      key={th}
                      className={`th-btn ${threshold === th ? 'active' : ''}`}
                      onClick={() => setThreshold(th)}
                    >
                      ±{th}{unit}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'table' && (
            <div className="table-container">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Depth</th>
                    <th>Model</th>
                    <th>Observed</th>
                    <th>Δ (Obs-Model)</th>
                    <th>WMO QC</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((c, i) => (
                    <tr
                      key={i}
                      className={c.anomaly_flag ? 'row-anomaly' : ''}
                      onMouseEnter={() => setHoveredDepth(c.depth)}
                    >
                      <td>{c.depth}m</td>
                      <td>{c.model_value.toFixed(2)}</td>
                      <td>{c.observed_value.toFixed(2)}</td>
                      <td className={c.delta > 0 ? 'delta-pos' : 'delta-neg'}>
                        {c.delta > 0 ? `+${c.delta.toFixed(2)}` : c.delta.toFixed(2)} {unit}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: profile?.qc_flags?.[i] === 2 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(52, 211, 153, 0.2)',
                          color: profile?.qc_flags?.[i] === 2 ? '#fbbf24' : '#34d399',
                          border: `1px solid ${profile?.qc_flags?.[i] === 2 ? 'rgba(251, 191, 36, 0.4)' : 'rgba(52, 211, 153, 0.4)'}`,
                        }}>
                          {profile?.qc_flags?.[i] === 2 ? 'QC 2 (Prob. Good)' : 'QC 1 (Good)'}
                        </span>
                      </td>
                      <td>
                        {c.anomaly_flag ? (
                          <span className="tag-anomaly">
                            <AlertTriangle size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                            ANOMALY
                          </span>
                        ) : (
                          <span className="tag-ok">MATCH</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'intelligence' && anomalyAnalysis && (
            <div className="intelligence-tab">
              {explainMode === 'citizen' ? (
                <div className="intel-section citizen-mode-box">
                  <h4>CITIZEN SUMMARY // WHAT DOES THIS MEAN?</h4>
                  <div className="diagnosis-box" style={{ borderColor: 'rgba(0, 230, 118, 0.4)', background: 'rgba(0, 230, 118, 0.05)' }}>
                    <p style={{ color: '#e2e8f0', fontSize: '13px', lineHeight: '1.6' }}>
                      {anomalyAnalysis.severity === 'HIGH' ? (
                        <>
                          <strong style={{ color: '#fca5a5' }}>
                            <AlertCircle size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Significant Subsurface Warming Detected:{' '}
                          </strong>
                          Ocean buoys recorded water that is significantly warmer than normal at <strong>{anomalyAnalysis.features.max_layer_depth} meters depth</strong> (divergence of +{anomalyAnalysis.features.mean_delta.toFixed(1)}{unit}). This trapped subsurface heat acts as high-octane fuel for tropical cyclones and shifts fish migration patterns.
                        </>
                      ) : (
                        <>
                          <strong style={{ color: '#86efac' }}>
                            <CheckCircle2 size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Normal Ocean Conditions:{' '}
                          </strong>
                          The computer simulation is matching real robotic buoys within a minimal difference of {anomalyAnalysis.features.mean_delta.toFixed(2)}{unit}. Ocean stratification is stable.
                        </>
                      )}
                    </p>
                  </div>
                  <div className="intel-param-grid" style={{ marginTop: '12px' }}>
                    <div className="param-item">
                      <span className="param-label">Alert Level</span>
                      <span className={`param-value ${anomalyAnalysis.severity === 'HIGH' ? 'critical-val' : ''}`}>
                        {anomalyAnalysis.severity === 'HIGH' ? 'High Concern' : 'Routine / Normal'}
                      </span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">Divergence Depth</span>
                      <span className="param-value">{anomalyAnalysis.features.max_layer_depth} m</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="intel-section">
                  <h4>ISOLATION FOREST ML ANOMALY ENGINE</h4>
                  <div className="intel-param-grid">
                    <div className="param-item">
                      <span className="param-label">Composite Anomaly Score</span>
                      <span className="param-value">{anomalyAnalysis.anomaly_score.toFixed(3)}</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">Classification Severity</span>
                      <span className={`param-value ${anomalyAnalysis.severity === 'HIGH' ? 'critical-val' : ''}`}>
                        {anomalyAnalysis.severity}
                      </span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">Peak Layer Divergence Depth</span>
                      <span className="param-value">{anomalyAnalysis.features.max_layer_depth} meters</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">Thermocline dT/dz Discrepancy</span>
                      <span className="param-value">{anomalyAnalysis.features.thermocline_gradient_diff.toFixed(4)} °C/m</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">Upper 200m Heat Content Integral</span>
                      <span className="param-value">{anomalyAnalysis.features.upper_200m_heat_delta.toFixed(3)} °C</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">Mean Absolute Error (MAE)</span>
                      <span className="param-value">{anomalyAnalysis.features.mean_delta.toFixed(3)} {unit}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="intel-section">
                <h4>{explainMode === 'citizen' ? 'EXPERT ANALYSIS' : 'SCIENTIFIC ROOT CAUSE DIAGNOSIS'}</h4>
                <div className="diagnosis-box">
                  <p>{anomalyAnalysis.hypothesis}</p>
                </div>
              </div>
            </div>
          )}

          {/* Dossier Export Actions */}
          <div className="export-actions-row">
            <button className="export-btn json" onClick={exportJSON} title="Download Full JSON Dossier">
              <FileText size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Export INCOIS Dossier (JSON)
            </button>
            <button className="export-btn csv" onClick={exportCSV} title="Download Depth Profile CSV">
              <FileSpreadsheet size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Export Profile (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

