/**
 * Colorbar component — shows the color scale legend for the current variable.
 * Renders as an overlay on the 3D viewport.
 */
import { useMemo } from 'react';
import { getColormap, type ColorStop } from '../../utils/colormap';
import { VARIABLE_LABELS, VARIABLE_UNITS, type OceanVariable } from '../../types';
import './Colorbar.css';

interface ColorbarProps {
  variable: OceanVariable | string;
  vMin: number;
  vMax: number;
  customLabel?: string;
  customUnit?: string;
}

export default function Colorbar({
  variable,
  vMin,
  vMax,
  customLabel,
  customUnit,
}: ColorbarProps) {
  const colormap = useMemo(() => getColormap(variable), [variable]);

  // Generate CSS gradient from colormap
  const gradientStyle = useMemo(() => {
    const stops = colormap.map((stop: ColorStop) => {
      const [r, g, b] = stop.color;
      return `rgb(${r},${g},${b}) ${stop.position * 100}%`;
    });
    return {
      background: `linear-gradient(to right, ${stops.join(', ')})`,
    };
  }, [colormap]);

  const label =
    customLabel ||
    (variable === 'tchp'
      ? 'Tropical Cyclone Heat Potential (TCHP)'
      : VARIABLE_LABELS[variable as OceanVariable] || variable);

  const unit =
    customUnit ||
    (variable === 'tchp' ? 'kJ/cm²' : VARIABLE_UNITS[variable as OceanVariable] || '');

  // Generate tick values
  const ticks = useMemo(() => {
    const count = 5;
    const result: { value: string; position: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const val = vMin + (vMax - vMin) * (i / count);
      result.push({
        value: val.toFixed(1),
        position: `${(i / count) * 100}%`,
      });
    }
    return result;
  }, [vMin, vMax]);

  // INCOIS rapid intensification threshold marker for TCHP
  const thresholdPos = useMemo(() => {
    if (variable !== 'tchp' || vMax <= vMin) return null;
    const pos = (50 - vMin) / (vMax - vMin);
    return pos >= 0 && pos <= 1 ? pos * 100 : null;
  }, [variable, vMin, vMax]);

  return (
    <div className="colorbar">
      <div className="colorbar-label">
        <span>{label} ({unit})</span>
        {variable === 'tchp' && (
          <span style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 600, marginLeft: '6px' }}>
            [Alert Threshold: 50 kJ/cm²]
          </span>
        )}
      </div>
      <div className="colorbar-gradient" style={gradientStyle}>
        {thresholdPos !== null && (
          <div
            style={{
              position: 'absolute',
              top: '-2px',
              bottom: '-2px',
              left: `${thresholdPos}%`,
              width: '2px',
              background: '#f59e0b',
              boxShadow: '0 0 6px #f59e0b',
              pointerEvents: 'none',
            }}
            title="INCOIS 50 kJ/cm² Rapid Cyclone Intensification Threshold"
          />
        )}
      </div>
      <div className="colorbar-ticks">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="colorbar-tick"
            style={{ left: tick.position }}
          >
            {tick.value}
          </span>
        ))}
      </div>
    </div>
  );
}

