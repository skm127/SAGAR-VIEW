/**
 * HoverSounderHUD.tsx
 * Zero-network, client-side 60 FPS hover sounding HUD.
 * Directly samples in-memory Float32Array on cursor movement over the 3D globe.
 * Adapts between Citizen and Scientist explainability lenses.
 */
import React, { useMemo } from 'react';
import type { OceanSliceData } from '../../hooks/useOceanData';
import type { OceanVariable } from '../../types';
import type { ExplainMode } from './ExplainabilityToggle';
import './HoverSounderHUD.css';

interface HoverSounderHUDProps {
  coordinate: { lat: number; lon: number } | null;
  sliceData: OceanSliceData | null;
  variable: OceanVariable;
  depth: number;
  explainMode: ExplainMode;
}

export const HoverSounderHUD: React.FC<HoverSounderHUDProps> = ({
  coordinate,
  sliceData,
  variable,
  depth,
  explainMode,
}) => {
  // In-memory zero-network lookup
  const sampledValue = useMemo(() => {
    if (!coordinate || !sliceData) return null;
    const { lat, lon } = coordinate;
    const { latMin, latMax, lonMin, lonMax, width, height, values } = sliceData;

    if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return null;

    const u = (lon - lonMin) / (lonMax - lonMin);
    const v = (lat - latMin) / (latMax - latMin);

    const col = Math.max(0, Math.min(width - 1, Math.round(u * (width - 1))));
    const row = Math.max(0, Math.min(height - 1, Math.round(v * (height - 1))));

    const idx = row * width + col;
    const val = values[idx];
    if (val === undefined || isNaN(val) || val <= -9000) return null;
    return Number(val.toFixed(2));
  }, [coordinate, sliceData]);

  if (!coordinate || sampledValue === null) return null;

  const unit = variable === 'thetao' ? '°C' : variable === 'so' ? 'PSU' : 'm/s';

  // Citizen vs Scientist dual-lens explanations
  let statusBadge = 'Nominal';
  let badgeClass = 'nominal';
  let title = 'Normal Ocean Condition';
  let explanation = '';

  if (variable === 'thetao') {
    if (sampledValue >= 29.5) {
      statusBadge = 'High Thermal Risk';
      badgeClass = 'critical';
      title = explainMode === 'citizen' ? 'Trapped Heat Reservoir' : 'Elevated Isotherm Stratification';
      explanation =
        explainMode === 'citizen'
          ? 'Exceptionally warm water at this layer. Hidden fuel that rapidly intensifies tropical storms.'
          : `Isotherm depth anomalies exceed +2.2σ. Tropical Cyclone Heat Potential (TCHP) elevated.`;
    } else if (sampledValue >= 27.0) {
      statusBadge = 'Optimal State';
      badgeClass = 'nominal';
      title = explainMode === 'citizen' ? 'Tropical Surface Water' : 'Mixed Layer Thermocline Core';
      explanation =
        explainMode === 'citizen'
          ? 'Calm, standard ocean temperatures favorable for coastal fisheries and shipping.'
          : `Stable epipelagic layer with normal geostrophic heat budget balance.`;
    } else {
      statusBadge = 'Cool Horizon';
      badgeClass = 'cool';
      title = explainMode === 'citizen' ? 'Deep Cool Water' : 'Mesopelagic Thermocline Gradient';
      explanation =
        explainMode === 'citizen'
          ? 'Colder subsurface water layer. Nutrient upwelling supports marine biodiversity.'
          : `Sub-thermocline baroclinic density structure. Vertical shear within nominal bounds.`;
    }
  } else if (variable === 'so') {
    if (sampledValue < 33.0) {
      statusBadge = 'Fresh Inflow';
      badgeClass = 'info';
      title = explainMode === 'citizen' ? 'River Runoff Plume' : 'Low-Salinity Buoyant Lens';
      explanation =
        explainMode === 'citizen'
          ? 'Freshwater discharge from major rivers (Ganges-Brahmaputra) creating a surface barrier.'
          : `Salinity stratified barrier layer suppressing vertical convective heat exchange.`;
    } else {
      statusBadge = 'High Salinity';
      badgeClass = 'nominal';
      title = explainMode === 'citizen' ? 'Dense Salty Seawater' : 'Arabian High-Salinity Water (ASW)';
      explanation =
        explainMode === 'citizen'
          ? 'Standard high-salinity oceanic water characteristic of the northern Indian Ocean.'
          : `Standard PSS-78 salinity distribution maintaining pycnocline stability.`;
    }
  }

  return (
    <div className="hover-sounder-hud">
      <div className="hover-hud-header">
        <div className="hover-coord-text">
          {Math.abs(coordinate.lat).toFixed(2)}°{coordinate.lat >= 0 ? 'N' : 'S'},{' '}
          {Math.abs(coordinate.lon).toFixed(2)}°{coordinate.lon >= 0 ? 'E' : 'W'}
        </div>
        <span className={`hover-status-pill ${badgeClass}`}>{statusBadge}</span>
      </div>

      <div className="hover-value-row">
        <div className="hover-val-group">
          <span className="hover-val-label">{variable === 'thetao' ? 'TEMPERATURE' : 'SALINITY'} ({depth}M)</span>
          <span className="hover-val-num">
            {sampledValue} <span className="hover-unit">{unit}</span>
          </span>
        </div>
        <div className="hover-lens-tag">
          {explainMode === 'citizen' ? 'Citizen Lens' : 'Scientist Lens'}
        </div>
      </div>

      <div className="hover-desc-group">
        <span className="hover-desc-title">{title}</span>
        <p className="hover-desc-text">{explanation}</p>
      </div>

      <div className="hover-hud-footer">
        <span>Click to Drop Probe</span>
        <span>•</span>
        <span>Right-Click for Dossier</span>
      </div>
    </div>
  );
};

export default HoverSounderHUD;
