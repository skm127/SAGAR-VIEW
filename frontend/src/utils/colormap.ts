/**
 * Colormap utilities for ocean data visualization.
 * Maps scalar values (temperature, salinity, etc.) to RGB colors.
 */

export interface ColorStop {
  position: number; // 0-1
  color: [number, number, number]; // RGB 0-255
}

/** Temperature colormap: deep blue (cold) → cyan → green → yellow → red (hot) */
export const TEMPERATURE_COLORMAP: ColorStop[] = [
  { position: 0.0, color: [4, 15, 60] },       // Deep navy
  { position: 0.15, color: [20, 50, 140] },     // Dark blue
  { position: 0.3, color: [30, 120, 200] },     // Blue
  { position: 0.45, color: [40, 190, 210] },    // Cyan
  { position: 0.55, color: [80, 210, 120] },    // Green
  { position: 0.7, color: [200, 220, 50] },     // Yellow-green
  { position: 0.8, color: [255, 180, 30] },     // Orange
  { position: 0.9, color: [240, 80, 20] },      // Red-orange
  { position: 1.0, color: [160, 10, 10] },      // Dark red
];

/** Salinity colormap: rich vibrant colors that stand out against land */
export const SALINITY_COLORMAP: ColorStop[] = [
  { position: 0.0, color: [0, 80, 100] },       // Deep teal (fresh)
  { position: 0.2, color: [20, 140, 140] },     // Light teal
  { position: 0.4, color: [60, 200, 180] },     // Cyan
  { position: 0.6, color: [40, 120, 220] },     // Blue
  { position: 0.8, color: [100, 50, 180] },     // Purple
  { position: 1.0, color: [160, 20, 120] },     // Magenta (saline)
];

/** Current speed colormap: calm → intense */
export const CURRENT_COLORMAP: ColorStop[] = [
  { position: 0.0, color: [20, 30, 60] },       // Dark
  { position: 0.25, color: [30, 80, 160] },     // Blue
  { position: 0.5, color: [50, 180, 180] },     // Cyan
  { position: 0.75, color: [200, 200, 60] },    // Yellow
  { position: 1.0, color: [255, 60, 30] },      // Red
];

/** Tropical Cyclone Heat Potential (TCHP) colormap: 0 to 120 kJ/cm² with rapid intensification highlight at 50 kJ/cm² */
export const TCHP_COLORMAP: ColorStop[] = [
  { position: 0.0, color: [10, 25, 60] },       // Deep blue (< 15 kJ/cm²)
  { position: 0.25, color: [20, 110, 190] },    // Moderate blue (~30 kJ/cm²)
  { position: 0.38, color: [40, 200, 150] },    // Green/Teal (~45 kJ/cm²)
  { position: 0.42, color: [255, 210, 30] },    // Amber gold (50 kJ/cm² - INCOIS Cyclone Intensification Threshold)
  { position: 0.58, color: [255, 80, 20] },     // Vivid orange-red (~70 kJ/cm²)
  { position: 0.75, color: [230, 15, 60] },     // Fiery crimson (~90 kJ/cm²)
  { position: 1.0, color: [190, 0, 170] },      // Neon violet/magenta (120+ kJ/cm² Extreme Risk)
];

/** Model confidence colormap: red (low / unverified) → amber → green (Argo-verified, low error) */
export const CONFIDENCE_COLORMAP: ColorStop[] = [
  { position: 0.0, color: [190, 40, 50] },
  { position: 0.3, color: [230, 120, 50] },
  { position: 0.45, color: [235, 190, 70] },
  { position: 0.65, color: [170, 210, 90] },
  { position: 1.0, color: [30, 170, 100] },
];

/** Get the colormap for a given variable */
export function getColormap(variable: string): ColorStop[] {
  switch (variable) {
    case 'thetao': return TEMPERATURE_COLORMAP;
    case 'so': return SALINITY_COLORMAP;
    case 'uo':
    case 'vo': return CURRENT_COLORMAP;
    case 'tchp': return TCHP_COLORMAP;
    case 'confidence': return CONFIDENCE_COLORMAP;
    default: return TEMPERATURE_COLORMAP;
  }
}


