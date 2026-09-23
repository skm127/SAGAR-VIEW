/**
 * DataSourceBadge.tsx
 * Transparent data-provenance indicator driven by /api/data/status:
 * shows the exact model product, its valid time, and the real Argo counts
 * (profiles, floats, QC-passed/rejected levels). There is no simulated mode —
 * if the API is unreachable the badge says OFFLINE and shows nothing else.
 */
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getDataStatus, type DataStatusResponse } from '../../services/intelApi';
import './DataSourceBadge.css';

function ago(iso?: string | null): string {
  if (!iso) return '—';
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  if (!Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${h.toFixed(1)} h ago`;
  return `${(h / 24).toFixed(1)} d ago`;
}

export const DataSourceBadge: React.FC = () => {
  const [status, setStatus] = useState<DataStatusResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getDataStatus()
        .then((s) => { if (alive) { setStatus(s); setOffline(false); } })
        .catch(() => { if (alive) setOffline(true); });
    load();
    const id = setInterval(load, 120000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const model = status?.model;
  const argo = status?.argo;
  const live = !offline && !!model?.variables && !model?.is_synthetic;
  const shortModel = model?.source_provenance?.split(' (')[0] ?? 'model';
  const analysisSteps = model?.time_roles?.filter((r) => r === 'analysis').length ?? 0;
  const forecastSteps = model?.time_roles?.filter((r) => r === 'forecast').length ?? 0;

  return (
    <div className="data-source-wrapper">
      <button
        className={`data-source-badge ${live ? 'live' : 'demo'}`}
        onClick={() => setMenuOpen(!menuOpen)}
        title="Click to inspect the exact data sources behind every number on screen"
      >
        <span className={`source-dot ${live ? 'live' : 'demo'}`}>{live ? '●' : '◆'}</span>
        <span className="source-label">
          {offline ? 'API OFFLINE' : live ? `LIVE · ${argo?.n_unique_floats ?? 0} ARGO FLOATS` : 'LOADING DATA…'}
        </span>
      </button>

      {menuOpen && (
        <div className="data-source-popover" onClick={(e) => e.stopPropagation()}>
          <div className="popover-header">
            <span>DATA PROVENANCE</span>
            <button className="popover-close" onClick={() => setMenuOpen(false)} aria-label="Close">
              <X size={12} />
            </button>
          </div>
          {offline ? (
            <div className="popover-status">
              <div className="status-row"><span className="status-k">Backend:</span><span className="status-v demo">Unreachable — no data shown</span></div>
            </div>
          ) : (
            <div className="popover-status">
              <div className="status-row">
                <span className="status-k">Ocean model:</span>
                <span className="status-v">{shortModel}</span>
              </div>
              <div className="status-row">
                <span className="status-k">Retrieved:</span>
                <span className="status-v">{ago(model?.retrieved_at ?? model?.loaded_at)}</span>
              </div>
              <div className="status-row">
                <span className="status-k">Time steps:</span>
                <span className="status-v">{analysisSteps} analysis + {forecastSteps} forecast days · {model?.depth_levels?.length ?? 0} depths ≤ 500 m</span>
              </div>
              <div className="status-row">
                <span className="status-k">Argo (GDAC):</span>
                <span className="status-v">{argo?.n_argo_profiles ?? 0} QC'd profiles · {argo?.n_unique_floats ?? 0} floats</span>
              </div>
              <div className="status-row">
                <span className="status-k">QC levels:</span>
                <span className="status-v">
                  {(argo?.levels_qc_passed ?? 0).toLocaleString()} kept · {(argo?.levels_qc_rejected ?? 0).toLocaleString()} rejected
                </span>
              </div>
              <div className="status-row">
                <span className="status-k">Argo ingested:</span>
                <span className="status-v">{ago(argo?.ingested_at)}</span>
              </div>
              <div className="status-row">
                <span className="status-k">Anomaly ML:</span>
                <span className="status-v">
                  {status?.anomaly_model.training_source === 'live_fleet_residuals'
                    ? `Isolation Forest fit on ${status.anomaly_model.n_training_profiles} real residual profiles`
                    : 'Isolation Forest (synthetic prior — awaiting live fit)'}
                </span>
              </div>
              <div className="status-row">
                <span className="status-k">Moorings / gliders:</span>
                <span className="status-v">Not connected (no public live feed)</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataSourceBadge;
