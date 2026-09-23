import React, { useState, useEffect, useRef } from 'react';
import { Crosshair, Search, ArrowRight } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { getCoLocationResults, type CoLocationMatch } from '../../services/api';
import './CoLocationModal.css';

type CoLocationResult = CoLocationMatch;

interface CoLocationModalProps {
  isOpen: boolean;
  probedLat: number;
  probedLon: number;
  onClose: () => void;
  onJumpToSensor: (lat: number, lon: number) => void;
}


export const CoLocationModal: React.FC<CoLocationModalProps> = ({
  isOpen,
  probedLat,
  probedLon,
  onClose,
  onJumpToSensor,
}) => {
  const [radius, setRadius] = useState(200);
  const [timeWindow, setTimeWindow] = useState(24);
  const [results, setResults] = useState<CoLocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const data = await getCoLocationResults({
        lat: probedLat,
        lon: probedLon,
        radius_km: radius,
        time_window_hours: timeWindow,
        variable: 'thetao',
        time_index: 0,
      });
      setResults(data.matches || []);
    } catch (e) {
      // Never substitute fabricated matches — show the failure instead.
      setResults([]);
      setError(e instanceof Error ? e.message : 'Co-location service unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearched(false);
      setResults([]);
    }
  }, [isOpen, probedLat, probedLon]);

  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, modalRef);

  if (!isOpen) return null;

  return (
    <div className="coloc-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="coloc-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Spatial-Temporal Co-Location Engine"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="coloc-header">

          <div className="coloc-title-group">
            <span className="coloc-badge"><Crosshair size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />CO-LOCATION ENGINE</span>
            <span className="coloc-sub">Spatial-Temporal Model–Observation Matching</span>
          </div>
          <button className="coloc-close" onClick={onClose}>✕</button>
        </div>

        <div className="coloc-body">
          {/* Probe Coordinate */}
          <div className="coloc-probe">
            <span className="coloc-probe-label">Probed Coordinate</span>
            <span className="coloc-probe-value">
              {probedLat.toFixed(2)}°N, {probedLon.toFixed(2)}°E
            </span>
          </div>

          {/* Sliders */}
          <div className="coloc-controls">
            <div className="coloc-slider-group">
              <label>Search Radius: <strong>{radius} km</strong></label>
              <input
                type="range"
                min={25}
                max={500}
                step={25}
                value={radius}
                onChange={e => setRadius(Number(e.target.value))}
                className="coloc-slider"
              />
              <div className="coloc-slider-marks">
                <span>25km</span><span>250km</span><span>500km</span>
              </div>
            </div>

            <div className="coloc-slider-group">
              <label>Time Window: <strong>±{timeWindow}h</strong></label>
              <input
                type="range"
                min={6}
                max={48}
                step={6}
                value={timeWindow}
                onChange={e => setTimeWindow(Number(e.target.value))}
                className="coloc-slider"
              />
              <div className="coloc-slider-marks">
                <span>±6h</span><span>±24h</span><span>±48h</span>
              </div>
            </div>
          </div>

          <button className="coloc-search-btn" onClick={runSearch} disabled={loading}>
            {loading ? 'Searching...' : (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Search size={14} /> Find Co-Located Observations
              </span>
            )}
          </button>

          {/* Results Table */}
          {searched && (
            <div className="coloc-results">
              <h4 className="coloc-results-title">
                {results.length} Match{results.length !== 1 ? 'es' : ''} Found
              </h4>
              {error ? (
                <div className="coloc-empty">Co-location failed: {error}</div>
              ) : results.length === 0 ? (
                <div className="coloc-empty">No observations within {radius}km and ±{timeWindow}h window.</div>
              ) : (
                <table className="coloc-table">
                  <thead>
                    <tr>
                      <th>Sensor</th>
                      <th>Type</th>
                      <th>Distance</th>
                      <th>Model</th>
                      <th>Observed</th>
                      <th>RMSE</th>
                      <th>Score</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.sensor_id} className={r.match_score >= 70 ? 'high-score' : ''}>
                        <td className="coloc-sensor-id">{r.sensor_id}</td>
                        <td>{r.sensor_type}</td>
                        <td>{r.distance_km.toFixed(1)} km</td>
                        <td>{r.model_value?.toFixed(2) ?? '—'}</td>
                        <td>{r.observed_value?.toFixed(2) ?? '—'}</td>
                        <td>{r.rmse?.toFixed(3) ?? '—'}</td>
                        <td>
                          <span className={`coloc-score ${r.match_score >= 70 ? 'high' : r.match_score >= 40 ? 'med' : 'low'}`}>
                            {r.match_score.toFixed(1)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="coloc-jump-btn"
                            onClick={() => onJumpToSensor(r.latitude, r.longitude)}
                            title="Fly to this sensor"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoLocationModal;
