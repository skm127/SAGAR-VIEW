/**
 * ViewportControls.tsx
 * On-screen 3D globe navigation controls (inspired by Google Earth and scientific GIS):
 * - Horizon tilt angle slider (15° to 75°)
 * - Quick nadir reset (90° Top-Down)
 * - Clean compass heading reticle
 */
import React from 'react';
import './ViewportControls.css';

interface ViewportControlsProps {
  cameraPitch: number;
  onPitchChange: (pitch: number) => void;
  onResetNadir: () => void;
}

export const ViewportControls: React.FC<ViewportControlsProps> = ({
  cameraPitch,
  onPitchChange,
  onResetNadir,
}) => {
  return (
    <div className="viewport-controls-bracket">
      {/* Compass / Nadir Reset */}
      <button
        className="compass-btn"
        onClick={onResetNadir}
        title="Reset to the Indian Ocean overview"
      >
        <div className="compass-needle" style={{ transform: `rotate(${-(cameraPitch - 50)}deg)` }}>
          <span className="needle-n">N</span>
        </div>
      </button>

      {/* Tilt Angle Slider */}
      <div className="pitch-control-rail">
        <span className="rail-label">TILT</span>
        <input
          type="range"
          min="15"
          max="90"
          value={cameraPitch}
          onChange={(e) => onPitchChange(parseInt(e.target.value))}
          className="vertical-tilt-slider"
          title={`Perspective Horizon Tilt: ${cameraPitch}°`}
        />
        <span className="tilt-deg-val">{cameraPitch}°</span>
      </div>
    </div>
  );
};

export default ViewportControls;
