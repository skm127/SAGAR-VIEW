/**
 * OperationalSituationRoom.tsx
 * Forecaster / disaster-management overview. Every tile is driven by live
 * backend data; severity tags come from the data (never hardcoded), and the
 * advisory feed is generated server-side from live TCHP + trend, GDACS storms,
 * Argo-verified model skill and the fleet anomaly scan (/api/advisories).
 */
import React from 'react';
import { AlertTriangle, Activity, Radio, Tornado, ArrowRight, ShieldCheck } from 'lucide-react';
import type { Advisory } from '../../services/intelApi';
import './OperationalSituationRoom.css';

export interface SituationRoomData {
  /** platform_id of the highest-anomaly float, e.g. "2902345". */
  topFloatId: string | null;
  topFloatStatus: string | null;
  maxDelta: number | null;
  maxDepth: number | null;
  criticalCount: number;
  tchpKjCm2: number | null;
  argoCount: number;
  floatCount: number;
  activeNioCyclones: number;
  advisories: Advisory[];
  advisoriesValidTime: string | null;
}

interface OperationalSituationRoomProps {
  data: SituationRoomData;
  onJumpToAnomaly: () => void;
  onJumpTo: (lat: number, lon: number) => void;
  onOpenCyclones: () => void;
  onOpenModelTrust: () => void;
  onClose: () => void;
}

function regionCenter(a: Advisory): { lat: number; lon: number } | null {
  const r = a.region;
  if (!r) return null;
  if (r.lat != null && r.lon != null) return { lat: r.lat, lon: r.lon };
  if (r.lat_min != null && r.lat_max != null && r.lon_min != null && r.lon_max != null) {
    return { lat: (r.lat_min + r.lat_max) / 2, lon: (r.lon_min + r.lon_max) / 2 };
  }
  return null;
}

export const OperationalSituationRoom: React.FC<OperationalSituationRoomProps> = ({
  data,
  onJumpToAnomaly,
  onJumpTo,
  onOpenCyclones,
  onOpenModelTrust,
  onClose,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const anomalyLevel = data.criticalCount > 0 ? 'critical' : data.topFloatStatus === 'WARNING' ? 'warning' : 'nominal';
  const anomalyTag = anomalyLevel === 'critical' ? 'CRITICAL' : anomalyLevel === 'warning' ? 'WARNING' : 'NOMINAL';
  const fmtDelta = data.maxDelta != null ? `${data.maxDelta >= 0 ? '+' : ''}${data.maxDelta.toFixed(2)}°C` : '—';
  const fmtDepth = data.maxDepth != null ? `${Math.round(data.maxDepth)} m` : '—';
  const topAdvisory = data.advisories[0];
  const cycloneLevel = data.activeNioCyclones > 0 ? 'critical' : 'nominal';

  return (
    <div className={`situation-room-banner ${collapsed ? 'collapsed' : ''}`}>
      <div className="sr-header">
        <div className="sr-title-group">
          <span className="sr-pulse-dot" />
          <span className="sr-badge">OPERATIONAL SITUATION ROOM</span>
          <span className="sr-subtext">
            Auto-generated advisories{data.advisoriesValidTime ? ` · valid ${new Date(data.advisoriesValidTime).toUTCString().slice(5, 22)} UTC` : ''}
          </span>
        </div>
        <div className="sr-header-actions">
          <button className="sr-toggle-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand Situation Room' : 'Collapse to Ticker'}>
            {collapsed ? '▾ EXPAND' : '▴ COLLAPSE'}
          </button>
          <button className="sr-close-btn" onClick={onClose} title="Switch to Research Workstation">✕</button>
        </div>
      </div>

      {collapsed ? (
        <div className="sr-ticker-row">
          <div className="sr-ticker-item">
            <span className={`sr-ticker-tag ${anomalyLevel === 'nominal' ? 'live' : anomalyLevel}`}>
              <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              {anomalyTag}
            </span>
            <span className="sr-ticker-text">
              {data.criticalCount} critical Argo–model divergences · max {fmtDelta} @ {fmtDepth}
            </span>
            <button className="sr-ticker-btn" onClick={onJumpToAnomaly}>
              INTERROGATE <ArrowRight size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </button>
          </div>
          <div className="sr-ticker-sep">|</div>
          <div className="sr-ticker-item">
            <span className={`sr-ticker-tag ${topAdvisory?.level === 'info' ? 'live' : 'warning'}`}>
              <Activity size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              ADVISORY
            </span>
            <span className="sr-ticker-text">{topAdvisory ? topAdvisory.title : 'No advisories'}</span>
          </div>
          <div className="sr-ticker-sep">|</div>
          <div className="sr-ticker-item">
            <span className="sr-ticker-tag live">
              <Radio size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              LIVE
            </span>
            <span className="sr-ticker-text">{data.argoCount} QC'd Argo profiles · {data.floatCount} floats</span>
          </div>
        </div>
      ) : (
        <>
          <div className="sr-body">
            <div className={`sr-metric-tile ${anomalyLevel}`}>
              <div className="sr-tile-icon"><AlertTriangle size={20} /></div>
              <div className="sr-tile-content">
                <span className="sr-tile-label">IN-SITU vs MODEL · {anomalyTag}</span>
                <span className="sr-tile-value">{data.criticalCount} critical divergence{data.criticalCount === 1 ? '' : 's'}</span>
                <span className="sr-tile-sub">Largest {fmtDelta} at {fmtDepth} (float #{data.topFloatId ?? '—'})</span>
              </div>
              <button className="sr-action-btn" onClick={onJumpToAnomaly}>
                INTERROGATE <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
              </button>
            </div>

            <div className={`sr-metric-tile ${cycloneLevel === 'critical' ? 'critical' : 'warning'}`}>
              <div className="sr-tile-icon"><Tornado size={20} /></div>
              <div className="sr-tile-content">
                <span className="sr-tile-label">CYCLONES (GDACS LIVE)</span>
                <span className="sr-tile-value">
                  {data.activeNioCyclones > 0 ? `${data.activeNioCyclones} active in N. Indian Ocean` : 'None active in N. Indian Ocean'}
                </span>
                <span className="sr-tile-sub">RI watch · TCHP along forecast track · historical backtests</span>
              </div>
              <button className="sr-action-btn" onClick={onOpenCyclones}>
                OPEN <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
              </button>
            </div>

            <div className="sr-metric-tile nominal">
              <div className="sr-tile-icon"><ShieldCheck size={20} /></div>
              <div className="sr-tile-content">
                <span className="sr-tile-label">MODEL TRUST</span>
                <span className="sr-tile-value">{data.argoCount} QC'd Argo profiles</span>
                <span className="sr-tile-sub">{data.floatCount} floats verify the model by depth & location</span>
              </div>
              <button className="sr-action-btn" onClick={onOpenModelTrust}>
                VIEW <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
              </button>
            </div>
          </div>

          {data.advisories.length > 0 && (
            <ul className="sr-advisories" aria-label="Regional advisories">
              {data.advisories.map((a, i) => {
                const c = regionCenter(a);
                return (
                  <li key={i} className={`sr-advisory ${a.level}`}>
                    <span className={`sr-adv-level ${a.level}`}>{a.level.toUpperCase()}</span>
                    <span className="sr-adv-text"><strong>{a.title}.</strong> {a.message}</span>
                    {c && (
                      <button className="sr-ticker-btn" onClick={() => onJumpTo(c.lat, c.lon)}>
                        LOCATE <ArrowRight size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default OperationalSituationRoom;
