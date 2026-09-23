/**
 * FleetSidebar — In-Situ Multi-Sensor Platform Manager (INCOIS Network).
 * Unified inventory of Argo Profilers, OMNI/RAMA Moored Buoys, and Ocean Gliders.
 */
import { useState, useMemo } from 'react';
import { Radio } from 'lucide-react';
import type { ArgoProfileSummary } from '../../types';
import './FleetSidebar.css';

export interface SensorSummaryLite {
  id: string;
  type: 'argo' | 'moored_buoy' | 'glider';
  platform_id: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface FleetSidebarProps {
  profiles: ArgoProfileSummary[];
  /** Live moored-buoy platforms from /api/observations/all. */
  buoys?: SensorSummaryLite[];
  /** Live glider platforms from /api/observations/all. */
  gliders?: SensorSummaryLite[];
  /** platform_id -> anomaly status from the fleet-wide analysis. */
  platformStatus?: Record<string, string>;
  selectedId: string | null;
  isOpen: boolean;
  railOpen?: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}

/** Display metadata only — positions/counts always come from the backend. */
const PLATFORM_META: Record<string, { name: string; basin: string; type: string }> = {
  BD08: { name: 'Bay of Bengal OMNI Buoy', basin: 'Bay of Bengal', type: 'INCOIS OMNI' },
  BD11: { name: 'Central Bay of Bengal OMNI', basin: 'Bay of Bengal', type: 'INCOIS OMNI' },
  AD02: { name: 'Arabian Sea OMNI Buoy', basin: 'Arabian Sea', type: 'INCOIS OMNI' },
  AD07: { name: 'Lakshadweep RAMA Buoy', basin: 'Arabian Sea', type: 'MoES RAMA' },
  RAMA_EQ: { name: 'Equatorial RAMA Buoy', basin: 'Equatorial Indian Ocean', type: 'MoES RAMA' },
  GLIDER_BOB_01: { name: 'Visakhapatnam Shelf Coastal Glider', basin: 'Bay of Bengal', type: 'Ocean Glider' },
};

function statusFor(platform_id: string, platformStatus?: Record<string, string>): { cls: string; label: string } {
  const s = platformStatus?.[platform_id];
  if (s === 'CRITICAL_ANOMALY') return { cls: 'critical', label: 'CRITICAL' };
  if (s === 'WARNING') return { cls: 'warning', label: 'WARNING' };
  return { cls: 'nominal', label: 'NOMINAL' };
}

export default function FleetSidebar({
  profiles,
  buoys = [],
  gliders = [],
  platformStatus,
  selectedId,
  isOpen,
  railOpen = false,
  onToggle,
  onSelect,
}: FleetSidebarProps) {
  const [activeTab, setActiveTab] = useState<'argo' | 'buoys' | 'gliders'>('argo');

  // Group argo profiles by ocean basin
  const basins = useMemo(() => {
    const bob: ArgoProfileSummary[] = [];
    const arabian: ArgoProfileSummary[] = [];
    const equatorial: ArgoProfileSummary[] = [];

    profiles.forEach((p) => {
      if (p.latitude < 6.0) {
        equatorial.push(p);
      } else if (p.longitude >= 77.0) {
        bob.push(p);
      } else {
        arabian.push(p);
      }
    });

    return [
      { name: 'Bay of Bengal Basin', count: bob.length, list: bob },
      { name: 'Arabian Sea Basin', count: arabian.length, list: arabian },
      { name: 'Equatorial Indian Ocean', count: equatorial.length, list: equatorial },
    ];
  }, [profiles]);

  if (!isOpen) {
    return null;
  }

  const totalPlatforms = profiles.length + buoys.length + gliders.length;

  return (
    <div className={`fleet-sidebar ${railOpen ? 'with-layer-rail' : ''}`}>
      <div className="fleet-header">
        <div className="fleet-header-title">
          <Radio size={16} style={{ color: '#38bdf8' }} />
          <h4>INCOIS Sensor Network</h4>
          <span className="fleet-header-badge">{totalPlatforms} Platforms</span>
        </div>
        <button className="fleet-close-btn" onClick={onToggle} title="Close Fleet Drawer">
          ✕
        </button>
      </div>

      {/* Sensor Category Filter Tabs */}
      <div className="fleet-tabs" style={{ display: 'flex', borderBottom: '1px solid rgba(56, 189, 248, 0.2)', background: 'rgba(0, 0, 0, 0.2)' }}>
        <button
          className={`fleet-tab-btn ${activeTab === 'argo' ? 'active' : ''}`}
          onClick={() => setActiveTab('argo')}
          style={{
            flex: 1,
            padding: '8px 4px',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 600,
            background: activeTab === 'argo' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: activeTab === 'argo' ? '#38bdf8' : '#94a3b8',
            border: 'none',
            borderBottom: activeTab === 'argo' ? '2px solid #38bdf8' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          ARGO ({profiles.length})
        </button>
        <button
          className={`fleet-tab-btn ${activeTab === 'buoys' ? 'active' : ''}`}
          onClick={() => setActiveTab('buoys')}
          style={{
            flex: 1,
            padding: '8px 4px',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 600,
            background: activeTab === 'buoys' ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
            color: activeTab === 'buoys' ? '#fbbf24' : '#94a3b8',
            border: 'none',
            borderBottom: activeTab === 'buoys' ? '2px solid #fbbf24' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          BUOYS ({buoys.length})
        </button>
        <button
          className={`fleet-tab-btn ${activeTab === 'gliders' ? 'active' : ''}`}
          onClick={() => setActiveTab('gliders')}
          style={{
            flex: 1,
            padding: '8px 4px',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 600,
            background: activeTab === 'gliders' ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
            color: activeTab === 'gliders' ? '#34d399' : '#94a3b8',
            border: 'none',
            borderBottom: activeTab === 'gliders' ? '2px solid #34d399' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          GLIDER ({gliders.length})
        </button>
      </div>

      <div className="fleet-body">
        {/* Tab 1: Argo Profiles */}
        {activeTab === 'argo' && basins.map((basin) => (
          <div key={basin.name} className="basin-section">
            <div className="basin-title">
              {basin.name} ({basin.count})
            </div>
            {basin.list.map((p) => {
              const { cls: statusClass, label: statusLabel } = statusFor(p.platform_id, platformStatus);
              const isSelected = selectedId === p.id;

              return (
                <div
                  key={p.id}
                  className={`float-card ${statusClass} ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelect(p.id)}
                >
                  <div className="float-card-left">
                    <div className="float-card-id">
                      <span className={`float-status-dot ${statusClass}`} />
                      <span>#{p.platform_id}</span>
                    </div>
                    <span className="float-card-coords">
                      {p.latitude.toFixed(1)}°N, {p.longitude.toFixed(1)}°E
                    </span>
                  </div>

                  <div className="float-card-right">
                    <span className={`float-card-tag ${statusClass}`}>
                      {statusLabel}
                    </span>
                    <span className="float-card-depth">{p.max_depth}m sounding</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Tab 2: Moored Buoys — live positions from /api/observations/all */}
        {activeTab === 'buoys' && (
          <div className="basin-section">
            <div className="basin-title">Moored Surface & Subsurface Buoys ({buoys.length})</div>
            {buoys.map((b) => {
              const meta = PLATFORM_META[b.platform_id] ?? { name: b.platform_id, basin: '—', type: 'Moored Buoy' };
              const isSelected = selectedId === b.id;
              return (
                <div
                  key={b.id}
                  className={`float-card nominal ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelect(b.id)}
                >
                  <div className="float-card-left">
                    <div className="float-card-id">
                      <span className="float-status-dot nominal" />
                      <span>#{b.platform_id}</span>
                      <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '4px' }}>{meta.type}</span>
                    </div>
                    <span className="float-card-coords">
                      {b.latitude.toFixed(1)}°N, {b.longitude.toFixed(1)}°E • {meta.basin}
                    </span>
                  </div>

                  <div className="float-card-right">
                    <span className="float-card-tag nominal">
                      REPORTING
                    </span>
                    <span className="float-card-depth">{meta.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Gliders — live positions from /api/observations/all */}
        {activeTab === 'gliders' && (
          <div className="basin-section">
            <div className="basin-title">Underwater Autonomous Gliders ({gliders.length})</div>
            {gliders.map((g) => {
              const meta = PLATFORM_META[g.platform_id] ?? { name: g.platform_id, basin: '—', type: 'Ocean Glider' };
              const isSelected = selectedId === g.id;
              return (
                <div
                  key={g.id}
                  className={`float-card nominal ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelect(g.id)}
                >
                  <div className="float-card-left">
                    <div className="float-card-id">
                      <span className="float-status-dot nominal" />
                      <span>#{g.platform_id}</span>
                      <span style={{ fontSize: '9px', color: '#34d399', marginLeft: '4px' }}>Sawtooth</span>
                    </div>
                    <span className="float-card-coords">
                      {g.latitude.toFixed(1)}°N, {g.longitude.toFixed(1)}°E • {meta.name}
                    </span>
                  </div>

                  <div className="float-card-right">
                    <span className="float-card-tag nominal">
                      ACTIVE
                    </span>
                    <span className="float-card-depth">{meta.type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