/**
 * Interpolate a color from a colormap at a normalized position (0-1).
 */
export function interpolateColor(
  colormap: ColorStop[],
  t: number
): [number, number, number] {
  // Clamp to [0, 1]
  t = Math.max(0, Math.min(1, t));

  // Find the two surrounding stops
  let lower = colormap[0];
  let upper = colormap[colormap.length - 1];

  for (let i = 0; i < colormap.length - 1; i++) {
    if (t >= colormap[i].position && t <= colormap[i + 1].position) {
      lower = colormap[i];
      upper = colormap[i + 1];
      break;
    }
  }

  // Interpolate between the two stops
  const range = upper.position - lower.position;
  const localT = range === 0 ? 0 : (t - lower.position) / range;

  return [
    Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * localT),
    Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * localT),
    Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * localT),
  ];
}

/**
 * Get color as normalized 0-1 RGB object for Three.js Color or Canvas.
 */
export function getColormapColor(
  variable: string,
  t: number
): { r: number; g: number; b: number } {
  const cmap = getColormap(variable);
  const [r, g, b] = interpolateColor(cmap, t);
  return { r: r / 255, g: g / 255, b: b / 255 };
}

/**
 * Generate a colorbar texture data (256 RGBA pixels).
 * Returns a Uint8Array suitable for a THREE.DataTexture.
 */
export function generateColorbarData(colormap: ColorStop[]): Uint8Array {
  const width = 256;
  const data = new Uint8Array(width * 4); // RGBA

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const [r, g, b] = interpolateColor(colormap, t);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255; // Full opacity
  }

  return data;
}

/**
 * Convert a Float32Array of raw values into an RGBA Uint8Array
 * using the given colormap and value range.
 * NaN / sentinel values (-9999) are made transparent.
 */
export function valuesToRGBA(
  values: Float32Array,
  colormap: ColorStop[],
  vMin: number,
  vMax: number,
  opacity: number = 0.85,
  width?: number,
  height?: number,
  featherPixels: number = 6
): Uint8Array {
  const n = values.length;
  const rgba = new Uint8Array(n * 4);
  const range = vMax - vMin;
  const alphaByte = Math.round(opacity * 255);

  // Pass 1: populate valid ocean cells
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const idx = i * 4;

    if (v <= -9998 || isNaN(v)) {
      // Initialize land / missing cells with 0 alpha and neutral deep ocean tint
      rgba[idx] = 10;
      rgba[idx + 1] = 28;
      rgba[idx + 2] = 60;
      rgba[idx + 3] = 0;
    } else {
      const t = range === 0 ? 0.5 : (v - vMin) / range;
      const [r, g, b] = interpolateColor(colormap, t);

      let effectiveAlpha = alphaByte;
      if (width && height && featherPixels > 0) {
        const row = Math.floor(i / width);
        const col = i % width;
        const distEdge = Math.min(col, width - 1 - col, row, height - 1 - row);
        if (distEdge < featherPixels) {
          const featherFactor = distEdge / featherPixels;
          effectiveAlpha = Math.round(alphaByte * featherFactor);
        }
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = effectiveAlpha;
    }
  }

  // Pass 2: Color bleeding for boundary land cells to prevent dark bilinear fringes
  if (width && height) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        const idx = i * 4;
        if (rgba[idx + 3] === 0) {
          // Check 4-neighbors for a valid ocean cell to copy color from
          const neighbors = [
            row > 0 ? (row - 1) * width + col : -1,
            row < height - 1 ? (row + 1) * width + col : -1,
            col > 0 ? row * width + (col - 1) : -1,
            col < width - 1 ? row * width + (col + 1) : -1,
          ];
          for (const nIdx of neighbors) {
            if (nIdx >= 0 && rgba[nIdx * 4 + 3] > 0) {
              rgba[idx] = rgba[nIdx * 4];
              rgba[idx + 1] = rgba[nIdx * 4 + 1];
              rgba[idx + 2] = rgba[nIdx * 4 + 2];
              break;
            }
          }
        }
      }
    }
  }

  return rgba;
}


