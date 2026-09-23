/**
 * LayerRail.tsx
 * Persistent Left Layer Rail inspired by OSIRIS.
 * Manages active scientific feeds across Model, Observations, Satellite, and Environment.
 */
import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  Thermometer,
  Droplets,
  Waves,
  Radio,
  Navigation,
  Anchor,
  Satellite,
  Activity,
  Wind,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import type { OceanVariable } from '../../types';
import './LayerRail.css';

interface LayerRailProps {
  variable: OceanVariable;
  depth: number;
  showCurrents: boolean;
  opacity: number;
  showArgo: boolean;
  showBuoys?: boolean;
  showGliders?: boolean;
  argoCount?: number;
  buoyCount?: number;
  gliderCount?: number;
  showSST: boolean;
  showCyclones: boolean;
  showTCHP?: boolean;
  showConfidence?: boolean;
  showVolumetricBlock?: boolean;
  verticalExaggeration?: number;
  onVariableChange: (v: OceanVariable) => void;
  onToggleCurrents: () => void;
  onToggleArgo: () => void;
  onToggleBuoys?: () => void;
  onToggleGliders?: () => void;
  onToggleSST: () => void;
  onToggleCyclones: () => void;
  onToggleTCHP?: () => void;
  onToggleConfidence?: () => void;
  onCycloneSeasonView?: () => void;
  onToggleVolumetricBlock?: () => void;
  onVerticalExaggerationChange?: (ex: number) => void;
  onOpacityChange: (op: number) => void;
  onOpenTransect: () => void;
  onOpenRegionAnalysis: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const LayerRail: React.FC<LayerRailProps> = ({
  variable,
  depth,
  showCurrents,
  opacity,
  showArgo,
  showBuoys,
  showGliders,
  argoCount,
  buoyCount,
  gliderCount,
  showSST,
  showCyclones,
  showTCHP = false,
  showConfidence = false,
  showVolumetricBlock = true,
  verticalExaggeration = 1.0,
  onVariableChange,
  onToggleCurrents,
  onToggleArgo,
  onToggleBuoys,
  onToggleGliders,
  onToggleSST,
  onToggleCyclones,
  onToggleTCHP = () => {},
  onToggleConfidence = () => {},
  onCycloneSeasonView,
  onToggleVolumetricBlock = () => {},
  onVerticalExaggerationChange = () => {},
  onOpacityChange,
  onOpenTransect,
  onOpenRegionAnalysis,
  isOpen,
  onToggleOpen,
}) => {

  const [modelExpanded, setModelExpanded] = useState(true);
  const [obsExpanded, setObsExpanded] = useState(true);
  const [satExpanded, setSatExpanded] = useState(false);
  const [envExpanded, setEnvExpanded] = useState(false);

  return (
    <aside className={`layer-rail ${isOpen ? 'open' : 'collapsed'}`}>
      {/* Rail Tab Toggle Button */}
      <button
        className="layer-rail-toggle-btn"
        onClick={onToggleOpen}
        title={isOpen ? 'Collapse Layer Rail (Key: L)' : 'Expand Layer Rail (Key: L)'}
      >
        <span className="rail-toggle-icon">{isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}</span>
        <span className="rail-toggle-text">LAYERS</span>
      </button>

      {isOpen && (
        <div className="layer-rail-content">
          <div className="layer-rail-header">
            <div className="layer-rail-title">
              <Layers size={14} className="rail-icon" />
              <span>SCIENTIFIC FEEDS</span>
            </div>
            <span className="rail-active-count">
              DEPTH: {depth}M
            </span>
          </div>

          {/* Quick Spatial Tools */}
          <div className="rail-tools-strip">
            <button
              className="rail-tool-btn"
              onClick={onOpenRegionAnalysis}
              title="Draw / Analyze Region (Area, Mean Temp, Residual)"
            >
              REGION
            </button>
            <button
              className="rail-tool-btn"
              onClick={onOpenTransect}
              title="Generate Subsurface Depth Transect A -> B"
            >
              TRANSECT
            </button>
            {onCycloneSeasonView && (
              <button
                className="rail-tool-btn cyclone-btn"
                onClick={onCycloneSeasonView}
                title="Bay of Bengal Cyclone Season View (Pan to 12°N, 88°E, Depth 0m, Enable TCHP)"
                style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              >
                <Wind size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }} />
                CYCLONE
              </button>
            )}
          </div>

          <div className="layer-rail-scroll-area">
          {/* Opacity Control */}
          <div className="rail-slider-group">
            <div className="rail-slider-label">
              <span>LAYER OPACITY</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.02"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="rail-range"
            />
          </div>

          {/* 3D Subsurface Volume Block Control */}
          <div className="rail-slider-group">
            <div className="rail-slider-label">
              <span>3D VOLUME SLABS</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showVolumetricBlock}
                  onChange={onToggleVolumetricBlock}
                  style={{ accentColor: '#00E5FF' }}
                />
                <span style={{ color: '#00E5FF', fontSize: '9px' }}>{showVolumetricBlock ? 'ON' : 'OFF'}</span>
              </label>
            </div>
            <div className="rail-slider-label" style={{ marginTop: '4px' }}>
              <span>VERTICAL EXAGGERATION</span>
              <span>{verticalExaggeration.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.1"
              value={verticalExaggeration}
              onChange={(e) => onVerticalExaggerationChange(parseFloat(e.target.value))}
              className="rail-range"
            />
          </div>

          {/* Group 1: Numerical Model */}
          <div className="feed-category">
            <div
              className="category-header"
              onClick={() => setModelExpanded(!modelExpanded)}
            >
              <span className="category-title">NUMERICAL MODEL (LIVE HYCOM/CMEMS)</span>
              <span className="category-arrow">{modelExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            </div>
            {modelExpanded && (
              <div className="category-items">
                <label
                  className={`feed-item ${variable === 'thetao' ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="model_var"
                    checked={variable === 'thetao'}
                    onChange={() => onVariableChange('thetao')}
                  />
                  <span className="feed-label">
                    <Thermometer size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Temperature (θ)
                  </span>
                  <span className="feed-badge">°C</span>
                </label>

                <label
                  className={`feed-item ${variable === 'so' ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="model_var"
                    checked={variable === 'so'}
                    onChange={() => onVariableChange('so')}
                  />
                  <span className="feed-label">
                    <Droplets size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Salinity (S)
                  </span>
                  <span className="feed-badge">PSU</span>
                </label>

                <label
                  className={`feed-item ${showCurrents ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={showCurrents}
                    onChange={onToggleCurrents}
                  />
                  <span className="feed-label">
                    <Waves size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    3D Current Vectors
                  </span>
                  <span className="feed-badge cyan">VECTORS</span>
                </label>
              </div>
            )}
          </div>

          {/* Group 2: In-Situ Observations */}
          <div className="feed-category">
            <div
              className="category-header"
              onClick={() => setObsExpanded(!obsExpanded)}
            >
              <span className="category-title">IN-SITU OBSERVATIONS</span>
              <span className="category-arrow">{obsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            </div>
            {obsExpanded && (
              <div className="category-items">
                <label
                  className={`feed-item ${showArgo ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={showArgo}
                    onChange={onToggleArgo}
                  />
                  <span className="feed-label">
                    <Radio size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Argo Profiling Fleet
                  </span>
                  <span className="feed-badge green">LIVE ({argoCount ?? 0})</span>
                </label>

                <label className={`feed-item ${showGliders ?? showArgo ? 'active' : ''}`} title="Autonomous Glider feed">
                  <input type="checkbox" checked={showGliders ?? showArgo} onChange={onToggleGliders ?? onToggleArgo} />
                  <span className="feed-label">
                    <Navigation size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Ocean Gliders
                  </span>
                  {gliderCount ? (
                    <span className="feed-badge green">LIVE ({gliderCount})</span>
                  ) : (
                    <span className="feed-badge" title="No public live glider feed for this domain">NO FEED</span>
                  )}
                </label>

                <label className={`feed-item ${showBuoys ?? showArgo ? 'active' : ''}`} title="Moored buoy arrays">
                  <input type="checkbox" checked={showBuoys ?? showArgo} onChange={onToggleBuoys ?? onToggleArgo} />
                  <span className="feed-label">
                    <Anchor size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Moored Buoys (OMNI)
                  </span>
                  {buoyCount ? (
                    <span className="feed-badge green">LIVE ({buoyCount})</span>
                  ) : (
                    <span className="feed-badge" title="No public live RAMA/OMNI feed (PMEL RAMA archive ends Feb 2026)">NO FEED</span>
                  )}
                </label>
              </div>
            )}
          </div>

          {/* Group 3: Satellite Data */}
          <div className="feed-category">
            <div
              className="category-header"
              onClick={() => setSatExpanded(!satExpanded)}
            >
              <span className="category-title">SATELLITE TELEMETRY</span>
              <span className="category-arrow">{satExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            </div>
            {satExpanded && (
              <div className="category-items">
                <label
                  className={`feed-item ${showSST ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={showSST}
                    onChange={onToggleSST}
                  />
                  <span className="feed-label">
                    <Satellite size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    MODIS Infrared SST
                  </span>
                  <span className="feed-badge">NASA</span>
                </label>

                <label className="feed-item disabled" title="Sea Level Anomaly standby">
                  <input type="checkbox" disabled />
                  <span className="feed-label muted">
                    <Activity size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Sea Level Anomaly (SLA)
                  </span>
                  <span className="feed-badge faint">ALTIMETRY</span>
                </label>
              </div>
            )}
          </div>

          {/* Group 4: Environment & Disasters */}
          <div className="feed-category">
            <div
              className="category-header"
              onClick={() => setEnvExpanded(!envExpanded)}
            >
              <span className="category-title">HAZARDS & ENVIRONMENT</span>
              <span className="category-arrow">{envExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            </div>
            {envExpanded && (
              <div className="category-items">
                <label
                  className={`feed-item ${showCyclones ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={showCyclones}
                    onChange={onToggleCyclones}
                  />
                  <span className="feed-label">
                    <Wind size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Cyclone Track Hazards
                  </span>
                  <span className="feed-badge red">IBTrACS + GDACS</span>
                </label>

                <label
                  className={`feed-item ${showTCHP ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={showTCHP}
                    onChange={onToggleTCHP}
                  />
                  <span className="feed-label">
                    <Flame size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Cyclone Heat Potential (TCHP)
                  </span>
                  <span className="feed-badge orange">TCHP &gt; 50</span>
                </label>

                <label
                  className={`feed-item ${showConfidence ? 'active' : ''}`}
                  title="Where the model is verified by nearby Argo floats (green) vs unverified or high-error (amber/red)"
                >
                  <input
                    type="checkbox"
                    checked={showConfidence}
                    onChange={onToggleConfidence}
                  />
                  <span className="feed-label">
                    <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                    Model Confidence (Argo-verified)
                  </span>
                  <span className="feed-badge">TRUST</span>
                </label>
              </div>
            )}
          </div>

          </div>
        </div>
      )}
    </aside>
  );
};

export default LayerRail;
