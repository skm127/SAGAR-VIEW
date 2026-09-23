/**
 * InfoPanel — Shows current view state in the top-left of the viewport.
 */
import { MapPin } from 'lucide-react';
import './InfoPanel.css';
import type { OceanVariable } from '../../types';
import { VARIABLE_LABELS, VARIABLE_UNITS } from '../../types';

interface InfoPanelProps {
  variable: OceanVariable;
  depth: number;
  date: string;
  vMin: number;
  vMax: number;
  loading: boolean;
  showCurrents: boolean;
  opacity?: number;
  fleetCount?: number;
  railOpen?: boolean;
  onOpacityChange?: (opacity: number) => void;
  onOpenFleet?: () => void;
}

export default function InfoPanel({
  variable,
  depth,
  date,
  vMin,
  vMax,
  loading,
  showCurrents,
  opacity = 0.82,
  fleetCount = 8,
  railOpen = false,
  onOpacityChange,
  onOpenFleet,
}: InfoPanelProps) {
  return (
    <div className={`info-panel ${railOpen ? 'with-layer-rail' : ''}`}>
      <div className="info-row">
        <span className="info-label">Variable</span>
        <span className="info-value">{VARIABLE_LABELS[variable]}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Depth</span>
        <span className="info-value">{depth}m</span>
      </div>
      <div className="info-row">
        <span className="info-label">Date</span>
        <span className="info-value">{date}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Range</span>
        <span className="info-value">
          {vMin.toFixed(1)} — {vMax.toFixed(1)} {VARIABLE_UNITS[variable]}
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">Domain</span>
        <span className="info-value" style={{ fontSize: '10px', color: '#38bdf8' }}>0-28°N, 60-100°E</span>
      </div>
      {onOpacityChange && (
        <div className="info-row opacity-row">
          <span className="info-label">Layer Blend</span>
          <div className="opacity-slider-container">
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="opacity-slider"
              title="Adjust Ocean Layer Opacity"
            />
            <span className="opacity-val">{Math.round(opacity * 100)}%</span>
          </div>
        </div>
      )}
      {showCurrents && (
        <div className="info-row">
          <span className="info-label">Currents</span>
          <span className="info-value current-active">Active</span>
        </div>
      )}
      {onOpenFleet && (
        <button className="hud-fleet-btn" onClick={onOpenFleet} title="Open In-Situ Float Fleet Drawer">
          <MapPin size={12} />
          <span>VIEW ARGO FLEET ({fleetCount})</span>
        </button>
      )}
      {loading && (
        <div className="info-row">
          <span className="info-loading">Loading...</span>
        </div>
      )}
    </div>
  );
}
