import React, { useEffect, useRef, useState } from 'react';
import { Database, Grid, FileCode2, Radio, Cpu } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import { getDataStatus, type DataStatusResponse } from '../../services/intelApi';
import './DataManagerModal.css';

interface DataManagerModalProps {
  onClose: () => void;
}


const VARIABLES = [
  { name: 'thetao', longName: 'Sea Water Temperature', unit: '°C', dims: '(time, depth, lat, lon)', standard: 'sea_water_temperature' },
  { name: 'so', longName: 'Sea Water Salinity', unit: 'PSU', dims: '(time, depth, lat, lon)', standard: 'sea_water_salinity' },
  { name: 'uo', longName: 'Eastward Sea Water Velocity', unit: 'm/s', dims: '(time, depth, lat, lon)', standard: 'eastward_sea_water_velocity' },
  { name: 'vo', longName: 'Northward Sea Water Velocity', unit: 'm/s', dims: '(time, depth, lat, lon)', standard: 'northward_sea_water_velocity' },
];

const PIPELINE_STAGES = [
  { stage: 'Model ingestion', status: 'complete', detail: 'HYCOM ESPC-D-V02 via THREDDS NCSS (or CMEMS with credentials), regridded to 0.25°, atomic file swap + hot reload every 6 h' },
  { stage: 'Argo QC filtering', status: 'complete', detail: 'Argo GDAC via ERDDAP: position/time/level QC 1–2 only, adjusted values for A/D mode, Saunders pressure→depth' },
  { stage: 'Space–time co-location', status: 'complete', detail: 'Bilinear interpolation to float position, nearest analysis step within ±36 h' },
  { stage: 'Isolation Forest', status: 'complete', detail: 'Refit on the live fleet\'s obs-minus-model residual features after each refresh' },
  { stage: 'Float32 slice stream', status: 'live', detail: 'Binary depth slices + OGC WMS (GetMap / GetFeatureInfo) at /ogc/wms' },
];

const utc = (iso?: string | null) => (iso ? `${new Date(iso).toUTCString().slice(5, 22)} UTC` : '—');

export const DataManagerModal: React.FC<DataManagerModalProps> = ({ onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useModalA11y(true, onClose, modalRef);
  const [status, setStatus] = useState<DataStatusResponse | null>(null);
  useEffect(() => { getDataStatus().then(setStatus).catch(() => {}); }, []);
  const m = status?.model;
  const a = status?.argo;
  const depths = m?.depth_levels ?? [];
  const roles = m?.time_roles ?? [];
  const gridInfo: Record<string, string> = {
    model: m?.source_provenance ?? '—',
    nativeResolution: m?.native_resolution ?? '—',
    servedGrid: m?.dimensions ? `${m.dimensions.lat} × ${m.dimensions.lon} (0.25°)` : '—',
    domain: m?.lat_range && m?.lon_range ? `${m.lat_range[0]}°N–${m.lat_range[1]}°N, ${m.lon_range[0]}°E–${m.lon_range[1]}°E` : '—',
    depthLevels: depths.length ? `${depths.length} levels (${depths[0]} m – ${depths[depths.length - 1]} m)` : '—',
    timeSteps: roles.length ? `${roles.filter((r) => r === 'analysis').length} analysis + ${roles.filter((r) => r === 'forecast').length} forecast (daily)` : '—',
    retrieved: utc(m?.retrieved_at),
    format: 'NetCDF-4 (zlib), CF-1.8',
  };
  const sensors = [
    { id: 'ARGO', type: 'Argo Profiling Floats (GDAC)', status: a?.n_unique_floats ? 'operational' : 'offline',
      detail: a ? `${a.n_unique_floats} floats · ${a.n_argo_profiles} QC'd profiles` : 'loading…', lastSync: a?.ingested_at },
    { id: 'MOORINGS', type: 'RAMA / OMNI Moored Buoys', status: status?.moored_buoys?.status === 'live' ? 'operational' : 'offline', detail: status?.moored_buoys?.status === 'live' ? `${a?.n_moored_buoys || 'Live'} buoys (${status.moored_buoys.source})` : 'Not connected — no public live feed', lastSync: a?.ingested_at },
    { id: 'GLIDERS', type: 'Underwater Gliders', status: 'offline', detail: 'Not connected — no public live feed', lastSync: null },
  ];

  return (
    <div className="dm-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="dm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Data Manager and Metadata Inspector"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >

        <div className="dm-header">
          <div className="dm-title-group">
            <span className="dm-badge">
              <Database size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              DATA MANAGER & METADATA INSPECTOR
            </span>
            <span className="dm-sub">CF-1.8 NetCDF Metadata, Sensor Registry & Ingestion Pipeline Health</span>
          </div>
          <button className="dm-close" onClick={onClose} title="Close Data Manager">✕</button>
        </div>

        <div className="dm-body">
          {/* Grid Specification */}
          <section className="dm-section">
            <h4 className="dm-section-title">
              <Grid size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              CF-1.8 Grid Specification & Extents
            </h4>
            <div className="dm-grid-info">
              {Object.entries(gridInfo).map(([key, val]) => (
                <div key={key} className="dm-grid-row">
                  <span className="dm-grid-key">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                  </span>
                  <span className="dm-grid-val">{val}</span>
                </div>
              ))}
            </div>
          </section>

          {/* CF Variables */}
          <section className="dm-section">
            <h4 className="dm-section-title">
              <FileCode2 size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              NetCDF CF Variables & Coordinate Axes
            </h4>
            <table className="dm-var-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Standard Name</th>
                  <th>Unit</th>
                  <th>Dimensions</th>
                </tr>
              </thead>
              <tbody>
                {VARIABLES.map((v) => (
                  <tr key={v.name}>
                    <td className="dm-var-name">{v.name}</td>
                    <td>{v.standard}</td>
                    <td><span className="dm-unit-badge">{v.unit}</span></td>
                    <td className="dm-var-dims">{v.dims}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Sensor Registry */}
          <section className="dm-section">
            <h4 className="dm-section-title">
              <Radio size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              In-Situ Feed Registry (live status)
            </h4>
            <div className="dm-sensor-grid">
              {sensors.map((sn) => (
                <div key={sn.id} className={`dm-sensor-card ${sn.status}`}>
                  <div className="dm-sensor-top">
                    <span className="dm-sensor-type">{sn.type}</span>
                    <span className={`dm-sensor-status ${sn.status}`}>
                      {sn.status === 'operational' ? '● LIVE' : '○ NOT CONNECTED'}
                    </span>
                  </div>
                  <div className="dm-sensor-bottom">
                    <span>{sn.detail}</span>
                    <span className="dm-sensor-sync">Ingested: {utc(sn.lastSync)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Ingestion Pipeline */}
          <section className="dm-section">
            <h4 className="dm-section-title">
              <Cpu size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Data Pipeline Processing Stages
            </h4>
            <div className="dm-pipeline">
              {PIPELINE_STAGES.map((p, i) => (
                <div key={p.stage} className={`dm-pipe-stage ${p.status}`}>
                  <div className="dm-pipe-num">{i + 1}</div>
                  <div className="dm-pipe-content">
                    <span className="dm-pipe-name">{p.stage}</span>
                    <span className="dm-pipe-detail">{p.detail}</span>
                  </div>
                  <span className={`dm-pipe-badge ${p.status}`}>
                    {p.status === 'complete' ? '✓ READY' : '◉ STREAMING'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DataManagerModal;
