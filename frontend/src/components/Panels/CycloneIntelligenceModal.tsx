/**
 * CycloneIntelligenceModal — live cyclone watch + Argo-only RI backtests.
 *
 * Live: GDACS active storms, TCHP from the live ocean model along each
 * forecast track, and the same climatology-anomaly test used in backtests.
 * Backtests: real IBTrACS best tracks + real Argo profiles; the detector's
 * flag timing vs the storm's observed rapid-intensification onset, with a
 * leave-one-year-out false-alarm rate and a binomial significance test.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tornado, Radar, FlaskConical, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import {
  getActiveCyclones,
  getBacktests,
  getBacktest,
  getLiveWatch,
  type ActiveStormsResponse,
  type BacktestListResponse,
  type BacktestDetail,
  type LiveWatchResponse,
  type LiveStorm,
} from '../../services/intelApi';
import './CycloneIntelligenceModal.css';

type Tab = 'backtests' | 'live' | 'method';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Highlight a historical storm track on the globe and fly to it */
  onShowStorm: (sid: string | null, lat?: number, lon?: number) => void;
}

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toUTCString().replace(':00 GMT', ' UTC').slice(5) : '—';
const days = (h?: number | null) => (h == null ? '—' : `${(h / 24).toFixed(1)} d`);

/** SVG timeline: TCHP of each pre-storm Argo profile vs climatology, with genesis/RI markers. */
function BacktestChart({ d }: { d: BacktestDetail }) {
  const W = 640, H = 230, L = 46, Rr = 12, T = 14, B = 34;
  const tl = d.timeline ?? [];
  const clim = d.climatology;
  const t0 = new Date(d.method?.window?.start || tl[0]?.time || d.genesis_time).getTime();
  const t1 = new Date(d.ri?.onset_time && new Date(d.ri.onset_time) > new Date(d.peak_time) ? d.ri.onset_time : d.peak_time).getTime();
  const vals = tl.map((p) => p.tchp).concat(clim ? [clim.tchp_mean + 1.5 * clim.tchp_std, Math.max(0, clim.tchp_mean - 1.5 * clim.tchp_std)] : []).concat([50]);
  const yMax = Math.ceil((Math.max(...vals) + 10) / 10) * 10;
  const yMin = Math.max(0, Math.floor((Math.min(...vals) - 10) / 10) * 10);
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - Rr);
  const y = (v: number) => T + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (H - T - B);
  const ticksY = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const ticksX = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
  const vline = (iso: string | undefined | null, color: string, label: string, side: 'left' | 'right', row: number) => {
    if (!iso) return null;
    const xx = x(new Date(iso).getTime());
    return (
      <g>
        <line x1={xx} x2={xx} y1={T} y2={H - B} stroke={color} strokeDasharray="4 3" strokeWidth={1.5} />
        <text x={side === 'left' ? xx - 4 : xx + 4} y={T + 10 + row * 12} fill={color} fontSize={10} fontWeight={600}
          textAnchor={side === 'left' ? 'end' : 'start'}>{label}</text>
      </g>
    );
  };
  const sig = d.events?.first_significant_signal;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ci-chart" role="img" aria-label="TCHP of pre-storm Argo profiles over time">
      {clim && (
        <rect x={L} width={W - L - Rr} y={y(clim.tchp_mean + clim.tchp_std)}
          height={Math.max(0, y(clim.tchp_mean - clim.tchp_std) - y(clim.tchp_mean + clim.tchp_std))}
          fill="rgba(148,163,184,0.12)" />
      )}
      {ticksY.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.12)" />
          <text x={L - 6} y={y(v) + 3} fill="#94a3b8" fontSize={10} textAnchor="end">{v.toFixed(0)}</text>
        </g>
      ))}
      {ticksX.map((t) => (
        <text key={t} x={x(t)} y={H - B + 14} fill="#94a3b8" fontSize={10} textAnchor="middle">
          {new Date(t).toISOString().slice(5, 10)}
        </text>
      ))}
      <text x={12} y={T + (H - T - B) / 2} fill="#94a3b8" fontSize={10} transform={`rotate(-90 12 ${T + (H - T - B) / 2})`} textAnchor="middle">
        TCHP (kJ/cm²)
      </text>
      {clim && <line x1={L} x2={W - Rr} y1={y(clim.tchp_mean)} y2={y(clim.tchp_mean)} stroke="#94a3b8" strokeWidth={1.2} />}
      <line x1={L} x2={W - Rr} y1={y(50)} y2={y(50)} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="6 4" />
      <text x={W - Rr - 4} y={y(50) - 4} fill="#f59e0b" fontSize={10} textAnchor="end">50 kJ/cm² threshold</text>
      {clim && <text x={W - Rr - 4} y={y(clim.tchp_mean) - 4} fill="#94a3b8" fontSize={10} textAnchor="end">climatology mean ±1σ</text>}
      {vline(d.genesis_time, '#38bdf8', 'genesis', 'left', 0)}
      {vline(d.ri?.onset_time, '#f97316', 'RI onset', 'left', 1)}
      {tl.map((p) => (
        <circle key={p.profile_id ?? p.time + p.platform_id} cx={x(new Date(p.time).getTime())} cy={y(p.tchp)} r={p.ml_flag ? 5 : 3.5}
          fill={p.ml_flag ? '#ef4444' : 'rgba(226,232,240,0.75)'} stroke={p.ml_flag ? '#fecaca' : 'none'}>
          <title>{`${p.time.slice(0, 16)}Z · float ${p.platform_id} · TCHP ${p.tchp} · z=${p.z.tchp} · ${p.dist_to_track_km} km from track${p.ml_flag ? ' · FLAGGED' : ''}`}</title>
        </circle>
      ))}
      {sig && (
        <g>
          <circle cx={x(new Date(sig.time).getTime())} cy={y(sig.tchp)} r={9} fill="none" stroke="#22c55e" strokeWidth={2} />
          <text x={x(new Date(sig.time).getTime()) + 11} y={y(sig.tchp) + 4} fill="#22c55e" fontSize={10} fontWeight={700}>
            first significant (cumulative p={sig.p_value})
          </text>
        </g>
      )}
    </svg>
  );
}

