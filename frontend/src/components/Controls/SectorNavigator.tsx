/**
 * SectorNavigator — Tactical Quick-Jump Camera Dropdown Selector.
 * Compact dropdown allowing instant framing of Arabian Sea, Bay of Bengal, All India, or Anomaly Floats
 * without expanding horizontally across the top bar.
 */
import { useState, useRef, useEffect } from 'react';
import { SECTOR_PRESETS, type SectorId } from '../../utils/coordinates';
import './SectorNavigator.css';

interface SectorNavigatorProps {
  currentSector: SectorId;
  onSelectSector: (sectorId: SectorId) => void;
}

export default function SectorNavigator({
  currentSector,
  onSelectSector,
}: SectorNavigatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectors = Object.values(SECTOR_PRESETS);
  const selected = SECTOR_PRESETS[currentSector] || SECTOR_PRESETS.all_india;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  return (
    <div className="sector-navigator-dropdown" ref={containerRef}>
      <button
        className={`sector-trigger-btn ${currentSector === 'anomaly_target' ? 'anomaly' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Quick-jump camera to Indian Ocean Basins (Keys 1-5)"
      >
        <span className="sector-icon">{selected.icon}</span>
        <span className="sector-selected-label">{selected.label}</span>
        <span className="sector-caret">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="sector-menu">
          {sectors.map((s, idx) => (
            <button
              key={s.id}
              className={`sector-menu-item ${currentSector === s.id ? 'active' : ''} ${
                s.id === 'anomaly_target' ? 'anomaly-item' : ''
              }`}
              onClick={() => {
                onSelectSector(s.id);
                setIsOpen(false);
              }}
            >
              <span className="item-num">{idx + 1}</span>
              <span className="item-icon">{s.icon}</span>
              <div className="item-text-group">
                <span className="item-label">{s.label}</span>
                <span className="item-desc">{s.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
