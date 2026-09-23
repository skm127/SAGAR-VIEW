/**
 * TransectModal.tsx
 * Renders 2D vertical depth-vs-distance contour cross sections across arbitrary oceanic transect lines.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Split, AlertTriangle } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { showToast } from '../../utils/toast';
import { calculateTransect } from '../../services/api';
import type { TransectResponse } from '../../types';
import { getColormapColor } from '../../utils/colormap';
import './TransectModal.css';


interface TransectModalProps {
  initialLine?: { lat1: number; lon1: number; lat2: number; lon2: number };
  timeIndex: number;
  onClose: () => void;
}

const TRANSECT_PRESETS = [
  { name: 'Bay of Bengal Meridional (S→N)', lat1: 10, lon1: 86, lat2: 20, lon2: 88 },
  { name: 'Indian Monsoon Zonal (W→E)', lat1: 14, lon1: 72, lat2: 14, lon2: 90 },
  { name: 'Arabian Sea Upwelling', lat1: 12, lon1: 64, lat2: 19, lon2: 71 },
];

export const TransectModal: React.FC<TransectModalProps> = ({
  initialLine = { lat1: 10, lon1: 85, lat2: 19, lon2: 89 },
  timeIndex,
  onClose,
}) => {
  const [line, setLine] = useState(initialLine);
  const [variable, setVariable] = useState<'thetao' | 'so'>('thetao');
  const [transect, setTransect] = useState<TransectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    distKm: number;
    depthM: number;
    val: number | null;
    xPct: number;
    yPct: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalCardRef = useRef<HTMLDivElement | null>(null);

  useModalA11y(true, onClose, modalCardRef);

  const loadTransect = (l: typeof line, v: typeof variable) => {
    // Validate minimum distance (50km requirement)
    const dLat = (l.lat2 - l.lat1) * 111.0;
    const dLon = (l.lon2 - l.lon1) * 111.0 * Math.cos((((l.lat1 + l.lat2) / 2) * Math.PI) / 180);
    const approxDist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (approxDist < 50.0) {
      showToast('Transect points must be at least 50km apart for meaningful depth sounding', 'warning', 'Invalid Transect Distance');
      setError('Transect points must be at least 50km apart');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    calculateTransect({
      lat1: l.lat1,
      lon1: l.lon1,
      lat2: l.lat2,
      lon2: l.lon2,
      variable: v,
      time_index: timeIndex,
      num_samples: 30,
    })
      .then((data) => {
        setTransect(data);
        setLoading(false);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || err.message || 'Failed to interpolate transect cross-section';
        showToast(msg, 'error', 'Transect Error');
        setError(msg);
        setLoading(false);
      });
  };


  useEffect(() => {
    loadTransect(line, variable);
  }, [line, variable, timeIndex]);

  // Render 2D contour slice onto canvas
  useEffect(() => {
    if (!transect || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const depths = transect.depths;
    const numStations = transect.stations_count;
    const numDepths = depths.length;
    const minVal = transect.min_val;
    const maxVal = transect.max_val;

    // Create offscreen image data
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      const depthRatio = py / (height - 1);
      const exactDepth = depthRatio * depths[numDepths - 1];

      // Find vertical depth indices
      let d0 = 0;
      let d1 = 0;
      for (let k = 0; k < numDepths - 1; k++) {
        if (depths[k] <= exactDepth && depths[k + 1] >= exactDepth) {
          d0 = k;
          d1 = k + 1;
          break;
        }
      }
      const tY = depths[d1] === depths[d0] ? 0 : (exactDepth - depths[d0]) / (depths[d1] - depths[d0]);

      for (let px = 0; px < width; px++) {
        const stationRatio = px / (width - 1);
        const exactStation = stationRatio * (numStations - 1);
        const s0 = Math.floor(exactStation);
        const s1 = Math.min(numStations - 1, s0 + 1);
        const tX = exactStation - s0;

        // Bilinear interpolation
        const v00 = transect.grid_matrix[d0]?.[s0] ?? minVal;
        const v10 = transect.grid_matrix[d0]?.[s1] ?? minVal;
        const v01 = transect.grid_matrix[d1]?.[s0] ?? minVal;
        const v11 = transect.grid_matrix[d1]?.[s1] ?? minVal;

        const valTop = v00 * (1 - tX) + v10 * tX;
        const valBottom = v01 * (1 - tX) + v11 * tX;
        const finalVal = valTop * (1 - tY) + valBottom * tY;

        // Normalize
        const norm = maxVal === minVal ? 0.5 : Math.max(0, Math.min(1, (finalVal - minVal) / (maxVal - minVal)));
        const col = getColormapColor(variable, norm);

        const pIdx = (py * width + px) * 4;
        data[pIdx] = Math.round(col.r * 255);
        data[pIdx + 1] = Math.round(col.g * 255);
        data[pIdx + 2] = Math.round(col.b * 255);
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw Thermocline Contour (26°C Isotherm) if variable is temperature
    if (variable === 'thetao') {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      
      for (let px = 0; px < width; px++) {
        const sIdx = (px / (width - 1)) * (transect.stations_count - 1);
        const s0 = Math.floor(sIdx);
        const s1 = Math.min(s0 + 1, transect.stations_count - 1);
        const sx = sIdx - s0;

        let foundPy = -1;
        for (let d = 0; d < transect.depths.length - 1; d++) {
          const v00 = transect.grid_matrix[d]?.[s0];
          const v01 = transect.grid_matrix[d]?.[s1];
          const v10 = transect.grid_matrix[d + 1]?.[s0];
          const v11 = transect.grid_matrix[d + 1]?.[s1];
          
          if (v00 == null || v01 == null || v10 == null || v11 == null) continue;
          
          const tempAtD = v00 * (1 - sx) + v01 * sx;
          const tempAtDNext = v10 * (1 - sx) + v11 * sx;

          if ((tempAtD >= 26 && tempAtDNext <= 26) || (tempAtD <= 26 && tempAtDNext >= 26)) {
            const fraction = (26 - tempAtD) / ((tempAtDNext - tempAtD) || 1);
            const exactDIdx = d + fraction;
            foundPy = (exactDIdx / (transect.depths.length - 1)) * (height - 1);
            break;
          }
        }
        
        if (foundPy !== -1) {
          if (px === 0) ctx.moveTo(px, foundPy);
          else ctx.lineTo(px, foundPy);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label the thermocline
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '10px "Geist Mono", monospace';
      ctx.fillText('26°C ISOTHERM (THERMOCLINE)', 10, height - 15);
    }

  }, [transect, variable]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!transect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yPct = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const maxD = transect.depths[transect.depths.length - 1] || 500;
    const curD = Math.round(yPct * maxD);
    const curDist = Math.round(xPct * transect.total_distance_km);

    // Approximate value
    const sIdx = Math.round(xPct * (transect.stations_count - 1));
    const dIdx = Math.round(yPct * (transect.depths.length - 1));
    const val = transect.grid_matrix[dIdx]?.[sIdx] ?? null;

    setHoveredPoint({
      distKm: curDist,
      depthM: curD,
      val: val !== null ? Number(val.toFixed(2)) : null,
      xPct: xPct * 100,
      yPct: yPct * 100,
    });
  };

  const handleCanvasMouseLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div className="transect-modal-overlay" onClick={onClose}>
      <div
        ref={modalCardRef}
        className="transect-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Ocean Transect Vertical Sounding"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}

        <div className="transect-header">
          <div className="transect-badge-row">
            <span className="transect-tag">
              <Split size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              2D VERTICAL SOUNDING TRANSECT
            </span>
            <span className="transect-var-pills">
              <button
                className={`var-pill ${variable === 'thetao' ? 'active' : ''}`}
                onClick={() => setVariable('thetao')}
              >
                Temperature (°C)
              </button>
              <button
                className={`var-pill ${variable === 'so' ? 'active' : ''}`}
                onClick={() => setVariable('so')}
              >
                Salinity (PSU)
              </button>
            </span>
          </div>
          <div className="transect-title-row">
            <div>
              <h2 className="transect-title">OCEAN TRANSECT CROSS-SECTION</h2>
              <span className="transect-coords">
                A ({Number(line.lat1).toFixed(2)}°N, {Number(line.lon1).toFixed(2)}°E) → B ({Number(line.lat2).toFixed(2)}°N, {Number(line.lon2).toFixed(2)}°E)
              </span>
            </div>
            <button className="transect-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Presets Bar */}
        <div className="transect-presets-bar">
          <span className="presets-label">Transect Routes:</span>
          {TRANSECT_PRESETS.map((p) => (
            <button
              key={p.name}
              className={`preset-btn ${line.lat1 === p.lat1 && line.lon1 === p.lon1 ? 'active' : ''}`}
              onClick={() => setLine({ lat1: p.lat1, lon1: p.lon1, lat2: p.lat2, lon2: p.lon2 })}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="transect-body" style={{ minHeight: '320px' }}>
          {loading && (
            <div className="transect-loading" style={{ height: '320px' }}>
              <div className="transect-spinner" />
              <span>Generating High-Resolution Subsurface Cross-Section...</span>
            </div>
          )}

          {error && (
            <div className="transect-error">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
            </div>
          )}

          {!loading && transect && (
            <div className="transect-plot-container">
              {/* Top Distance Axis */}
              <div className="axis-dist-label">
                <span>Point A (0 km)</span>
                <span>Subsurface Thermocline Boundary</span>
                <span>Point B ({transect.total_distance_km} km)</span>
              </div>

              {/* Vertical Plot Wrap */}
              <div className="transect-plot-stage">
                {/* Depth Axis Left */}
                <div className="axis-depth">
                  <span>0m</span>
                  <span>100m</span>
                  <span>200m</span>
                  <span>300m</span>
                  <span>400m</span>
                  <span>500m</span>
                </div>

                {/* Canvas Canvas Area */}
                <div
                  className="transect-canvas-wrap"
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                >
                  <canvas ref={canvasRef} width={480} height={200} className="transect-canvas" />

                  {/* Interactive Cursor Reticle */}
                  {hoveredPoint && (
                    <>
                      <div
                        className="cursor-vline"
                        style={{ left: `${hoveredPoint.xPct}%` }}
                      />
                      <div
                        className="cursor-hline"
                        style={{ top: `${hoveredPoint.yPct}%` }}
                      />
                      <div
                        className="cursor-readout"
                        style={{
                          left: `${Math.min(78, Math.max(10, hoveredPoint.xPct))}%`,
                          top: `${Math.min(78, hoveredPoint.yPct + 4)}%`,
                        }}
                      >
                        <span className="readout-dist">{hoveredPoint.distKm} km from A</span>
                        <span className="readout-depth">{hoveredPoint.depthM} m depth</span>
                        <span className="readout-val">
                          {hoveredPoint.val} {transect.unit}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Colormap Legend & Range */}
              <div className="transect-legend-bar">
                <span className="legend-label">
                  MIN: {transect.min_val}
                  {transect.unit}
                </span>
                <div
                  className="legend-gradient"
                  style={{
                    background:
                      variable === 'thetao'
                        ? 'linear-gradient(90deg, #001040, #0044BB, #00CCEE, #00FF66, #FFEE00, #FF3300)'
                        : 'linear-gradient(90deg, #102040, #1A4B8C, #1E824C, #F4D03F, #D35400)',
                  }}
                />
                <span className="legend-label">
                  MAX: {transect.max_val}
                  {transect.unit}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransectModal;