/** Live-model TCHP along a storm's track (observed → forecast). */
function AlongTrackChart({ w }: { w: LiveWatchResponse }) {
  const pts = (w.tchp_along_track ?? []).filter((p) => p.tchp != null);
  if (pts.length < 2) return <div className="ci-muted">Track is outside the model domain (0–28°N, 60–100°E) or over land.</div>;
  const W = 640, H = 170, L = 46, R = 12, T = 12, B = 28;
  const yMax = Math.max(60, ...pts.map((p) => p.tchp as number)) + 10;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ci-chart">
      <line x1={L} x2={W - R} y1={y(50)} y2={y(50)} stroke="#f59e0b" strokeDasharray="6 4" />
      <polyline fill="none" stroke="#38bdf8" strokeWidth={2} points={pts.map((p, i) => `${x(i)},${y(p.tchp as number)}`).join(' ')} />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.tchp as number)} r={4} fill={p.forecast ? '#f472b6' : '#f43f5e'}>
          <title>{`${p.time} ${p.forecast ? '(forecast)' : '(observed)'} · TCHP ${p.tchp} kJ/cm² · D26 ${p.d26} m`}</title>
        </circle>
      ))}
      <text x={L} y={H - 8} fill="#94a3b8" fontSize={10}>observed track →</text>
      <text x={W - R} y={H - 8} fill="#f472b6" fontSize={10} textAnchor="end">forecast track</text>
    </svg>
  );
}

