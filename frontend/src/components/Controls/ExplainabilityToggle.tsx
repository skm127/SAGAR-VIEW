/**
 * ExplainabilityToggle.tsx
 * Dual-Lens Scientific Workstation Mode Switch:
 * - [ Explorer View ]: Actionable natural-language interpretation for coastal stakeholders
 * - [ Scientific View ]: Quantitative isopycnal gradients, integrals, and ML anomaly parameters
 */
import React from 'react';
import './ExplainabilityToggle.css';

export type ExplainMode = 'citizen' | 'scientist';

interface ExplainabilityToggleProps {
  mode: ExplainMode;
  onChange: (mode: ExplainMode) => void;
}

export const ExplainabilityToggle: React.FC<ExplainabilityToggleProps> = ({ mode, onChange }) => {
  return (
    <div className="explain-toggle-container">
      <div className="explain-toggle-track">
        <button
          className={`explain-toggle-btn citizen ${mode === 'citizen' ? 'active' : ''}`}
          onClick={() => onChange('citizen')}
          title="Explorer View: Qualitative oceanographic summaries for coastal managers and students"
        >
          <span className="mode-dot citizen" />
          <span className="mode-label">Explorer</span>
        </button>

        <button
          className={`explain-toggle-btn scientist ${mode === 'scientist' ? 'active' : ''}`}
          onClick={() => onChange('scientist')}
          title="Scientific View: Quantitative isopycnal gradients, residuals, and Isolation Forest ML parameters"
        >
          <span className="mode-dot scientist" />
          <span className="mode-label">Scientific</span>
        </button>
      </div>
    </div>
  );
};

export default ExplainabilityToggle;
