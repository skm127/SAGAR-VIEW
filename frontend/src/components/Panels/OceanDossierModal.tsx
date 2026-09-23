/**
 * OceanDossierModal.tsx
 * Contextual investigation panel triggered by right-clicking anywhere on the ocean surface.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Satellite, AlertTriangle, MapPin, Activity, GitCompare, Split, Maximize2 } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { getOceanDossier } from '../../services/api';
import type { OceanDossierResponse } from '../../types';
import './OceanDossierModal.css';


interface OceanDossierModalProps {
  coordinate: { lat: number; lon: number };
  depth: number;
  timeIndex: number;
  date: string;
  onClose: () => void;
  onOpenProfile: (lat: number, lon: number, depths: number[], vals: (number | null)[]) => void;
  onSelectArgo?: (id: string) => void;
  onStartTransectFromHere?: (lat: number, lon: number) => void;
  onAnalyzeRegionHere?: (lat: number, lon: number) => void;
}

export const OceanDossierModal: React.FC<OceanDossierModalProps> = ({
  coordinate,
  depth,
  timeIndex,
  date,
  onClose,
  onOpenProfile,
  onSelectArgo,
  onStartTransectFromHere,
  onAnalyzeRegionHere,
}) => {
  const [loading, setLoading] = useState(true);
  const [dossier, setDossier] = useState<OceanDossierResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useModalA11y(true, onClose, cardRef);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getOceanDossier(coordinate.lat, coordinate.lon, depth, timeIndex)
      .then((data) => {
        if (!cancelled) {
          setDossier(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to retrieve region dossier');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [coordinate.lat, coordinate.lon, depth, timeIndex]);

  return (
    <div className="ocean-dossier-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="ocean-dossier-card"
        role="dialog"
        aria-modal="true"
        aria-label="Ocean Region Dossier"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}

        <div className="dossier-header">
          <div className="dossier-badge-row">
            <span className="dossier-type-tag">
              <Satellite size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              IN-SITU & MODEL FUSION
            </span>
            <span className="dossier-date-tag">{date}</span>
          </div>
          <div className="dossier-title-row">
            <div>
              <h2 className="dossier-title">OCEAN REGION DOSSIER</h2>
              <span className="dossier-coord">
                {dossier?.coordinate.formatted ||
                  `${Math.abs(coordinate.lat).toFixed(2)}°${coordinate.lat >= 0 ? 'N' : 'S'}, ${Math.abs(coordinate.lon).toFixed(2)}°${coordinate.lon >= 0 ? 'E' : 'W'}`}
              </span>
            </div>
            <button className="dossier-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="dossier-loading">
            <div className="dossier-spinner" />
            <span>Retrieving Multi-Depth Telemetry...</span>
          </div>
        )}

        {error && (
          <div className="dossier-error">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
          </div>
        )}

        {!loading && dossier && (
          <div className="dossier-body">
            {/* Primary Telemetry Grid */}
            <div className="dossier-metrics-grid">
              {/* Temperature */}
              <div className="dossier-metric-box">
                <span className="box-label">TEMPERATURE ({dossier.depth_m}M)</span>
                <div className="box-val-row">
                  <span className="box-val temp">{dossier.telemetry.temperature}°C</span>
                </div>
                <span className="box-sub">Live ocean model</span>
              </div>

              {/* Salinity */}
              <div className="dossier-metric-box">
                <span className="box-label">SALINITY ({dossier.depth_m}M)</span>
                <div className="box-val-row">
                  <span className="box-val sal">{dossier.telemetry.salinity} PSU</span>
                </div>
                <span className="box-sub">Equatorial Halocline</span>
              </div>

              {/* Ocean Currents */}
              <div className="dossier-metric-box">
                <span className="box-label">DRIFT VELOCITY</span>
                <div className="box-val-row">
                  <span className="box-val current">{dossier.telemetry.current_speed} m/s</span>
                  <span className="box-dir">{dossier.telemetry.current_direction}</span>
                </div>
                <span className="box-sub">{dossier.telemetry.current_degrees}° Bearing</span>
              </div>

              {/* Model Residual Error */}
              <div className="dossier-metric-box">
                <span className="box-label">MODEL RESIDUAL</span>
                <div className="box-val-row">
                  {dossier.ocean_context.estimated_model_error !== null ? (
                    <span
                      className={`box-val ${dossier.ocean_context.estimated_model_error > 1.2 ? 'error-high' : 'error-low'}`}
                    >
                      +{dossier.ocean_context.estimated_model_error.toFixed(2)}°C
                    </span>
                  ) : (
                    <span className="box-val" style={{ color: 'var(--text-muted)' }}>
                      N/A
                    </span>
                  )}
                </div>
                <span className="box-sub">{dossier.ocean_context.anomaly_status}</span>
              </div>
            </div>

            {/* Context Intelligence Banner */}
            <div className="dossier-context-banner">
              <div className="banner-left">
                <span className="context-title">PROVENANCE & CONTEXT</span>
                <span className="context-model">{dossier.ocean_context.model_dataset}</span>
              </div>
              <div className="banner-right">
                <span className="context-obs-count">
                  {dossier.ocean_context.nearby_argo_count} In-Situ Float(s) within 350km
                </span>
              </div>
            </div>

            {/* Nearby Argo Floats */}
            {dossier.nearby_floats.length > 0 && (
              <div className="dossier-floats-list">
                <span className="floats-header">ACTIVE NEIGHBORING SENSORS:</span>
                <div className="floats-chips">
                  {dossier.nearby_floats.map((f) => (
                    <div
                      key={f.id}
                      className="float-chip"
                      onClick={() => onSelectArgo && onSelectArgo(f.id)}
                      title={`Target Float #${f.platform_id} (${f.distance_km} km away)`}
                    >
                      <span className="chip-icon"><MapPin size={12} /></span>
                      <span className="chip-name">Argo #{f.platform_id}</span>
                      <span className="chip-dist">{f.distance_km} km</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="dossier-actions">
              <button
                className="dossier-btn primary"
                onClick={() => {
                  onOpenProfile(
                    coordinate.lat,
                    coordinate.lon,
                    dossier.profile_preview.depths,
                    dossier.profile_preview.temperatures
                  );
                  onClose();
                }}
              >
                <Activity size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                VERTICAL SOUNDING
              </button>

              {dossier.ocean_context.nearest_float_id && onSelectArgo && (
                <button
                  className="dossier-btn secondary"
                  onClick={() => {
                    onSelectArgo(dossier.ocean_context.nearest_float_id!);
                    onClose();
                  }}
                >
                  <GitCompare size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  COMPARE MODEL
                </button>
              )}

              {onStartTransectFromHere && (
                <button
                  className="dossier-btn outline"
                  onClick={() => {
                    onStartTransectFromHere(coordinate.lat, coordinate.lon);
                    onClose();
                  }}
                >
                  <Split size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  TRANSECT FROM HERE
                </button>
              )}

              {onAnalyzeRegionHere && (
                <button
                  className="dossier-btn outline"
                  onClick={() => {
                    onAnalyzeRegionHere(coordinate.lat, coordinate.lon);
                    onClose();
                  }}
                >
                  <Maximize2 size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  REGION ANALYSIS
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OceanDossierModal;