export const CycloneIntelligenceModal: React.FC<Props> = ({ isOpen, onClose, onShowStorm }) => {
  const [tab, setTab] = useState<Tab>('backtests');
  const [list, setList] = useState<BacktestListResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<BacktestDetail | null>(null);
  const [active, setActive] = useState<ActiveStormsResponse | null>(null);
  const [watch, setWatch] = useState<Record<number, LiveWatchResponse>>({});
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, modalRef);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    getBacktests()
      .then((r) => {
        setList(r);
        const best = r.backtests.find((b) => (b.significant_lead_time_hours ?? 0) > 0) ?? r.backtests[0];
        if (best) setSelectedKey((k) => k ?? best.key);
      })
      .catch((e) => setError(`Backtests unavailable: ${e.message}`));
    getActiveCyclones().then(setActive).catch((e) => setActive({ status: 'unavailable', error: e.message, checked_at: new Date().toISOString(), storms: [] }));
  }, [isOpen]);

  useEffect(() => {
    if (!selectedKey) return;
    setDetail(null);
    getBacktest(selectedKey)
      .then((d) => {
        setDetail(d);
        onShowStorm(d.storm.sid, d.ri?.lat ?? d.track?.[0]?.lat, d.ri?.lon ?? d.track?.[0]?.lon);
      })
      .catch((e) => setError(`Backtest ${selectedKey} failed: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // Poll live-watch jobs that are still computing
  useEffect(() => {
    const pending = Object.entries(watch).filter(([, w]) => w.status === 'computing').map(([id]) => Number(id));
    if (!pending.length) return;
    const t = setTimeout(() => {
      pending.forEach((id) => getLiveWatch(id).then((w) => setWatch((m) => ({ ...m, [id]: w }))).catch(() => {}));
    }, 8000);
    return () => clearTimeout(t);
  }, [watch]);

  const runWatch = (s: LiveStorm) => {
    setWatch((m) => ({ ...m, [s.event_id]: { status: 'computing', message: 'Starting…' } }));
    getLiveWatch(s.event_id)
      .then((w) => setWatch((m) => ({ ...m, [s.event_id]: w })))
      .catch((e) => setWatch((m) => ({ ...m, [s.event_id]: { status: 'not_found', message: e.message } })));
  };

  const sc = list?.scorecard;
  const nio = useMemo(() => (active?.storms ?? []).filter((s) => s.is_current && s.in_north_indian_ocean), [active]);
  const elsewhere = useMemo(() => (active?.storms ?? []).filter((s) => s.is_current && !s.in_north_indian_ocean), [active]);

  if (!isOpen) return null;

  return (
    <div className="ci-overlay" onClick={onClose}>
      <div ref={modalRef} className="ci-modal" role="dialog" aria-modal="true" aria-label="Cyclone Intelligence" tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        <div className="ci-header">
          <div>
            <span className="ci-badge"><Tornado size={12} /> CYCLONE INTELLIGENCE</span>
            <span className="ci-sub">Live GDACS · IBTrACS best tracks · Argo-only rapid-intensification backtests</span>
          </div>
          <button className="ci-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ci-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'backtests'} className={tab === 'backtests' ? 'active' : ''} onClick={() => setTab('backtests')}>
            <FlaskConical size={13} /> Historical backtests
          </button>
          <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
            <Radar size={13} /> Live watch {nio.length > 0 && <span className="ci-pill warn">{nio.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === 'method'} className={tab === 'method' ? 'active' : ''} onClick={() => setTab('method')}>
            Method & limits
          </button>
        </div>

        {error && <div className="ci-error"><AlertTriangle size={13} /> {error}</div>}

        {tab === 'backtests' && (
          <div className="ci-body">
            {sc && (
              <div className="ci-scorecard">
                <div className="ci-kpi"><span className="k">Storms tested</span><span className="v">{sc.storms_evaluated}</span></div>
                <div className="ci-kpi good"><span className="k">Significant early signals</span><span className="v">{sc.significant_early_signals} / {sc.storms_with_ri}</span></div>
                <div className="ci-kpi"><span className="k">Lead before RI</span><span className="v">{days(sc.median_significant_lead_hours)}</span></div>
                <div className="ci-kpi"><span className="k">False-alarm rate</span><span className="v">{sc.mean_false_alarm_rate != null ? `${(sc.mean_false_alarm_rate * 100).toFixed(1)}%` : '—'}</span></div>
                <div className="ci-kpi warn"><span className="k">Climatology ≥ 50 kJ/cm²</span><span className="v">{sc.mean_pct_clim_above_50 ?? '—'}%</span></div>
              </div>
            )}
            {sc && (
              <p className="ci-note">
                The fixed 50 kJ/cm² TCHP threshold is exceeded by {sc.mean_pct_clim_above_50}% of same-season climatological
                Argo profiles along these tracks, so on its own it cannot separate intensifying storms from ordinary pre-monsoon
                conditions. The detector instead asks whether the ocean ahead of the storm is <em>anomalous for that place and season</em>.
              </p>
            )}

            <div className="ci-storm-chips">
              {list?.backtests.map((b) => (
                <button key={b.key} className={`ci-chip ${selectedKey === b.key ? 'active' : ''} ${(b.significant_lead_time_hours ?? 0) > 0 ? 'hit' : ''}`}
                  onClick={() => setSelectedKey(b.key)}>
                  {b.name} {b.season}
                  <span className="ci-chip-sub">{(b.significant_lead_time_hours ?? 0) > 0 ? `signal ${days(b.significant_lead_time_hours)} early` : 'no significant signal'}</span>
                </button>
              ))}
            </div>

            {detail && detail.status !== 'ok' && <div className="ci-muted">{detail.message}</div>}
            {detail && detail.status === 'ok' && (
              <div className="ci-detail">
                <div className={`ci-verdict ${detail.storm_year?.signal_significant ? 'hit' : ''}`}>
                  <strong>{detail.verdict?.headline}</strong>
                  <span>{detail.verdict?.summary}</span>
                </div>
                <div className="ci-kpis">
                  <div className="ci-kpi"><span className="k">RI onset (IBTrACS)</span><span className="v sm">{fmtTime(detail.ri?.onset_time)}</span>
                    <span className="s">+{detail.ri?.delta_kt_24h} kt / 24 h → peak {detail.peak_wind_kt} kt</span></div>
                  <div className="ci-kpi good"><span className="k">Significant signal</span><span className="v">{days(detail.events?.significant_lead_time_hours_before_ri)}</span>
                    <span className="s">before RI</span></div>
                  <div className="ci-kpi"><span className="k">Flag rate vs clim.</span>
                    <span className="v sm">{((detail.storm_year?.flag_rate ?? 0) * 100).toFixed(0)}% vs {((detail.false_alarm?.weighted_flag_rate ?? 0) * 100).toFixed(0)}%</span>
                    <span className="s">binomial p = {detail.storm_year?.binomial_p_value_vs_climatology}</span></div>
                  <div className="ci-kpi"><span className="k">Corridor TCHP anomaly</span><span className="v">{detail.storm_year?.tchp_anomaly_vs_clim != null ? `${detail.storm_year.tchp_anomaly_vs_clim > 0 ? '+' : ''}${detail.storm_year.tchp_anomaly_vs_clim}` : '—'}</span>
                    <span className="s">kJ/cm² vs {detail.climatology?.tchp_mean} clim. mean</span></div>
                  <div className="ci-kpi"><span className="k">Evidence</span><span className="v sm">{detail.counts.storm_year_profiles_pre_storm_in_corridor} pre-storm profiles</span>
                    <span className="s">vs {detail.counts.climatology_profiles} climatology ({detail.counts.climatology_years_with_data} yrs)</span></div>
                </div>
                <BacktestChart d={detail} />
                <div className="ci-legend">
                  <span><i className="dot red" /> flagged by Isolation Forest (warm outlier)</span>
                  <span><i className="dot grey" /> not flagged</span>
                  <span><i className="line amber" /> 50 kJ/cm² threshold</span>
                  <span><i className="band" /> climatology mean ±1σ</span>
                </div>
                <button className="ci-btn" onClick={() => onShowStorm(detail.storm.sid, detail.ri?.lat, detail.ri?.lon)}>
                  <MapPin size={13} /> Show {detail.storm.name} track on globe
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'live' && (
          <div className="ci-body">
            {active?.status === 'unavailable' && <div className="ci-error">GDACS unreachable: {active.error}. No live storms shown.</div>}
            {active?.status === 'ok' && (
              <p className="ci-note">
                GDACS checked {fmtTime(active.checked_at)}: {active.n_active_global} active cyclones worldwide,
                {' '}{nio.length} in the North Indian Ocean.
              </p>
            )}
            {active?.status === 'ok' && nio.length === 0 && (
              <div className="ci-quiet">
                No active North Indian Ocean cyclone right now. The watch below runs on any active storm; for a validated
                example see the historical backtests.
              </div>
            )}
            {[...nio, ...elsewhere].map((s) => {
              const w = watch[s.event_id];
              return (
                <div key={s.event_id} className={`ci-storm ${s.in_north_indian_ocean ? 'nio' : ''}`}>
                  <div className="ci-storm-head">
                    <div>
                      <strong>{s.name}</strong> <span className={`ci-pill ${s.alert_level?.toLowerCase()}`}>{s.alert_level}</span>
                      <div className="ci-muted">{s.severity_text} · {s.countries || 'open ocean'} · since {fmtTime(s.from)}</div>
                    </div>
                    <div className="ci-storm-actions">
                      <button className="ci-btn ghost" onClick={() => onShowStorm(null, s.lat, s.lon)}><MapPin size={13} /> Globe</button>
                      <button className="ci-btn" onClick={() => runWatch(s)} disabled={w?.status === 'computing'}>
                        <RefreshCw size={13} className={w?.status === 'computing' ? 'spin' : ''} /> {w ? 'Refresh' : 'Run RI watch'}
                      </button>
                    </div>
                  </div>
                  {w && (
                    <div className="ci-watch">
                      {w.status === 'not_found' && <div className="ci-error">{w.message}</div>}
                      {w.tchp_along_track && (
                        <>
                          <div className="ci-muted">Live-model TCHP along the track ({w.model_source})
                            {w.max_tchp_ahead != null && <> — max ahead of storm <strong>{w.max_tchp_ahead} kJ/cm²</strong></>}</div>
                          <AlongTrackChart w={w} />
                        </>
                      )}
                      {w.status === 'computing' && <div className="ci-muted"><RefreshCw size={12} className="spin" /> {w.message}</div>}
                      {w.ocean_anomaly && w.ocean_anomaly.status === 'ok' && (
                        <div className={`ci-verdict ${w.ocean_anomaly.storm_year?.signal_significant ? 'hit' : ''}`}>
                          <strong>{w.ocean_anomaly.verdict?.headline}</strong><span>{w.ocean_anomaly.verdict?.summary}</span>
                        </div>
                      )}
                      {w.ocean_anomaly && w.ocean_anomaly.status !== 'ok' && <div className="ci-muted">{w.ocean_anomaly.message}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'method' && (
          <div className="ci-body ci-method">
            <h4>What is tested</h4>
            <p>Using only ocean observations available <em>before</em> each storm, would an anomaly detector have flagged the
              upper ocean along the future track as unusually warm, and how early relative to the observed rapid-intensification
              (RI) onset?</p>
            <h4>Data (all real, all public)</h4>
            <ul>
              <li><b>Tracks & RI:</b> IBTrACS v04r01 (NOAA NCEI). RI = first ≥ 30 kt rise in 1-min max wind within 24 h (Kaplan & DeMaria 2003).</li>
              <li><b>Ocean:</b> Argo GDAC profiles via Ifremer ERDDAP — QC flags 1/2 only, adjusted values for delayed-mode data, Saunders (1981) pressure→depth.</li>
              <li><b>Live:</b> GDACS tracks + HYCOM ESPC-D-V02 (or CMEMS) model TCHP along the forecast track.</li>
            </ul>
            <h4>Detector</h4>
            <ul>
              <li>Features per profile: SST, T at 100 m, D26, TCHP, mean T 0–100 m (no gap filling).</li>
              <li>Climatology: same 400 km track corridor, same calendar window, previous 8 years.</li>
              <li>Isolation Forest (contamination 0.10) fit on standardized climatology; flag = outlier <em>and</em> warm-side (z ≥ +1 in TCHP or T0–100).</li>
              <li>Only profiles sampled before the storm reached their nearest track point are scored (no cold-wake leakage).</li>
              <li>A single flag is expected by chance when ~30 profiles are scored, so a signal counts only when the flag rate exceeds the leave-one-year-out climatological rate (one-sided binomial, p &lt; 0.05, ≥ 2 flags).</li>
            </ul>
            <h4>Known limits</h4>
            <ul>
              <li>RI also depends on vertical wind shear, mid-level humidity and inner-core dynamics, which this ocean-only detector does not see; a quiet detector is not a forecast of no RI.</li>
              <li>Argo sampling is sparse (15–65 pre-storm profiles per storm); results are case studies, not a skill score.</li>
              <li>Features, corridor, climatology window and flag rule were fixed before any storm was evaluated and applied identically to all five. The binomial significance test was added after the first results to guard against chance flags; it can only remove claimed signals, never add them.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CycloneIntelligenceModal;
