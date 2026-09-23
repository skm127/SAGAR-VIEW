/**
 * GlobalSearchModal.tsx
 * Instant spatial lookup for regions, platforms, anomalies, and coordinates.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import useModalA11y from '../../hooks/useModalA11y';
import type { ArgoProfileSummary } from '../../types';
import './GlobalSearchModal.css';


interface GlobalSearchModalProps {
  isOpen: boolean;
  argoProfiles: ArgoProfileSummary[];
  /** Highest-severity float from the live fleet analysis (drives the ANOMALY result). */
  topAnomaly?: { platform_id: string; latitude: number; longitude: number; max_delta: number } | null;
  onClose: () => void;
  onSelectCoordinate: (lat: number, lon: number, label?: string) => void;
  onSelectArgo: (id: string) => void;
  onSelectSector: (sectorId: any) => void;
}

const REGION_SEARCH_ITEMS = [
  { id: 'bay_of_bengal', title: 'Bay of Bengal Basin', category: 'REGION', lat: 14.5, lon: 87.2, desc: 'Central Bay of Bengal, model grid' },
  { id: 'arabian_sea', title: 'Arabian Sea Basin', category: 'REGION', lat: 16.0, lon: 68.0, desc: 'Somali/Oman Upwelling Zone' },
  { id: 'equatorial', title: 'Equatorial Indian Ocean', category: 'REGION', lat: 2.0, lon: 80.0, desc: 'Wyrtki Jets & Kelvin Waves' },
  { id: 'andaman_sea', title: 'Andaman & Nicobar Basin', category: 'REGION', lat: 11.5, lon: 93.2, desc: 'Deep trench & internal solitary waves' },
  { id: 'odisha_coast', title: 'Odisha Coastal Zone', category: 'REGION', lat: 19.5, lon: 86.5, desc: 'Mahanadi runoff & cyclone landfall alley' },
  { id: 'laccadive', title: 'Lakshadweep / Laccadive Sea', category: 'REGION', lat: 10.5, lon: 73.0, desc: 'Arabian high-salinity core' },
];

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  argoProfiles,
  topAnomaly,
  onClose,
  onSelectCoordinate,
  onSelectArgo,
  onSelectSector,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useModalA11y(isOpen, onClose, cardRef);

  useEffect(() => {

    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Build searchable items
  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{
      id: string;
      title: string;
      category: 'REGION' | 'PLATFORM' | 'ANOMALY' | 'COORDINATE';
      sub: string;
      action: () => void;
    }> = [];

    // Check if query is a coordinate like "14.5, 85.2" or "14N, 85E"
    const coordMatch = q.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        list.push({
          id: 'custom_coord',
          title: `Coordinate Probe: ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
          category: 'COORDINATE',
          sub: 'Jump to exact geographic location and drop depth sounding probe',
          action: () => {
            onSelectCoordinate(lat, lon, `Probe ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
            onClose();
          },
        });
      }
    }

    // Search anomalies — driven by the LIVE fleet analysis, not a hardcoded demo float.
    const anomalyKeywords = 'critical anomaly heatwave';
    const anomalyHit =
      (topAnomaly &&
        (anomalyKeywords.includes(q) ||
          q.includes('heatwave') ||
          q.includes('anomaly') ||
          q.includes('critical') ||
          topAnomaly.platform_id.includes(q))) ||
      false;
    if (anomalyHit && topAnomaly) {
      list.push({
        id: `anomaly_${topAnomaly.platform_id}`,
        title: `Top Fleet Anomaly (Float #${topAnomaly.platform_id}, +${topAnomaly.max_delta.toFixed(1)}°C)`,
        category: 'ANOMALY',
        sub: `Argo #${topAnomaly.platform_id} (${topAnomaly.latitude.toFixed(1)}°N, ${topAnomaly.longitude.toFixed(1)}°E) — live fleet analysis`,
        action: () => {
          onSelectSector('anomaly_target');
          onClose();
        },
      });
    }

    // Search regions
    REGION_SEARCH_ITEMS.forEach((r) => {
      if (!q || r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)) {
        list.push({
          id: r.id,
          title: r.title,
          category: 'REGION',
          sub: r.desc,
          action: () => {
            onSelectCoordinate(r.lat, r.lon, r.title);
            onClose();
          },
        });
      }
    });

    // Search Argo floats
    argoProfiles.forEach((p) => {
      const pTitle = `Argo Float #${p.platform_id}`;
      const pSub = `In-situ CTD float at ${p.latitude.toFixed(1)}°N, ${p.longitude.toFixed(1)}°E (Max ${p.max_depth}m)`;
      if (!q || pTitle.toLowerCase().includes(q) || p.platform_id.includes(q)) {
        list.push({
          id: p.id,
          title: pTitle,
          category: 'PLATFORM',
          sub: pSub,
          action: () => {
            onSelectArgo(p.id);
            onClose();
          },
        });
      }
    });

    return list.slice(0, 10);
  }, [query, argoProfiles, topAnomaly, onSelectCoordinate, onSelectArgo, onSelectSector, onClose]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        results[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="search-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Global Ocean Spatial Search"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-input-box">
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search region, platform, anomaly, or coordinate (e.g. 14.5, 87.2)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <span className="search-esc-tag">ESC</span>
        </div>

        <div className="search-results-list">
          {results.length === 0 ? (
            <div className="search-empty">No ocean platforms or sectors matching "{query}"</div>
          ) : (
            results.map((item, idx) => (
              <div
                key={item.id}
                className={`search-result-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="result-main">
                  <span className="result-title">{item.title}</span>
                  <span className="result-sub">{item.sub}</span>
                </div>
                <span className={`result-cat-badge ${item.category.toLowerCase()}`}>
                  {item.category}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="search-footer">
          <span>
            Navigate <kbd>↑</kbd> <kbd>↓</kbd>
          </span>
          <span>
            Select <kbd>↵</kbd>
          </span>
          <span>
            Close <kbd>ESC</kbd>
          </span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
