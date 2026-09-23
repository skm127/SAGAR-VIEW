import React, { useRef, useState } from 'react';
import { X, CloudRain, Maximize2, Minimize2 } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';
import './WeatherForecastModal.css';

interface WeatherForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  lat?: number;
  lon?: number;
}

export const WeatherForecastModal: React.FC<WeatherForecastModalProps> = ({
  isOpen,
  onClose,
  lat = 22.2,
  lon = 83.8,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useModalA11y(isOpen, onClose, modalRef);

  if (!isOpen) return null;

  return (
    <div className="forecast-overlay">
      <div 
        ref={modalRef}
        className={`forecast-modal ${isExpanded ? 'expanded' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forecast-modal-title"
      >
        <div className="forecast-header">
          <div className="forecast-header-left">
            <CloudRain size={16} className="forecast-icon" />
            <h2 id="forecast-modal-title">Live Weather Forecast (ECMWF)</h2>
            <div className="live-pulse">
              <div className="pulse-dot"></div>
              <span>LIVE</span>
            </div>
          </div>
          <div className="forecast-header-actions">
            <button 
              className="forecast-action-btn" 
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Collapse" : "Expand"}
              aria-label={isExpanded ? "Collapse modal" : "Expand modal"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button 
              className="forecast-action-btn close" 
              onClick={onClose}
              title="Close"
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="forecast-content">
          <div className="windy-watermark-mask">
            <span>LIVE FORECAST</span>
          </div>
          <iframe
            width="100%"
            height="100%"
            src={`https://embed.windy.com/embed.html?type=forecast&location=coordinates&detail=true&detailLat=${lat}&detailLon=${lon}&metricTemp=default&metricRain=default&metricWind=default`}
            frameBorder="0"
            style={{ border: 'none' }}
            title="Live Weather Forecast"
          ></iframe>
        </div>
      </div>
    </div>
  );
};
