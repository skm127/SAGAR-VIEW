/**
 * Coordinate conversion utilities.
 * Convert lat/lon to 3D positions on a sphere.
 */
import * as THREE from 'three';

const GLOBE_RADIUS = 3;

/**
 * Convert latitude/longitude (degrees) to 3D position on a sphere.
 * Three.js uses Y-up coordinate system.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS,
  altitude: number = 0
): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);   // polar angle from Y-axis
  const theta = THREE.MathUtils.degToRad(lon + 180); // azimuthal angle
  const r = radius + altitude;

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Convert 3D position vector on sphere back to lat/lon.
 */
export function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (r === 0) return { lat: 0, lon: 0 };

  // Inverse of latLonToVector3:
  //   x = -r * sin(phi) * cos(theta)
  //   y =  r * cos(phi)
  //   z =  r * sin(phi) * sin(theta)
  // where phi = deg2rad(90 - lat), theta = deg2rad(lon + 180)

  const phi = Math.acos(THREE.MathUtils.clamp(v.y / r, -1, 1));
  const lat = 90 - THREE.MathUtils.radToDeg(phi);

  // theta = atan2(z, -x) since x = -r*sin(phi)*cos(theta), z = r*sin(phi)*sin(theta)
  const theta = Math.atan2(v.z, -v.x);
  // theta = deg2rad(lon + 180), so lon = rad2deg(theta) - 180
  let lon = THREE.MathUtils.radToDeg(theta) - 180;

  // Normalize to [-180, 180]
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;

  return { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
}


/**
 * Get camera position that looks at all oceans around India.
 * Center: ~14.0°N, 78.0°E (Indian Peninsula)
 */
export function getBayOfBengalCameraPosition(distance: number = 6.6): THREE.Vector3 {
  return latLonToVector3(14.0, 78.0, distance);
}

export type SectorId = 'all_india' | 'arabian_sea' | 'bay_of_bengal' | 'anomaly_target' | 'equatorial';

export interface SectorPreset {
  id: SectorId;
  label: string;
  icon: string;
  lat: number;
  lon: number;
  distance: number;
  description: string;
}

export const SECTOR_PRESETS: Record<SectorId, SectorPreset> = {
  all_india: {
    id: 'all_india',
    label: 'Indian Domain',
    icon: '◈',
    lat: 14.0,
    lon: 78.0,
    distance: 6.6,
    description: 'Overview: Arabian Sea, Bay of Bengal & Peninsula',
  },
  arabian_sea: {
    id: 'arabian_sea',
    label: 'Arabian Sea',
    icon: '◈',
    lat: 16.5,
    lon: 67.5,
    distance: 5.3,
    description: 'Western Basin, Upwelling Zones & Lakshadweep',
  },
  bay_of_bengal: {
    id: 'bay_of_bengal',
    label: 'Bay of Bengal',
    icon: '◈',
    lat: 15.0,
    lon: 88.5,
    distance: 5.3,
    description: 'Eastern Basin, Stratification & Freshwater Plumes',
  },
  anomaly_target: {
    id: 'anomaly_target',
    // Generic label: the actual camera target is resolved live from the fleet
    // analysis in App.handleSelectSector (the top-anomaly float drifts).
    label: 'Top Fleet Anomaly',
    icon: '▲',
    lat: 14.5,
    lon: 84.8,
    distance: 4.4,
    description: 'Fly to the live fleet analysis\' highest-severity float',
  },
  equatorial: {
    id: 'equatorial',
    label: 'Equatorial',
    icon: '◈',
    lat: 4.5,
    lon: 77.5,
    distance: 5.5,
    description: 'Equatorial Indian Ocean & Current Convergence',
  },
};

export function getSectorCameraPosition(sectorId: SectorId): THREE.Vector3 {
  const s = SECTOR_PRESETS[sectorId] || SECTOR_PRESETS.all_india;
  return latLonToVector3(s.lat, s.lon, s.distance);
}

export { GLOBE_RADIUS };

export function basinNameFromCoords(lat: number, lon: number): string {
  if (lon >= 80 && lon <= 94 && lat >= 10 && lat <= 22) return 'the Bay of Bengal';
  if (lon >= 62 && lon <= 76 && lat >= 10 && lat <= 24) return 'the Arabian Sea';
  return 'the equatorial Indian Ocean';
}

