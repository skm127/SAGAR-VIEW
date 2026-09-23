/**
 * OceanProbeModal — Interactive Point-and-Click Ocean Sounding Inspector.
 * Renders vertical depth profiles and local parameters for any coordinate around India.
 */
import { useState, useEffect } from 'react';
import { getModelProfile } from '../../services/api';
import { VARIABLE_LABELS, VARIABLE_UNITS, type OceanVariable } from '../../types';
import './OceanProbeModal.css';

interface OceanProbeModalProps {
  coordinate: { lat: number; lon: number } | null;
  variable: OceanVariable;
  timeIndex: number;
  date: string;
  onClose: () => void;
}

interface ProfileData {
  variable: string;
  latitude: number;
  longitude: number;
  depths: number[];
  values: number[];
}

export default function OceanProbeModal({
  coordinate,
  variable,
  timeIndex,
  date,
  onClose,
}: OceanProbeModalProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coordinate) return;

    setLoading(true);
    getModelProfile(variable, coordinate.lat, coordinate.lon, timeIndex)
      .then((data) => setProfile(data))
      .catch((err) => {
        console.warn('Probe fetch error:', err);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [coordinate, variable, timeIndex]);

  if (!coordinate) return null;

  const unit = VARIABLE_UNITS[variable] || '';
  const varLabel = VARIABLE_LABELS[variable] || variable;

  // Region label
  const region =
    coordinate.lat < 6.0
      ? 'Equatorial Indian Ocean'
      : coordinate.lon >= 77.0
      ? 'Bay of Bengal'
      : 'Arabian Sea';

  // Stats from profile
  const depths = profile?.depths || [];
  const values = profile?.values || [];
  const surfaceVal = values.length > 0 ? values[0] : null;
  const deepVal = values.length > 0 ? values[values.length - 1] : null;

  // Chart setup
  const chartW = 280;
  const chartH = 140;
  const pad = { top: 10, right: 15, bottom: 20, left: 35 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  const validPairs = depths.map((d, i) => ({ depth: d, val: values[i] })).filter((p) => p.val !== null && !isNaN(p.val));
  const minVal = validPairs.length ? Math.min(...validPairs.map((p) => p.val)) : 0;
  const maxVal = validPairs.length ? Math.max(...validPairs.map((p) => p.val)) : 30;
  const range = maxVal - minVal || 1;

  const toX = (v: number) => pad.left + ((v - minVal) / range) * plotW;
  const toY = (d: number) => pad.top + (d / 500) * plotH;

  const polylinePoints = validPairs
    .map((p) => `${toX(p.val)},${toY(p.depth)}`)
    .join(' ');

  return (
    <div className="ocean-probe-modal">
      <div className="probe-header">
        <div className="probe-header-title">
          <span className="probe-tag">GRID PROBE // RECON</span>
          <h3>{varLabel.toUpperCase()} SOUNDING</h3>
        </div>
        <button className="probe-close-btn" onClick={onClose} title="Close Probe">
          ✕
        </button>
      </div>

      <div className="probe-body">
        <div className="probe-location-badge">
          <span className="probe-region">{region}</span>
          <span className="probe-coords">
            {coordinate.lat.toFixed(2)}°N, {coordinate.lon.toFixed(2)}°E
          </span>
        </div>

        <div className="probe-stats-grid">
          <div className="probe-stat-item">
            <span className="probe-stat-label">Surface Layer (0m)</span>
            <span className="probe-stat-val">
              {surfaceVal !== null ? `${surfaceVal.toFixed(2)} ${unit}` : 'N/A'}
            </span>
          </div>
          <div className="probe-stat-item">
            <span className="probe-stat-label">Deep Basin (500m)</span>
            <span className="probe-stat-val">
              {deepVal !== null ? `${deepVal.toFixed(2)} ${unit}` : 'N/A'}
            </span>
          </div>
        </div>

        {loading && <div style={{ fontSize: '10px', color: '#00f0ff', textAlign: 'center' }}>Sampling ocean column...</div>}

        {!loading && profile && validPairs.length > 0 && (
          <div className="probe-chart-box">
            <div className="probe-chart-title">Vertical Depth Cross-Section (0-500m)</div>
            <svg width={chartW} height={chartH} className="probe-sparkline">
              {/* Depth lines */}
              {[0, 150, 300, 500].map((d) => (
                <g key={d}>
                  <line
                    x1={pad.left}
                    y1={toY(d)}
                    x2={chartW - pad.right}
                    y2={toY(d)}
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <text
                    x={pad.left - 4}
                    y={toY(d) + 3}
                    textAnchor="end"
                    fontSize="8"
                    fill="#64748b"
                    fontFamily="monospace"
                  >
                    {d}m
                  </text>
                </g>
              ))}

              {/* Profile line */}
              {polylinePoints && (
                <polyline
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="2"
                  points={polylinePoints}
                />
              )}

              {/* Surface & Bottom nodes */}
              {validPairs.length > 0 && (
                <>
                  <circle cx={toX(validPairs[0].val)} cy={toY(validPairs[0].depth)} r={3} fill="#00f0ff" />
                  <circle cx={toX(validPairs[validPairs.length - 1].val)} cy={toY(validPairs[validPairs.length - 1].depth)} r={3} fill="#38bdf8" />
                </>
              )}
            </svg>
          </div>
        )}

        <div className="probe-footer-hint">
          {date} // Click anywhere on the ocean surface to probe
        </div>
      </div>
    </div>
  );
}
