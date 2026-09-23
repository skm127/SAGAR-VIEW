import React from 'react';
import { Activity, Split } from 'lucide-react';
import type { HeatPotentialPoint } from '../../types';
import './TCHPInspectorCard.css';

interface TCHPInspectorCardProps {
  data: HeatPotentialPoint;
  onClose: () => void;
  onOpenTransect?: () => void;
}

export const TCHPInspectorCard: React.FC<TCHPInspectorCardProps> = ({
  data,
  onClose,
  onOpenTransect,
}) => {
  const isHighRisk = data.high_risk_flag || data.tchp >= 50.0;
  const isExtreme = data.tchp >= 80.0;

  let riskBadgeClass = 'risk-low';
  if (isExtreme) riskBadgeClass = 'risk-extreme';
  else if (isHighRisk) riskBadgeClass = 'risk-high';
  else if (data.tchp >= 30.0) riskBadgeClass = 'risk-mod';

  return (
    <div className={`tchp-inspector-card ${isHighRisk ? 'pulse-border' : ''}`}>
      <div className="tchp-card-header">
        <div className="tchp-header-left">
          <Activity size={18} className="tchp-cyclone-icon" />
          <div>
            <div className="tchp-card-title">CYCLONE HEAT POTENTIAL (TCHP)</div>
            <div className="tchp-card-sub">
              {Math.abs(data.latitude).toFixed(2)}°{data.latitude >= 0 ? 'N' : 'S'}, {Math.abs(data.longitude).toFixed(2)}°{data.longitude >= 0 ? 'E' : 'W'} · INCOIS Diagnostic
            </div>
          </div>
        </div>
        <button
          className="tchp-close-btn"
          onClick={onClose}
          aria-label="Close TCHP Inspector"
        >
          ✕
        </button>
      </div>

      <div className="tchp-primary-metric">
        <div className="tchp-metric-val">
          <span className="val-number">{data.tchp.toFixed(1)}</span>
          <span className="val-unit">kJ/cm²</span>
        </div>
        <div className={`tchp-risk-pill ${riskBadgeClass}`}>
          {isHighRisk && <span className="risk-indicator-dot" />}
          <span>{data.cyclone_risk}</span>
        </div>
      </div>

      <div className="tchp-grid-stats">
        <div className="tchp-stat-box">
          <div className="stat-label">26°C ISOTHERM (D₂₆)</div>
          <div className="stat-val">{data.d26.toFixed(1)} <span className="sub-unit">m</span></div>
          <div className="stat-desc">Depth of thermal reservoir</div>
        </div>

        <div className="tchp-stat-box">
          <div className="stat-label">SEA SURFACE TEMP (SST)</div>
          <div className="stat-val">{data.sst.toFixed(1)} <span className="sub-unit">°C</span></div>
          <div className="stat-desc">Upper mixed layer thermal state</div>
        </div>

        <div className="tchp-stat-box">
          <div className="stat-label">WARM-SST CLASS</div>
          <div className="stat-val cat-val">
            {data.mhw_category > 0 ? `Class ${data.mhw_category}` : 'None'}
          </div>
          <div className="stat-desc" title="Fixed 28 °C baseline — not a climatology-based (Hobday 2016) marine heatwave">{data.mhw_label}</div>
        </div>

        <div className="tchp-stat-box">
          <div className="stat-label">RI-SUPPORT THRESHOLD</div>
          <div className="stat-val threshold-val">
            {data.tchp >= 50.0 ? `+${(data.tchp - 50.0).toFixed(1)}` : 'Sub-Critical'}
            {data.tchp >= 50.0 && <span className="sub-unit"> kJ/cm²</span>}
          </div>
          <div className="stat-desc">Threshold: 50 kJ/cm² rapid intensification</div>
        </div>
      </div>

      <div className="tchp-formula-bar" title="Q = ρ * Cₚ * ∫(T(z) − 26) dz">
        <span className="formula-icon">∑</span>
        <span className="formula-text">
          Q = ρ Cₚ ∫(T(z) − 26) dz
        </span>
      </div>

      {onOpenTransect && (
        <div className="tchp-footer-actions">
          <button className="tchp-action-btn" onClick={onOpenTransect}>
            <Split size={14} />
            <span>Vertical Cross-Section Through Warm Pool</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TCHPInspectorCard;
