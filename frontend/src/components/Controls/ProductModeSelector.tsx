/**
 * ProductModeSelector.tsx
 * Mode switcher for the top bar.
 */
import React from 'react';
import { FlaskConical, ShieldAlert, BarChart3, GraduationCap, Database } from 'lucide-react';
import './ProductModeSelector.css';

export type ProductMode = 'research' | 'operational' | 'sounding' | 'learn' | 'datamanager';

interface ProductModeSelectorProps {
  currentMode: ProductMode;
  onSelectMode: (mode: ProductMode) => void;
}

export const ProductModeSelector: React.FC<ProductModeSelectorProps> = ({
  currentMode,
  onSelectMode,
}) => {
  return (
    <div className="product-mode-container">
      <div className="product-mode-track">
        <button
          className={`product-mode-btn ${currentMode === 'research' ? 'active' : ''}`}
          onClick={() => onSelectMode('research')}
          title="Research Mode"
        >
          <FlaskConical size={13} />
          <span className="mode-text">Research</span>
        </button>

        <button
          className={`product-mode-btn ${currentMode === 'operational' ? 'active' : ''}`}
          onClick={() => onSelectMode('operational')}
          title="Situation Room"
        >
          <ShieldAlert size={13} />
          <span className="mode-text">Situation Room</span>
        </button>

        <button
          className={`product-mode-btn ${currentMode === 'sounding' ? 'active' : ''}`}
          onClick={() => onSelectMode('sounding')}
          title="Sounding Studio"
        >
          <BarChart3 size={13} />
          <span className="mode-text">Sounding Studio</span>
        </button>

        <button
          className={`product-mode-btn ${currentMode === 'learn' ? 'active' : ''}`}
          onClick={() => onSelectMode('learn')}
          title="Learn Mode"
        >
          <GraduationCap size={13} />
          <span className="mode-text">Learn</span>
        </button>

        <button
          className={`product-mode-btn ${currentMode === 'datamanager' ? 'active' : ''}`}
          onClick={() => onSelectMode('datamanager')}
          title="Data Manager"
        >
          <Database size={13} />
          <span className="mode-text">Data Manager</span>
        </button>
      </div>
    </div>
  );
};

export default ProductModeSelector;
