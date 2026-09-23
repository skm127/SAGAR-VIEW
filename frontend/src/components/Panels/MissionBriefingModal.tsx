/**
 * MissionBriefingModal — Executive Overview & Guided Explainer.
 * Makes the entire platform immediately understandable to anyone (judges, evaluators, oceanographers).
 */
import { useRef } from 'react';
import { Globe2, Radio, Cpu, Navigation, Compass, AlertTriangle, CheckCircle2, Shield } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import './MissionBriefingModal.css';

interface MissionBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToAnomaly: () => void;
  /** platform_id of the fleet's top anomaly, from the live summary. */
  anomalyFloatId?: string | null;
  /** critical + warning count from the live fleet summary. */
  anomalyCount?: number;
}

export default function MissionBriefingModal({
  isOpen,
  onClose,
  onJumpToAnomaly,
  anomalyFloatId,
  anomalyCount,
}: MissionBriefingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useModalA11y(isOpen, onClose, modalRef);

  if (!isOpen) return null;

  return (
    <div className="briefing-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="briefing-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Mission Briefing: Model vs Reality Ocean Intelligence"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="briefing-header">
          <div className="briefing-header-left">
            <span className="briefing-badge">INCOIS // SIH 2026 PS26067</span>
            <h2>SAGAR VIEW COMMAND & CONTROL // MISSION BRIEFING</h2>
          </div>
          <button className="briefing-close-btn" onClick={onClose} title="Close Briefing">
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="briefing-body">
          {/* Executive Summary */}
          <div className="briefing-card highlight-card">
            <h3><Compass size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />The Mission: Model vs Reality Ocean Intelligence</h3>
            <p>
              Under <strong>Smart India Hackathon 2026 (Problem PS26067 — Ministry of Earth Sciences / INCOIS)</strong>, 
              operational ocean models (this platform ingests the <strong>HYCOM ESPC-D-V02</strong> analysis/forecast live, or <strong>CMEMS</strong> with credentials) forecast water temperatures, salinity, and currents across India's maritime domain. 
              However, ocean models frequently miscalculate subsurface mixing, missing dangerous trapped heat pools. 
              <strong> SAGAR VIEW</strong> automatically compares model predictions against in-situ robotic <strong>Argo profiling floats</strong>, 
              using machine learning to detect anomalies before they fuel severe tropical cyclones.
            </p>
          </div>

          {/* 3 Core Pillars */}
          <div className="briefing-grid-3">
            <div className="briefing-pillar">
              <div className="pillar-icon"><Globe2 size={20} /></div>
              <h4>1. Live Numerical Model</h4>
              <p>
                Daily analysis + forecast fields (0–500 m, 28 levels, 0.25° grid) over the Arabian Sea, Bay of Bengal and Equatorial Indian Ocean (0–28°N, 60–100°E), refreshed every 6 hours.
              </p>
            </div>
            <div className="briefing-pillar">
              <div className="pillar-icon"><Radio size={20} /></div>
              <h4>2. In-Situ Argo Fleet</h4>
              <p>
                Autonomous robotic buoys that drift with deep currents, diving down to 2,000m and surfacing every 10 days to transmit empirical ground-truth soundings.
              </p>
            </div>
            <div className="briefing-pillar">
              <div className="pillar-icon"><Cpu size={20} /></div>
              <h4>3. AI Anomaly Detection</h4>
              <p>
                An <strong>Isolation Forest</strong> algorithm analyzes multi-depth vertical divergence, thermocline gradient drift, and heat anomalies to identify operational risks.
              </p>
            </div>
          </div>

          {/* Anomaly Science Deep Dive */}
          <div className="briefing-card">
            <h3><AlertTriangle size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />Why Anomaly Detection Matters: Subsurface Marine Heatwaves</h3>
            <p>
              In tropical waters like the Bay of Bengal, freshwater river runoff creates a thin surface "barrier layer". 
              Sunlight penetrates below this layer, trapping heat in the thermocline (roughly <strong>50–200 m</strong>) — exactly the depth band where the live model's error against Argo is largest (see Model Trust). 
              Because standard satellites only measure the surface skin (SST), this subsurface heat remains invisible to conventional forecasting — yet it acts as 
              <strong> high-octane rocket fuel for rapid cyclone intensification</strong>. SAGAR VIEW measures where the model misses it and flags anomalous profiles.
            </p>
          </div>

          {/* 60-Second Guided Demo */}
          <div className="briefing-card demo-card">
            <h3><CheckCircle2 size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />60-Second Evaluation Walkthrough</h3>
            <div className="demo-steps">
              <div className="demo-step">
                <span className="step-num">1</span>
                <div>
                  <strong>Explore the 3D Ocean:</strong> Use <code>[ All India ]</code>, <code>[ Arabian Sea ]</code>, or <code>[ Bay of Bengal ]</code> to surveil regional basins.
                </div>
              </div>
              <div className="demo-step">
                <span className="step-num">2</span>
                <div>
                  <strong>Inspect Forecast Evolution:</strong> Press <code>Play (▶)</code> on the bottom timeline to watch the 4D ocean circulation evolve over 7 forecast days.
                </div>
              </div>
              <div className="demo-step">
                <span className="step-num">3</span>
                <div>
                  <strong>Spot the Anomaly:</strong> Click the pulsing red <code>[ {anomalyCount ?? '?'} ANOMALIES ]</code> badge or press <code>4</code> to fly directly to Float <code>#{anomalyFloatId ?? '—'}</code>.
                </div>
              </div>
              <div className="demo-step">
                <span className="step-num">4</span>
                <div>
                  <strong>Analyze Model vs Reality:</strong> In the comparison drawer, examine the inverted depth profile. Compare observed (amber) and model (cyan) temperature with depth; the depth and size of the largest divergence are shown in the panel.
                </div>
              </div>
              <div className="demo-step">
                <span className="step-num">5</span>
                <div>
                  <strong>Probe Any Ocean Coordinate:</strong> Click anywhere on the open ocean surface to drop a 3D tactical sounding reticle and examine local depth profiles.
                </div>
              </div>
              <div className="demo-step">
                <span className="step-num">6</span>
                <div>
                  <strong>Export Official Reports:</strong> Download the complete INCOIS analysis dossier as formatted JSON or profile CSV for downstream operational assimilation.
                </div>
              </div>
            </div>
          </div>

          {/* Safety & Operational Architecture */}
          <div className="briefing-card safety-card">
            <h3><Shield size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />Reliability & Safety Architecture</h3>
            <p>
              <strong>Evaluation-Safe:</strong> To prevent network dropouts or institutional API rate limits during live hackathon demonstrations, 
              SAGAR VIEW packages certified, CF-1.8 compliant NetCDF4 datasets locally. 
              The backend ingestion engine uses standard scientific <code>xarray</code> pipelines that can plug directly into live 
              <strong> Copernicus Marine (CMEMS)</strong> and <strong>INCOIS OpenDAP/ERDDAP</strong> streams with zero code changes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="briefing-footer">
          <button
            className="btn-jump-anomaly"
            onClick={() => {
              onClose();
              onJumpToAnomaly();
            }}
          >
            <Navigation size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Jump to Active Marine Heatwave{anomalyFloatId ? ` (#${anomalyFloatId})` : ''}
          </button>
          <button className="btn-close-briefing" onClick={onClose}>
            Close Briefing & Enter C2 Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
