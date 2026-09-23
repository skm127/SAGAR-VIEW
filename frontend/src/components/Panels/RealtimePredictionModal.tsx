/**
 * RealtimePredictionModal.tsx
 * Live Real-Time Ocean Observation & 72-Hour Actual Forward Predictions Workstation.
 *
 * Connects directly to Open-Meteo Marine Global Real-Time API and Ifremer Argo GDAC
 * to provide live wave heights, current velocity vectors, swell, and 72-hour forward predictions.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Navigation, Waves, Radio, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { getRealtimeOcean, getRealtimeFleet } from '../../services/api';
import type { LiveOceanResponse, LiveFleetResponse } from '../../types';
import './RealtimePredictionModal.css';

interface RealtimePredictionModalProps {
  isOpen: boolean;
  latitude?: number;
  longitude?: number;
  onClose: () => void;
  onFlyToLocation?: (lat: number, lon: number) => void;
}

const PRESET_LOCATIONS = [
  { label: 'Bay of Bengal Anomaly', lat: 14.5, lon: 84.8, desc: 'Cyclonic intensification & subsurface thermal pool' },
  { label: 'Arabian Sea Upwelling', lat: 15.0, lon: 69.0, desc: 'Deep-water upwelling & high current zone' },
  { label: 'Chennai Coast (Offshore)', lat: 13.1, lon: 80.6, desc: 'Tamil Nadu coastal shipping & artisanal fishing' },
  { label: 'Mumbai High (Arabian Sea)', lat: 19.4, lon: 71.3, desc: 'Offshore oil platforms & commercial fairway' },
  { label: 'Port Blair (Andaman Sea)', lat: 11.6, lon: 92.7, desc: 'Island maritime corridor & equatorial swell' },
];

export const RealtimePredictionModal: React.FC<RealtimePredictionModalProps> = ({
  isOpen,
  latitude = 14.5,
  longitude = 84.8,
  onClose,
  onFlyToLocation,
}) => {
  const [selectedLat, setSelectedLat] = useState(latitude);
  const [selectedLon, setSelectedLon] = useState(longitude);
  const [activeTab, setActiveTab] = useState<'forecast' | 'fleet'>('forecast');
  const [loading, setLoading] = useState(false);
  const [oceanData, setOceanData] = useState<LiveOceanResponse | null>(null);
  const [fleetData, setFleetData] = useState<LiveFleetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedHourOffset, setSelectedHourOffset] = useState<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useModalA11y(isOpen, onClose, cardRef);

  useEffect(() => {
    if (isOpen) {
      setSelectedLat(latitude);
      setSelectedLon(longitude);
      fetchLiveTelemetry(latitude, longitude);
    }
  }, [isOpen, latitude, longitude]);

  const fetchLiveTelemetry = (lat: number, lon: number) => {
    setLoading(true);
    setError(null);

    Promise.all([
      getRealtimeOcean(lat, lon),
      getRealtimeFleet(),
    ])
      .then(([oceanRes, fleetRes]) => {
        setOceanData(oceanRes);
        setFleetData(fleetRes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to retrieve real-time ocean stream');
        setLoading(false);
      });
  };

  const handleSelectPreset = (pLat: number, pLon: number) => {
    setSelectedLat(pLat);
    setSelectedLon(pLon);
    fetchLiveTelemetry(pLat, pLon);
  };

  // Compute SVG chart path for 72-hour forecast
  const chartPaths = useMemo(() => {
    if (!oceanData || !oceanData.hourly_forecast || oceanData.hourly_forecast.length === 0) {
      return { wavePath: '', currentPath: '', maxWave: 3, maxCurr: 1.5 };
    }

    const series = oceanData.hourly_forecast.slice(0, 72);
    const maxWave = Math.max(...series.map((s) => s.wave_height_m), 2.5);
    const maxCurr = Math.max(...series.map((s) => s.current_velocity_ms), 1.2);

    const width = 640;
    const height = 140;
    const padding = 20;
    const plotW = width - padding * 2;
    const plotH = height - padding * 2;

    const wavePoints: string[] = [];
    const currentPoints: string[] = [];

    series.forEach((s, i) => {
      const x = padding + (i / (series.length - 1)) * plotW;
      const yWave = height - padding - (s.wave_height_m / maxWave) * plotH;
      const yCurr = height - padding - (s.current_velocity_ms / maxCurr) * plotH;

      wavePoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yWave.toFixed(1)}`);
      currentPoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yCurr.toFixed(1)}`);
    });

    return {
      wavePath: wavePoints.join(' '),
      currentPath: currentPoints.join(' '),
      maxWave,
      maxCurr,
    };
  }, [oceanData]);

  if (!isOpen) return null;

  const currentObs = oceanData?.current_observations;
  const currentPred = oceanData?.prediction_summary;
  const selectedHourData = oceanData?.hourly_forecast?.[selectedHourOffset];

  return (
    <div className="rt-modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="rt-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Real-Time Ocean Telemetry & 72-Hour Predictions"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rt-header">
          <div className="rt-header-left">
            <div className="rt-live-badge">
              <span className="rt-live-dot" />
              <span>LIVE REAL-TIME STREAM</span>
            </div>
            <h2 className="rt-title">REAL-TIME OCEAN TELEMETRY & 72-HOUR PREDICTIONS</h2>
            <p className="rt-subtitle">
              Operational in-situ CTD profiles & actual forward hydrodynamic predictions
            </p>
          </div>

          <div className="rt-header-right">
            <button
              className="rt-sync-globe-btn"
              onClick={() => {
                onFlyToLocation?.(selectedLat, selectedLon);
                onClose();
              }}
              title="Align 3D Globe camera to this spot"
            >
              <Navigation size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Fly 3D Globe Here
            </button>
            <button className="rt-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Location Selector Chips */}
        <div className="rt-presets-bar">
          <span className="presets-label">Domain Presets:</span>
          <div className="presets-list">
            {PRESET_LOCATIONS.map((p) => {
              const isSelected = Math.abs(selectedLat - p.lat) < 0.1 && Math.abs(selectedLon - p.lon) < 0.1;
              return (
                <button
                  key={p.label}
                  className={`rt-preset-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(p.lat, p.lon)}
                >
                  <span className="chip-name">{p.label}</span>
                  <span className="chip-coord">{p.lat}°N, {p.lon}°E</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="rt-tabs">
          <button
            className={`rt-tab ${activeTab === 'forecast' ? 'active' : ''}`}
            onClick={() => setActiveTab('forecast')}
          >
            <Waves size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Real-Time Waves, Currents & 72h Predictions
          </button>
          <button
            className={`rt-tab ${activeTab === 'fleet' ? 'active' : ''}`}
            onClick={() => setActiveTab('fleet')}
          >
            <Radio size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Live In-Situ Argo Fleet ({fleetData?.total_profiles_found || 14} active)
          </button>
        </div>

        {/* Data Provenance Banner */}
        {!loading && activeTab === 'forecast' && oceanData && (
          <div className={`rt-provenance-banner ${oceanData.status === 'live' ? 'live' : 'fallback'}`}>
            {oceanData.status === 'live' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} style={{ color: '#4ade80' }} />
                <strong>LIVE DATA:</strong> Connected to upstream network ({oceanData.source})
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} style={{ color: '#facc15' }} />
                <strong>CALIBRATED BASELINE:</strong> Upstream network offline. Displaying synthesized physics baseline ({oceanData.source})
              </span>
            )}
          </div>
        )}
        {!loading && activeTab === 'fleet' && fleetData && (
          <div className={`rt-provenance-banner ${fleetData.status === 'live' ? 'live' : 'fallback'}`}>
            {fleetData.status === 'live' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} style={{ color: '#4ade80' }} />
                <strong>LIVE FLEET:</strong> Connected to Ifremer GDAC ERDDAP
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} style={{ color: '#facc15' }} />
                <strong>CACHED SNAPSHOT:</strong> ERDDAP offline. Displaying INCOIS baseline observation network.
              </span>
            )}
          </div>
        )}

        {/* Body Content */}
        <div className="rt-body">
          {loading && (
            <div className="rt-loading">
              <div className="rt-spinner" />
              <span>Connecting to live ocean satellite telemetry & calculating 72h predictions...</span>
            </div>
          )}

          {error && (
            <div className="rt-error">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
            </div>
          )}

          {!loading && activeTab === 'forecast' && currentObs && (
            <div className="rt-forecast-container">
              {/* Telemetry Metric Cards */}
              <div className="rt-metrics-grid">
                {/* 1. Wave Height */}
                <div className="rt-metric-card">
                  <span className="metric-label">SIGNIFICANT WAVE HEIGHT</span>
                  <div className="metric-val-row">
                    <span className="metric-val">{currentObs.wave_height_m}</span>
                    <span className="metric-unit">meters</span>
                  </div>
                  <div className="metric-sub-row">
                    <span>Swell: {currentObs.swell_wave_height_m}m</span>
                    <span>Wind Wave: {currentObs.wind_wave_height_m}m</span>
                  </div>
                </div>

                {/* 2. Current Velocity */}
                <div className="rt-metric-card">
                  <span className="metric-label">OCEAN CURRENT VELOCITY</span>
                  <div className="metric-val-row">
                    <span className="metric-val">{currentObs.current_velocity_ms}</span>
                    <span className="metric-unit">m/s ({(currentObs.current_velocity_ms * 1.944).toFixed(1)} kts)</span>
                  </div>
                  <div className="metric-sub-row">
                    <span>Direction: {currentObs.current_direction_deg}° (Eastward)</span>
                  </div>
                </div>

                {/* 3. Wave Period */}
                <div className="rt-metric-card">
                  <span className="metric-label">DOMINANT WAVE PERIOD</span>
                  <div className="metric-val-row">
                    <span className="metric-val">{currentObs.wave_period_s}</span>
                    <span className="metric-unit">seconds</span>
                  </div>
                  <div className="metric-sub-row">
                    <span>Wave Direction: {currentObs.wave_direction_deg}°</span>
                  </div>
                </div>

                {/* 4. Estimated Sea Surface Temp */}
                <div className="rt-metric-card">
                  <span className="metric-label">SURFACE WATER TEMPERATURE</span>
                  <div className="metric-val-row">
                    <span className="metric-val">{currentObs.sea_surface_temp_estimate_c}°</span>
                    <span className="metric-unit">Celsius</span>
                  </div>
                  <div className="metric-sub-row">
                    <span className="alert-amber">Tropical Cyclone Fuel Zone</span>
                  </div>
                </div>
              </div>

              {/* 72-Hour Actual Forward Forecast Graph */}
              <div className="rt-chart-card">
                <div className="chart-header">
                  <div className="chart-title-wrap">
                    <h4>72-HOUR ACTUAL FORWARD OCEAN PREDICTIONS</h4>
                    <span className="chart-subtitle">
                      Hourly wave height and current velocity forecast from Open-Meteo & ECMWF hydrodynamic models
                    </span>
                  </div>
                  <div className="chart-legend">
                    <span className="legend-item wave">
                      <span className="legend-line wave" /> Wave Height (m)
                    </span>
                    <span className="legend-item current">
                      <span className="legend-line current" /> Current Speed (m/s)
                    </span>
                  </div>
                </div>

                {/* SVG Prediction Graph */}
                <div className="chart-svg-wrap">
                  <svg viewBox="0 0 640 140" className="prediction-svg" preserveAspectRatio="none">
                    {/* Grid horizontal lines */}
                    <line x1="20" y1="20" x2="620" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                    <line x1="20" y1="70" x2="620" y2="70" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                    <line x1="20" y1="120" x2="620" y2="120" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />

                    {/* Prediction curves */}
                    <path d={chartPaths.wavePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                    <path d={chartPaths.currentPath} fill="none" stroke="#fbbf24" strokeWidth="2.5" />

                    {/* Selected hour vertical bar */}
                    {selectedHourOffset >= 0 && (
                      <line
                        x1={20 + (selectedHourOffset / 71) * 600}
                        y1="10"
                        x2={20 + (selectedHourOffset / 71) * 600}
                        y2="130"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        strokeDasharray="2,2"
                      />
                    )}
                  </svg>
                </div>

                {/* Time Axis Markers */}
                <div className="chart-time-axis">
                  <span>Now (+0h)</span>
                  <span>+12h</span>
                  <span>+24h (Tomorrow)</span>
                  <span>+36h</span>
                  <span>+48h (Day 2)</span>
                  <span>+60h</span>
                  <span>+72h (Day 3)</span>
                </div>

                {/* Interactive Hourly Slider */}
                <div className="hour-scrubber-row">
                  <label htmlFor="forecast-scrubber" className="scrubber-label">
                    Scrub Forecast Hour: <strong>+{selectedHourOffset}h ({selectedHourData?.time || 'Now'})</strong>
                  </label>
                  <input
                    id="forecast-scrubber"
                    type="range"
                    min="0"
                    max="71"
                    value={selectedHourOffset}
                    onChange={(e) => setSelectedHourOffset(Number(e.target.value))}
                    className="scrubber-slider"
                  />
                </div>

                {/* Selected Hour Breakdown */}
                {selectedHourData && (
                  <div className="scrubbed-hour-card">
                    <span className="scrub-badge">HOUR +{selectedHourData.hour_offset} PREDICTION</span>
                    <div className="scrub-stats">
                      <span>Predicted Wave Height: <strong>{selectedHourData.wave_height_m} meters</strong></span>
                      <span>Predicted Current Speed: <strong>{selectedHourData.current_velocity_ms} m/s</strong></span>
                      <span>Direction: <strong>{selectedHourData.current_direction_deg}°</strong></span>
                      <span className={`risk-tag ${selectedHourData.cyclone_risk.toLowerCase()}`}>
                        Risk: {selectedHourData.cyclone_risk}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Advisory Card */}
              {currentPred && (
                <div className="rt-advisory-card">
                  <div className="advisory-icon"><AlertCircle size={20} /></div>
                  <div className="advisory-content">
                    <h5>72-HOUR OPERATIONAL PREDICTION SUMMARY</h5>
                    <p>{currentPred.recommendation}</p>
                    <div className="advisory-meta">
                      <span>Peak Wave Forecast: <strong>{currentPred.peak_wave_height_m}m</strong></span>
                      <span>Peak Current Velocity: <strong>{currentPred.peak_current_velocity_ms} m/s</strong></span>
                      <span>Risk Category: <strong>{currentPred.primary_risk}</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'fleet' && fleetData && (
            <div className="rt-fleet-container">
              <div className="fleet-header-row">
                <span className="fleet-count-tag">
                  {fleetData.unique_active_floats} OPERATIONAL IN-SITU PLATFORMS DETECTED
                </span>
                <span className="fleet-source-tag">Source: {fleetData.source}</span>
              </div>

              <div className="fleet-table-wrap">
                <table className="rt-fleet-table">
                  <thead>
                    <tr>
                      <th>Platform ID</th>
                      <th>Type</th>
                      <th>Latitude</th>
                      <th>Longitude</th>
                      <th>Last Observation (UTC)</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleetData.platforms.map((p) => (
                      <tr key={p.platform_id}>
                        <td className="mono-text">#{p.platform_id}</td>
                        <td>{p.type}</td>
                        <td className="mono-text">{p.latitude.toFixed(3)}°N</td>
                        <td className="mono-text">{p.longitude.toFixed(3)}°E</td>
                        <td className="mono-text">{p.last_observation_utc ? p.last_observation_utc.replace('T', ' ').replace('Z', '') : 'Live Streaming'}</td>
                        <td>
                          <span className={`fleet-status-badge ${p.status.toLowerCase()}`}>
                            {p.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="fleet-fly-btn"
                            onClick={() => {
                              onFlyToLocation?.(p.latitude, p.longitude);
                              onClose();
                            }}
                          >
                            Fly Here →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RealtimePredictionModal;
