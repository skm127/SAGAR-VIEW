/**
 * Bottom control bar with Variable selector, Depth slider with presets,
 * Currents toggle, and live status.
 */
import { Waves } from 'lucide-react';
import { VARIABLE_LABELS, type OceanVariable } from '../../types';
import './ControlBar.css';

interface ControlBarProps {
  variable: OceanVariable;
  depth: number;
  timeIndex: number;
  depthLevels: number[];
  timeSteps: number;
  loading: boolean;
  showCurrents: boolean;
  onVariableChange: (variable: OceanVariable) => void;
  onDepthChange: (depth: number) => void;
  onToggleCurrents: () => void;
}

const DEPTH_PRESETS = [
  { label: 'Surface', depth: 0 },
  { label: '50m', depth: 50 },
  { label: '100m', depth: 100 },
  { label: '200m', depth: 200 },
  { label: '500m', depth: 500 },
];

export default function ControlBar({
  variable,
  depth,
  depthLevels,
  loading,
  showCurrents,
  onVariableChange,
  onDepthChange,
  onToggleCurrents,
}: ControlBarProps) {
  const depthIndex =
    depthLevels.indexOf(depth) >= 0
      ? depthLevels.indexOf(depth)
      : depthLevels.reduce(
          (closest, d, i) =>
            Math.abs(d - depth) < Math.abs(depthLevels[closest] - depth) ? i : closest,
          0
        );

  const handleVariableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onVariableChange(e.target.value as OceanVariable);
  };

  const handleDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Number(e.target.value);
    onDepthChange(depthLevels[idx]);
  };

  return (
    <div className="control-bar">
      {/* Variable selector */}
      <div className="control-group">
        <label>Variable</label>
        <select value={variable} onChange={handleVariableChange}>
          {(Object.keys(VARIABLE_LABELS) as OceanVariable[]).map((v) => (
            <option key={v} value={v}>
              {VARIABLE_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      {/* Depth slider */}
      <div className="control-group depth-control">
        <div className="depth-header">
          <label>Depth: {depth}m</label>
          <div className="depth-presets">
            {DEPTH_PRESETS.map((preset) => (
              <button
                key={preset.depth}
                className={`preset-btn ${depth === preset.depth ? 'active' : ''}`}
                onClick={() => onDepthChange(preset.depth)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={depthLevels.length - 1}
          value={depthIndex}
          onChange={handleDepthChange}
        />
      </div>

      {/* Action buttons */}
      <div className="control-group action-buttons">
        <button
          className={`btn toggle-currents-btn ${showCurrents ? 'active' : ''}`}
          onClick={onToggleCurrents}
          title="Toggle ocean surface current vectors"
        >
          <span className="btn-icon"><Waves size={13} /></span>
          <span>Currents: {showCurrents ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div className="control-group">
          <div className="loading-indicator">
            <span className="loading-dot" />
            <span>Fetching slice...</span>
          </div>
        </div>
      )}
    </div>
  );
}
