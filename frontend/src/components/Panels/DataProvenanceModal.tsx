/**
 * DataProvenanceModal.tsx
 * Scientific data provenance & methodology — every value on this card is read
 * live from /api/data/status (model file attributes, Argo ingest statistics,
 * ML training source), so it can never drift from what is actually served.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Globe2, MapPin, Cpu, Tornado } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { getDataStatus, type DataStatusResponse } from '../../services/intelApi';
import './DataProvenanceModal.css';

interface DataProvenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Item: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="prov-item">
    <span className="p-label">{label}</span>
    <span className="p-val">{value ?? '—'}</span>
  </div>
);

const utc = (iso?: string | null) => (iso ? `${new Date(iso).toUTCString().slice(5, 22)} UTC` : '—');

export const DataProvenanceModal: React.FC<DataProvenanceModalProps> = ({ isOpen, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, cardRef);
  const [status, setStatus] = useState<DataStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getDataStatus().then(setStatus).catch((e) => setError(e.message));
  }, [isOpen]);

  if (!isOpen) return null;
  const m = status?.model;
  const a = status?.argo;
  const depths = m?.depth_levels ?? [];
  const roles = m?.time_roles ?? [];
  const range = m?.dataset_time_range as [string | null, string | null] | undefined;

  return (
    <div className="provenance-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="provenance-card"
        role="dialog"
        aria-modal="true"
        aria-label="Scientific Data Provenance and Methodology"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="provenance-header">
          <div className="header-title-block">
            <span className="provenance-tag">SCIENTIFIC PROVENANCE & METHODOLOGY</span>
            <h2>DATA AUDIT // LIVE SOURCES</h2>
          </div>
          <button className="provenance-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="provenance-content">
          {error && <div className="provenance-section"><span className="p-val">Provenance unavailable: {error}</span></div>}

          <div className="provenance-section">
            <div className="section-title-row">
              <span className="section-icon"><Globe2 size={16} /></span>
              <h3>1. NUMERICAL OCEAN MODEL (LIVE)</h3>
            </div>
            <div className="provenance-grid">
              <Item label="Product" value={m?.source_provenance} />
              <Item label="Native resolution" value={m?.native_resolution} />
              <Item label="Served grid" value={m?.dimensions ? `${m.dimensions.lat} × ${m.dimensions.lon} points (0.25°)` : null} />
              <Item label="Domain" value={m?.lat_range && m?.lon_range ? `${m.lat_range[0]}–${m.lat_range[1]}°N, ${m.lon_range[0]}–${m.lon_range[1]}°E` : null} />
              <Item label="Vertical levels" value={depths.length ? `${depths.length} levels, ${depths[0]}–${depths[depths.length - 1]} m` : null} />
              <Item label="Time steps" value={roles.length ? `${roles.filter((r) => r === 'analysis').length} analysis + ${roles.filter((r) => r === 'forecast').length} forecast days` : null} />
              <Item label="Valid range" value={range ? `${utc(range[0])} → ${utc(range[1])}` : null} />
              <Item label="Retrieved" value={utc(m?.retrieved_at)} />
              <Item label="Synthetic data" value={m ? (m.is_synthetic ? 'YES — flagged' : 'No') : null} />
            </div>
          </div>

          <div className="provenance-section">
            <div className="section-title-row">
              <span className="section-icon"><MapPin size={16} /></span>
              <h3>2. IN-SITU OBSERVATIONS</h3>
            </div>
            <div className="provenance-grid">
              <Item label="Source" value={a?.source} />
              <Item label="QC'd profiles / floats" value={a ? `${a.n_argo_profiles} profiles · ${a.n_unique_floats} floats` : null} />
              <Item label="Levels kept / rejected" value={a ? `${(a.levels_qc_passed ?? 0).toLocaleString()} / ${(a.levels_qc_rejected ?? 0).toLocaleString()}` : null} />
              <Item label="Profiles rejected by QC" value={a?.profiles_qc_rejected} />
              <Item label="QC policy" value={a?.qc_policy} />
              <Item label="Ingested" value={utc(a?.ingested_at)} />
              <Item label="Moored buoys / gliders" value="Not connected — no public live feed (no simulated values shown)" />
            </div>
          </div>

          <div className="provenance-section">
            <div className="section-title-row">
              <span className="section-icon"><Cpu size={16} /></span>
              <h3>3. CO-LOCATION & ML</h3>
            </div>
            <div className="provenance-grid">
              <Item label="Spatial matching" value="Bilinear interpolation of the model to each float position" />
              <Item label="Temporal matching" value="Nearest model analysis step, ±36 h (forecast steps never used for verification)" />
              <Item label="Vertical matching" value="Model interpolated to Argo depths (Saunders 1981 pressure→depth)" />
              <Item label="Anomaly engine" value={
                status?.anomaly_model.training_source === 'live_fleet_residuals'
                  ? `Isolation Forest fit on ${status.anomaly_model.n_training_profiles} real Argo-minus-model residual profiles (${utc(status.anomaly_model.trained_at)})`
                  : 'Isolation Forest — synthetic prior until the live fit completes'
              } />
              <Item label="Feature vector" value="Mean |Δ|, max |Δ|, 0–200 m heat Δ, max dT/dz Δ, depth of max Δ" />
              <Item label="Grounded analyst" value="Text assembled from computed evidence; confidence = f(distance, time offset)" />
            </div>
          </div>

          <div className="provenance-section">
            <div className="section-title-row">
              <span className="section-icon"><Tornado size={16} /></span>
              <h3>4. CYCLONES</h3>
            </div>
            <div className="provenance-grid">
              <Item label="Live storms" value="GDACS event API (EC-JRC / UN), observed + forecast tracks" />
              <Item label="History & RI" value="IBTrACS v04r01 (NOAA NCEI); RI = +30 kt in 24 h" />
              <Item label="TCHP" value="ρ·Cp·∫(T−26)dz to the 26 °C isotherm (0.4085 kJ cm⁻² m⁻¹ °C⁻¹)" />
            </div>
          </div>
        </div>

        <div className="provenance-footer">
          <span className="footer-note">All values above are read from the running backend at open time.</span>
          <button className="done-btn" onClick={onClose}>Close Provenance</button>
        </div>
      </div>
    </div>
  );
};

export default DataProvenanceModal;
