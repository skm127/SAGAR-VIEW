/**
 * VerticalProfileHUD.tsx
 * Floating vertical profile sounding HUD:
 * - Color gradient bar on top
 * - Inverted depth-vs-value profile curve (Surface at top, Deep ocean at bottom)
 * - Interactive depth cursor scrubber with live exact telemetry readings
 * - Multi-source comparison toggle (Observed, Model, Residual Delta)
 */
import React, { useState, useMemo } from 'react';
import './VerticalProfileHUD.css';

interface VerticalProfileHUDProps {
  title?: string;
  latitude: number;
  longitude: number;
  depths: number[];
  modelValues: (number | null)[];
  observedValues?: (number | null)[] | null;
  variable: string;
  unit: string;
  currentDepth: number;
  onDepthSelect: (depth: number) => void;
  onClose?: () => void;
}

export const VerticalProfileHUD: React.FC<VerticalProfileHUDProps> = ({
  title = 'Vertical profile',
  latitude,
  longitude,
  depths,
  modelValues,
  observedValues,
  variable,
  unit,
  currentDepth,
  onDepthSelect,
  onClose,
}) => {
  const [hoveredDepth, setHoveredDepth] = useState<number | null>(null);
  const [activeCurve, setActiveCurve] = useState<'both' | 'observed' | 'model'>('both');

  // Compute min and max values for the horizontal axis
  const { minVal, maxVal, validPairs } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    const pairs: Array<{ depth: number; model: number; obs: number | null }> = [];

    for (let i = 0; i < depths.length; i++) {
      const d = depths[i];
      const m = modelValues[i];
      const o = observedValues && observedValues[i] !== undefined ? observedValues[i] : null;

      if (m !== null && !isNaN(m)) {
        min = Math.min(min, m);
        max = Math.max(max, m);
      }
      if (o !== null && !isNaN(o)) {
        min = Math.min(min, o);
        max = Math.max(max, o);
      }
      if (m !== null) {
        pairs.push({ depth: d, model: m, obs: o });
      }
    }

    if (min === Infinity) min = 20;
    if (max === -Infinity) max = 32;
    // Add small margin
    const margin = (max - min) * 0.08 || 1;
    return {
      minVal: min - margin,
      maxVal: max + margin,
      validPairs: pairs.sort((a, b) => a.depth - b.depth),
    };
  }, [depths, modelValues, observedValues]);

  const maxDepth = depths[depths.length - 1] || 500;
  const activeDepth = hoveredDepth !== null ? hoveredDepth : currentDepth;

  // Linear interpolation for value at active depth
  const { interpolatedModel, interpolatedObs, delta } = useMemo(() => {
    if (validPairs.length === 0) return { interpolatedModel: 0, interpolatedObs: null, delta: null };

    // Find bounding depths
    let prev = validPairs[0];
    let next = validPairs[validPairs.length - 1];

    for (let i = 0; i < validPairs.length; i++) {
      if (validPairs[i].depth <= activeDepth) prev = validPairs[i];
      if (validPairs[i].depth >= activeDepth) {
        next = validPairs[i];
        break;
      }
    }

    const t = prev.depth === next.depth ? 0 : (activeDepth - prev.depth) / (next.depth - prev.depth);
    const m = prev.model + (next.model - prev.model) * t;
    const o = prev.obs !== null && next.obs !== null ? prev.obs + (next.obs - prev.obs) * t : null;
    const d = o !== null ? o - m : null;

    return {
      interpolatedModel: Number(m.toFixed(2)),
      interpolatedObs: o !== null ? Number(o.toFixed(2)) : null,
      delta: d !== null ? Number(d.toFixed(2)) : null,
    };
  }, [validPairs, activeDepth]);

  // Chart dimensions
  const svgWidth = 260;
  const svgHeight = 240;
  const padTop = 14;
  const padBottom = 22;
  const padLeft = 46;
  const padRight = 16;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const getX = (val: number) => padLeft + ((val - minVal) / (maxVal - minVal)) * chartW;
  const getY = (d: number) => padTop + (d / maxDepth) * chartH;

  // SVG Paths
  const modelPath = useMemo(() => {
    if (validPairs.length === 0) return '';
    return validPairs
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.model).toFixed(1)} ${getY(p.depth).toFixed(1)}`)
      .join(' ');
  }, [validPairs, minVal, maxVal, maxDepth]);

  const obsPath = useMemo(() => {
    const obsPairs = validPairs.filter((p) => p.obs !== null);
    if (obsPairs.length === 0) return '';
    return obsPairs
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.obs!).toFixed(1)} ${getY(p.depth).toFixed(1)}`)
      .join(' ');
  }, [validPairs, minVal, maxVal, maxDepth]);

  // Current depth Y position
  const cursorY = getY(activeDepth);
  const cursorModelX = getX(interpolatedModel);
  const cursorObsX = interpolatedObs !== null ? getX(interpolatedObs) : null;

  // Handle clicking or dragging on chart
  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const relativeY = Math.max(0, Math.min(chartH, offsetY - padTop));
    const targetD = Math.round((relativeY / chartH) * maxDepth);
    onDepthSelect(targetD);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const relativeY = Math.max(0, Math.min(chartH, offsetY - padTop));
    const targetD = Math.round((relativeY / chartH) * maxDepth);
    setHoveredDepth(targetD);
  };

  const handleMouseLeave = () => {
    setHoveredDepth(null);
  };

  // Determine ocean layer name
  const layerName =
    activeDepth <= 50
      ? 'Mixed Layer (Epipelagic)'
      : activeDepth <= 200
      ? 'Thermocline Gradient'
      : activeDepth <= 500
      ? 'Mesopelagic Twilight'
      : 'Bathypelagic Deep';

  return (
    <div className="vertical-profile-hud">
      {/* Header */}
      <div className="vphud-header">
        <div className="vphud-title-group">
          <span className="vphud-icon">✦</span>
          <span className="vphud-title">{title}</span>
        </div>
        {onClose && (
          <button className="vphud-close-btn" onClick={onClose} title="Dismiss Profile HUD">
            ✕
          </button>
        )}
      </div>

      {/* Top Scientific Colormap Gradient Bar */}
      <div className="vphud-colorbar-strip">
        <div className="vphud-colorbar-scale" />
        <div className="vphud-colorbar-labels">
          <span>{minVal.toFixed(1)}{unit}</span>
          <span className="vphud-var-tag">{variable.toUpperCase()}</span>
          <span>{maxVal.toFixed(1)}{unit}</span>
        </div>
      </div>

      {/* Curve Selector Tabs */}
      <div className="vphud-curve-toggle">
        <button
          className={`curve-pill ${activeCurve === 'both' ? 'active' : ''}`}
          onClick={() => setActiveCurve('both')}
        >
          Both
        </button>
        <button
          className={`curve-pill model ${activeCurve === 'model' ? 'active' : ''}`}
          onClick={() => setActiveCurve('model')}
        >
          Model (Cyan)
        </button>
        {observedValues && (
          <button
            className={`curve-pill obs ${activeCurve === 'observed' ? 'active' : ''}`}
            onClick={() => setActiveCurve('observed')}
          >
            Observed (Pink)
          </button>
        )}
      </div>

      {/* SVG Sounding Chart */}
      <div className="vphud-chart-wrap">
        <svg
          className="vphud-svg"
          width={svgWidth}
          height={svgHeight}
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Depth Grid Lines */}
          {[0, 50, 100, 200, 300, 400, 500].map((d) => {
            if (d > maxDepth) return null;
            const y = getY(d);
            return (
              <g key={`grid-${d}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + chartW}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray="2 2"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  fill="#8DA5B2"
                  fontSize="9"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {d}m
                </text>
              </g>
            );
          })}

          {/* Model Curve */}
          {(activeCurve === 'both' || activeCurve === 'model') && (
            <path
              d={modelPath}
              fill="none"
              stroke="#00E5FF"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="vphud-model-curve"
            />
          )}

          {/* Observed Curve (Pink / Magenta) */}
          {(activeCurve === 'both' || activeCurve === 'observed') && obsPath && (
            <path
              d={obsPath}
              fill="none"
              stroke="#FF44CC"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="vphud-obs-curve"
            />
          )}

          {/* Interactive Depth Cursor Line */}
          <line
            x1={padLeft}
            y1={cursorY}
            x2={padLeft + chartW}
            y2={cursorY}
            stroke="rgba(255, 255, 255, 0.7)"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />

          {/* Cursor Intersection Nodes */}
          {(activeCurve === 'both' || activeCurve === 'model') && (
            <circle
              cx={cursorModelX}
              cy={cursorY}
              r="4.5"
              fill="#00E5FF"
              stroke="#0B1822"
              strokeWidth="2"
            />
          )}
          {(activeCurve === 'both' || activeCurve === 'observed') && cursorObsX !== null && (
            <circle
              cx={cursorObsX}
              cy={cursorY}
              r="4.5"
              fill="#FF44CC"
              stroke="#0B1822"
              strokeWidth="2"
            />
          )}
        </svg>

        {/* Depth Scrubber Tag */}
        <div
          className="vphud-depth-tag"
          style={{ top: `${cursorY - 9}px`, left: `${padLeft + chartW + 2}px` }}
        >
          {activeDepth}m
        </div>
      </div>

      {/* Detailed Live Readings Box */}
      <div className="vphud-telemetry-box">
        <div className="vphud-coord-row">
          <span className="vphud-coord-badge">
            {Math.abs(latitude).toFixed(2)}°{latitude >= 0 ? 'N' : 'S'}, {Math.abs(longitude).toFixed(2)}°{longitude >= 0 ? 'E' : 'W'}
          </span>
          <span className="vphud-layer-badge">{layerName}</span>
        </div>

        <div className="vphud-readings-grid">
          <div className="vphud-metric-cell">
            <span className="metric-label">SOUNDING DEPTH</span>
            <span className="metric-value highlight">{activeDepth} m</span>
          </div>

          <div className="vphud-metric-cell">
            <span className="metric-label">MODEL VALUE</span>
            <span className="metric-value cyan">
              {interpolatedModel} {unit}
            </span>
          </div>

          {interpolatedObs !== null && (
            <div className="vphud-metric-cell">
              <span className="metric-label">OBSERVED VALUE</span>
              <span className="metric-value pink">
                {interpolatedObs} {unit}
              </span>
            </div>
          )}

          {delta !== null && (
            <div className="vphud-metric-cell">
              <span className="metric-label">RESIDUAL DELTA</span>
              <span className={`metric-value ${Math.abs(delta) > 1.0 ? 'amber' : 'green'}`}>
                {delta > 0 ? `+${delta}` : delta} {unit}
              </span>
            </div>
          )}
        </div>

        {/* Depth Quick Presets */}
        <div className="vphud-presets">
          <span className="presets-label">Quick Slices:</span>
          {[0, 50, 100, 200, 500].map((d) => (
            <button
              key={`preset-${d}`}
              className={`preset-chip ${activeDepth === d ? 'active' : ''}`}
              onClick={() => onDepthSelect(d)}
            >
              {d === 0 ? 'Surface' : `${d}m`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VerticalProfileHUD;
