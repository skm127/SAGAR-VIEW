/**
 * RegionAnalysisModal.tsx
 * Computes surface area, statistical distributions, observations count, and model errors for any bounding box.
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Maximize2, AlertTriangle } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { calculateRegionStats } from '../../services/api';
import { interpolateColor, getColormap } from '../../utils/colormap';
import type { OceanSliceData } from '../../hooks/useOceanData';
import { VARIABLE_LABELS, VARIABLE_UNITS, type OceanVariable, type RegionStatsResponse } from '../../types';
import './RegionAnalysisModal.css';


interface RegionAnalysisModalProps {
  initialBounds?: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  depth: number;
  timeIndex: number;
  variable: OceanVariable;
  sliceData: OceanSliceData | null;
  date: string;
  onClose: () => void;
  onFocusRegion?: (latMin: number, latMax: number, lonMin: number, lonMax: number) => void;
  onInspectCoordinate?: (lat: number, lon: number) => void;
}

const REGION_PRESETS = [
  { name: 'Bay of Bengal Basin', latMin: 10, latMax: 22, lonMin: 80, lonMax: 94 },
  { name: 'Arabian Sea Basin', latMin: 10, latMax: 24, lonMin: 62, lonMax: 76 },
  { name: 'Andaman & Nicobar', latMin: 6, latMax: 14, lonMin: 90, lonMax: 96 },
  { name: 'Equatorial Indian Ocean', latMin: 0, latMax: 8, lonMin: 70, lonMax: 90 },
];

export const RegionAnalysisModal: React.FC<RegionAnalysisModalProps> = ({
  initialBounds = { latMin: 10, latMax: 22, lonMin: 80, lonMax: 92 },
  depth,
  timeIndex,
  variable,
  sliceData,
  date,
  onClose,
  onFocusRegion,
  onInspectCoordinate,
}) => {
  const [bounds, setBounds] = useState(initialBounds);
  const [stats, setStats] = useState<RegionStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'overview' | 'heatmap' | 'anomalies'>('heatmap');
  const [selectedCell, setSelectedCell] = useState<{ lat: number; lon: number; value: number; anomalyScore: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useModalA11y(true, onClose, cardRef);

  const fetchStats = (b: typeof bounds) => {

    setLoading(true);
    setError(null);
    calculateRegionStats({
      lat_min: b.latMin,
      lat_max: b.latMax,
      lon_min: b.lonMin,
      lon_max: b.lonMax,
      depth,
      time_index: timeIndex,
      variable,
    })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to compute region statistics');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats(bounds);
  }, [depth, timeIndex, variable]);

  const heatmapCells = useMemo(() => {
    if (!sliceData) return [];

    const rows = 12;
    const columns = 18;
    const values: Array<{ lat: number; lon: number; value: number; row: number; column: number }> = [];

    for (let row = 0; row < rows; row += 1) {
      const lat = bounds.latMax - ((bounds.latMax - bounds.latMin) * row) / (rows - 1);
      const dataRow = Math.round(((lat - sliceData.latMin) / (sliceData.latMax - sliceData.latMin)) * (sliceData.height - 1));

      for (let column = 0; column < columns; column += 1) {
        const lon = bounds.lonMin + ((bounds.lonMax - bounds.lonMin) * column) / (columns - 1);
        const dataColumn = Math.round(((lon - sliceData.lonMin) / (sliceData.lonMax - sliceData.lonMin)) * (sliceData.width - 1));
        const value = sliceData.values[dataRow * sliceData.width + dataColumn];

        if (Number.isFinite(value) && value > -9998) {
          values.push({ lat, lon, value, row, column });
        }
      }
    }

    const mean = values.reduce((sum, cell) => sum + cell.value, 0) / (values.length || 1);
    const variance = values.reduce((sum, cell) => sum + (cell.value - mean) ** 2, 0) / (values.length || 1);
    const standardDeviation = Math.sqrt(variance) || 1;
    const colormap = getColormap(sliceData.variable);
    const range = sliceData.vMax - sliceData.vMin || 1;

    return values.map((cell) => {
      const normalizedValue = Math.max(0, Math.min(1, (cell.value - sliceData.vMin) / range));
      const [red, green, blue] = interpolateColor(colormap, normalizedValue);
      const anomalyScore = (cell.value - mean) / standardDeviation;
      const anomalyColor = anomalyScore >= 0
        ? `rgba(248, 113, 113, ${Math.min(0.95, 0.2 + Math.abs(anomalyScore) * 0.32)})`
        : `rgba(96, 165, 250, ${Math.min(0.95, 0.2 + Math.abs(anomalyScore) * 0.32)})`;

      return {
        ...cell,
        color: `rgb(${red}, ${green}, ${blue})`,
        anomalyColor,
        anomalyScore,
      };
    });
  }, [bounds, sliceData]);

  useEffect(() => {
    setSelectedCell(null);
  }, [bounds, sliceData]);

  const handleApplyPreset = (preset: (typeof REGION_PRESETS)[0]) => {
    const newB = {
      latMin: preset.latMin,
      latMax: preset.latMax,
      lonMin: preset.lonMin,
      lonMax: preset.lonMax,
    };
    setBounds(newB);
    fetchStats(newB);
    if (onFocusRegion) {
      onFocusRegion(newB.latMin, newB.latMax, newB.lonMin, newB.lonMax);
    }
  };

  return (
    <div className="region-modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="region-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Regional Scientific Analysis"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}

        <div className="region-header">
          <div className="region-badge-row">
            <span className="region-tag">
              <Maximize2 size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              SPATIAL COMPUTING & INTEGRATION
            </span>
            <span className="region-depth-tag">DEPTH: {depth}M</span>
          </div>
          <div className="region-title-row">
            <h2 className="region-title">REGION ANALYSIS</h2>
            <button className="region-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Region Presets Bar */}
        <div className="region-presets-bar">
          <span className="presets-label">Domain Presets:</span>
          {REGION_PRESETS.map((p) => (
            <button
              key={p.name}
              className={`region-preset-btn ${bounds.latMin === p.latMin && bounds.lonMin === p.lonMin ? 'active' : ''}`}
              onClick={() => handleApplyPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="region-view-tabs" role="tablist" aria-label="Region visualization">
          <button
            type="button"
            className={`region-view-tab ${activeView === 'heatmap' ? 'active' : ''}`}
            onClick={() => setActiveView('heatmap')}
            role="tab"
            aria-selected={activeView === 'heatmap'}
          >
            Heat map
          </button>
          <button
            type="button"
            className={`region-view-tab ${activeView === 'anomalies' ? 'active' : ''}`}
            onClick={() => setActiveView('anomalies')}
            role="tab"
            aria-selected={activeView === 'anomalies'}
          >
            Anomaly screen
          </button>
          <button
            type="button"
            className={`region-view-tab ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveView('overview')}
            role="tab"
            aria-selected={activeView === 'overview'}
          >
            Statistics
          </button>
        </div>

        {/* Content */}
        <div className="region-content">
          {activeView !== 'overview' && (
            <section className="region-heatmap-section">
              <div className="region-heatmap-heading">
                <div>
                  <span className="region-heatmap-eyebrow">SELECTED MODEL SLICE</span>
                  <h3>{activeView === 'heatmap' ? `${VARIABLE_LABELS[variable]} heat map` : 'Spatial anomaly screening'}</h3>
                </div>
                <span className="region-slice-meta">{date} · {depth} m</span>
              </div>

              <p className="region-heatmap-description">
                {activeView === 'heatmap'
                  ? `Each cell shows ${VARIABLE_LABELS[variable].toLowerCase()} from the active ${VARIABLE_UNITS[variable]} slice. Select a cell to inspect that place on the globe.`
                  : 'Warm/red and cool/blue cells are departures from this region’s selected-slice average. This is a screening view, not an observation-validated alert.'}
              </p>

              {heatmapCells.length > 0 ? (
                <>
                  <div className="region-heatmap-frame">
                    <span className="region-map-axis north">N</span>
                    <span className="region-map-axis west">W</span>
                    <div className="region-heatmap-grid" role="grid" aria-label="Regional ocean data grid">
                      {heatmapCells.map((cell) => (
                        <button
                          type="button"
                          key={`${cell.row}-${cell.column}`}
                          className={`region-heat-cell ${selectedCell?.lat === cell.lat && selectedCell?.lon === cell.lon ? 'selected' : ''}`}
                          style={{ background: activeView === 'heatmap' ? cell.color : cell.anomalyColor }}
                          onClick={() => {
                            setSelectedCell(cell);
                            onInspectCoordinate?.(cell.lat, cell.lon);
                          }}
                          title={`${cell.lat.toFixed(2)}°N, ${cell.lon.toFixed(2)}°E · ${cell.value.toFixed(2)} ${VARIABLE_UNITS[variable]}`}
                          aria-label={`Inspect ${cell.lat.toFixed(2)} degrees north, ${cell.lon.toFixed(2)} degrees east`}
                        />
                      ))}
                    </div>
                    <span className="region-map-axis east">E</span>
                    <span className="region-map-axis south">S</span>
                  </div>
                  <div className="region-heatmap-legend">
                    <span>{activeView === 'heatmap' ? `${sliceData?.vMin.toFixed(1)} ${VARIABLE_UNITS[variable]}` : 'Cooler than regional mean'}</span>
                    <span className={`region-legend-ramp ${activeView}`} />
                    <span>{activeView === 'heatmap' ? `${sliceData?.vMax.toFixed(1)} ${VARIABLE_UNITS[variable]}` : 'Warmer than regional mean'}</span>
                  </div>
                  {selectedCell && (
                    <div className="region-cell-inspector">
                      <span><strong>{selectedCell.lat.toFixed(2)}°N, {selectedCell.lon.toFixed(2)}°E</strong> · {selectedCell.value.toFixed(2)} {VARIABLE_UNITS[variable]}</span>
                      <span>{selectedCell.anomalyScore >= 0 ? '+' : ''}{selectedCell.anomalyScore.toFixed(1)}σ from regional mean</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="region-empty-state">No valid values are available for this region and time slice.</div>
              )}
            </section>
          )}

          {loading && (
            <div className="region-loading">
              <div className="region-spinner" />
              <span>Integrating xarray NetCDF Grid Cells...</span>
            </div>
          )}

          {error && (
            <div className="region-error">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
            </div>
          )}

          {activeView === 'overview' && !loading && stats && (
            <>
              {/* Primary KPI Row */}
              <div className="region-kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">SURFACE AREA</span>
                  <span className="kpi-val">
                    {(stats.area_km2 / 1000000).toFixed(2)}M km²
                  </span>
                  <span className="kpi-sub">{stats.area_km2.toLocaleString()} km²</span>
                </div>

                <div className="kpi-card">
                  <span className="kpi-label">IN-SITU OBSERVATIONS</span>
                  <span className="kpi-val highlight">{stats.observations_count}</span>
                  <span className="kpi-sub">Active Platforms</span>
                </div>

                <div className="kpi-card">
                  <span className="kpi-label">MEAN MODEL ERROR</span>
                  <span className={`kpi-val ${stats.model_mean_residual > 1.0 ? 'amber' : 'green'}`}>
                    ±{stats.model_mean_residual}°C
                  </span>
                  <span className="kpi-sub">Residual vs Ground Truth</span>
                </div>

                <div className="kpi-card">
                  <span className="kpi-label">ANOMALIES DETECTED</span>
                  <span className={`kpi-val ${stats.anomalies_detected > 0 ? 'red' : 'green'}`}>
                    {stats.anomalies_detected}
                  </span>
                  <span className="kpi-sub">Critical Divergences</span>
                </div>
              </div>

              {/* Physical Parameters Breakdown */}
              <div className="region-params-grid">
                {/* Temperature */}
                <div className="param-box">
                  <div className="param-header">
                    <span className="param-icon temp">●</span>
                    <span className="param-title">TEMPERATURE DYNAMICS</span>
                  </div>
                  <div className="param-stats-row">
                    <div className="param-stat">
                      <span className="stat-name">MEAN</span>
                      <span className="stat-val">{stats.temperature.mean}°C</span>
                    </div>
                    <div className="param-stat">
                      <span className="stat-name">MIN</span>
                      <span className="stat-val">{stats.temperature.min}°C</span>
                    </div>
                    <div className="param-stat">
                      <span className="stat-name">MAX</span>
                      <span className="stat-val">{stats.temperature.max}°C</span>
                    </div>
                    <div className="param-stat">
                      <span className="stat-name">STD DEV</span>
                      <span className="stat-val">±{stats.temperature.std}°C</span>
                    </div>
                  </div>
                </div>

                {/* Salinity & Currents */}
                <div className="param-box">
                  <div className="param-header">
                    <span className="param-icon sal">●</span>
                    <span className="param-title">SALINITY & KINETICS</span>
                  </div>
                  <div className="param-stats-row">
                    <div className="param-stat">
                      <span className="stat-name">MEAN SAL</span>
                      <span className="stat-val">{stats.salinity.mean} PSU</span>
                    </div>
                    <div className="param-stat">
                      <span className="stat-name">RANGE</span>
                      <span className="stat-val">
                        {stats.salinity.min}–{stats.salinity.max}
                      </span>
                    </div>
                    <div className="param-stat">
                      <span className="stat-name">MEAN CURRENT</span>
                      <span className="stat-val">{stats.currents.mean_speed_ms} m/s</span>
                    </div>
                    <div className="param-stat">
                      <span className="stat-name">MAX GUST</span>
                      <span className="stat-val">{stats.currents.max_speed_ms} m/s</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Histogram Distribution */}
              {stats.temperature.histogram.length > 0 && (
                <div className="region-histogram-wrap">
                  <span className="histogram-title">TEMPERATURE DISTRIBUTION HISTOGRAM</span>
                  <div className="histogram-bars">
                    {stats.temperature.histogram.map((bin) => (
                      <div key={bin.range} className="hist-col">
                        <div className="hist-bar-track">
                          <div
                            className="hist-bar-fill"
                            style={{ height: `${Math.max(4, bin.percentage * 2.2)}px` }}
                          />
                        </div>
                        <span className="hist-pct">{bin.percentage}%</span>
                        <span className="hist-range">{bin.range}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegionAnalysisModal;
