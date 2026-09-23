/**
 * ModelTrustModal — how far can the model be trusted, and where?
 *
 * 1. Depth-band skill: bias / RMSE of the live ocean model against every Argo
 *    profile co-located in space and time (±36 h of an analysis step).
 * 2. Spatial confidence: a globe overlay combining Argo verification density
 *    with local model error — cells without nearby floats are "unverified".
 */
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Layers, AlertTriangle } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import {
  getDepthSkill,
  type DepthSkillResponse,
  type ConfidenceFieldResponse,
} from '../../services/intelApi';
import './CycloneIntelligenceModal.css';
import './ModelTrustModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  confidence: ConfidenceFieldResponse | null;
  showConfidence: boolean;
  onToggleConfidence: () => void;
}

const VERDICT_COLOR: Record<string, string> = { good: '#22c55e', fair: '#f59e0b', poor: '#ef4444', no_data: '#475569' };

function SkillBars({ s }: { s: DepthSkillResponse }) {
  const maxRmse = Math.max(s.tiers.fair_rmse_max * 1.5, ...s.bands.map((b) => b.rmse ?? 0));
  return (
    <div className="mt-bands" role="table" aria-label={`Model skill by depth for ${s.variable}`}>
      <div className="mt-row head" role="row">
        <span>Depth band</span><span>RMSE ({s.unit})</span><span>Bias</span><span>Profiles</span>
      </div>
      {s.bands.map((b) => (
        <div className="mt-row" role="row" key={b.band}>
          <span className="mt-band">{b.band}</span>
          <span className="mt-bar-cell">
            <span className="mt-bar-track">
              {/* tier guides */}
              <i className="mt-tier" style={{ left: `${(s.tiers.good_rmse_max / maxRmse) * 100}%` }} />
              <i className="mt-tier" style={{ left: `${(s.tiers.fair_rmse_max / maxRmse) * 100}%` }} />
              <span className="mt-bar" style={{ width: `${((b.rmse ?? 0) / maxRmse) * 100}%`, background: VERDICT_COLOR[b.verdict] }} />
            </span>
            <span className="mt-num">{b.rmse ?? '—'}</span>
          </span>
          <span className="mt-num">{b.bias == null ? '—' : `${b.bias > 0 ? '+' : ''}${b.bias}`}</span>
          <span className="mt-num">{b.n_profiles}</span>
        </div>
      ))}
    </div>
  );
}

export const ModelTrustModal: React.FC<Props> = ({ isOpen, onClose, confidence, showConfidence, onToggleConfidence }) => {
  const [temp, setTemp] = useState<DepthSkillResponse | null>(null);
  const [sal, setSal] = useState<DepthSkillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, modalRef);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    getDepthSkill('thetao').then(setTemp).catch((e) => setError(e.message));
    getDepthSkill('so').then(setSal).catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;
  const st = confidence?.statistics;

  return (
    <div className="ci-overlay" onClick={onClose}>
      <div ref={modalRef} className="ci-modal" role="dialog" aria-modal="true" aria-label="Model Trust" tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        <div className="ci-header">
          <div>
            <span className="ci-badge mt-badge"><ShieldCheck size={12} /> MODEL TRUST</span>
            <span className="ci-sub">
              Live model verified against co-located Argo profiles, by depth and by location
            </span>
          </div>
          <button className="ci-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="ci-error"><AlertTriangle size={13} /> Skill unavailable: {error}</div>}
        <div className="ci-body">
          {temp && (
            <>
              <div className={`ci-verdict ${temp.reliable_to_m ? 'hit' : ''}`}>
                <strong>Temperature</strong>
                <span>{temp.headline}</span>
              </div>
              <div className="ci-kpis">
                <div className="ci-kpi"><span className="k">Co-located profiles</span><span className="v">{temp.n_profiles_colocated}</span>
                  <span className="s">{temp.n_floats_colocated} floats · ±{temp.max_time_offset_hours} h</span></div>
                <div className="ci-kpi"><span className="k">Overall RMSE</span><span className="v">{temp.overall.rmse ?? '—'} °C</span>
                  <span className="s">bias {temp.overall.bias != null && temp.overall.bias > 0 ? '+' : ''}{temp.overall.bias} °C</span></div>
                <div className="ci-kpi good"><span className="k">Reliable (RMSE ≤ {temp.tiers.good_rmse_max})</span>
                  <span className="v">{temp.reliable_to_m != null ? `0–${temp.reliable_to_m} m` : 'none'}</span></div>
                <div className="ci-kpi warn"><span className="k">Weakest band</span><span className="v sm">{temp.worst_band ?? '—'}</span>
                  <span className="s">thermocline → affects D26 & TCHP</span></div>
              </div>
              <SkillBars s={temp} />
              <p className="ci-muted">
                Model: {temp.model_source}. {temp.overall.n_levels.toLocaleString()} matched levels; {temp.n_profiles_excluded_time_window} Argo
                profiles excluded because no model analysis step was within ±{temp.max_time_offset_hours} h. Forecast steps are never used for verification.
              </p>
            </>
          )}
          {sal && (
            <>
              <div className="ci-verdict"><strong>Salinity</strong><span>{sal.headline}</span></div>
              <SkillBars s={sal} />
            </>
          )}

          <div className="mt-conf">
            <div>
              <strong><Layers size={13} /> Spatial confidence layer</strong>
              <p className="ci-muted">
                Green = verified by nearby Argo floats with low local error; amber/red = larger local error or no floats within
                ~{confidence?.metadata.length_scale_km ?? 150} km ("unverified" — not necessarily wrong, just untested).
              </p>
              {st && (
                <p className="ci-muted">
                  {st.n_verifying_profiles} verifying profiles from {st.n_verifying_floats} floats · {st.pct_ocean_verified}% of ocean cells
                  verified · {st.pct_ocean_unverified}% unverified.
                </p>
              )}
              {confidence && <p className="ci-muted mt-formula">{confidence.metadata.formula}</p>}
            </div>
            <button className="ci-btn" onClick={onToggleConfidence} disabled={!confidence}>
              {showConfidence ? 'Hide on globe' : 'Show on globe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelTrustModal;
