/**
 * CurrentVectors — Animated particle flow visualization for ocean currents.
 * Renders thousands of flowing line trails with fading tails.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { latLonToVector3, GLOBE_RADIUS } from '../../utils/coordinates';
import { interpolateColor, CURRENT_COLORMAP } from '../../utils/colormap';
import type { LiveStorm } from '../../services/intelApi';

export interface CurrentVector {
  lat: number;
  lon: number;
  uo: number;
  vo: number;
  speed: number;
}

interface CurrentVectorsProps {
  vectors: CurrentVector[];
  speedMin: number;
  speedMax: number;
  visible?: boolean;
  liveStorms?: LiveStorm[];
}

const TRAIL_LENGTH = 24;
const DOMAIN = { latMin: -2, latMax: 30, lonMin: 58, lonMax: 102 };

interface ParticleState {
  lat: number;
  lon: number;
  originIdx: number;
  life: number;
  maxLife: number;
}

function StreamingCurrents({
  vectors,
  speedMin,
  speedMax,
  liveStorms = [],
}: {
  vectors: CurrentVector[];
  speedMin: number;
  speedMax: number;
  liveStorms?: LiveStorm[];
}) {
  const trailRef = useRef<THREE.LineSegments>(null);

  const particleCount = useMemo(
    () => Math.min(vectors.length * 12, 8000),
    [vectors.length]
  );

  const stateRef = useRef<{
    particles: ParticleState[];
    trails: Float32Array;
    initialized: boolean;
  }>({
    particles: [],
    trails: new Float32Array(0),
    initialized: false,
  });

  // Initialize particle states
  useMemo(() => {
    const particles: ParticleState[] = [];
    for (let i = 0; i < particleCount; i++) {
      const vecIdx = i % vectors.length;
      const vec = vectors[vecIdx];
      let spawnLat = vec.lat + (Math.random() - 0.5) * 1.5;
      let spawnLon = vec.lon + (Math.random() - 0.5) * 1.5;
      spawnLat = Math.max(DOMAIN.latMin + 0.1, Math.min(DOMAIN.latMax - 0.1, spawnLat));
      spawnLon = Math.max(DOMAIN.lonMin + 0.1, Math.min(DOMAIN.lonMax - 0.1, spawnLon));

      particles.push({
        lat: spawnLat,
        lon: spawnLon,
        originIdx: vecIdx,
        life: Math.random() * 120,
        maxLife: 80 + Math.random() * 120,
      });
    }
    stateRef.current.particles = particles;
    stateRef.current.trails = new Float32Array(particleCount * TRAIL_LENGTH * 3);
    stateRef.current.initialized = false;
  }, [vectors, particleCount]);

  // Trail geometry buffers
  const trailPositions = useMemo(() => {
    const segs = particleCount * (TRAIL_LENGTH - 1);
    return new Float32Array(segs * 2 * 3);
  }, [particleCount]);

  const trailColors = useMemo(() => {
    const segs = particleCount * (TRAIL_LENGTH - 1);
    const cols = new Float32Array(segs * 2 * 3);
    const range = speedMax - speedMin || 1;

    for (let i = 0; i < particleCount; i++) {
      const vec = vectors[i % vectors.length];
      const t = Math.min(1, Math.max(0, (vec.speed - speedMin) / range));
      const [r, g, b] = interpolateColor(CURRENT_COLORMAP, t);

      for (let s = 0; s < TRAIL_LENGTH - 1; s++) {
        const idx = (i * (TRAIL_LENGTH - 1) + s) * 6;
        const fadeA = Math.pow(1.0 - s / (TRAIL_LENGTH - 1), 2.0);
        const fadeB = Math.pow(1.0 - (s + 1) / (TRAIL_LENGTH - 1), 2.0);
        const mixA = Math.max(0, 1.0 - s / 4.0);
        const mixB = Math.max(0, 1.0 - (s + 1) / 4.0);
        const alpha = 0.8;

        cols[idx]     = ((r / 255) * (1 - mixA) + mixA) * fadeA * alpha;
        cols[idx + 1] = ((g / 255) * (1 - mixA) + mixA) * fadeA * alpha;
        cols[idx + 2] = ((b / 255) * (1 - mixA) + mixA) * fadeA * alpha;
        cols[idx + 3] = ((r / 255) * (1 - mixB) + mixB) * fadeB * alpha;
        cols[idx + 4] = ((g / 255) * (1 - mixB) + mixB) * fadeB * alpha;
        cols[idx + 5] = ((b / 255) * (1 - mixB) + mixB) * fadeB * alpha;
      }
    }
    return cols;
  }, [vectors, speedMin, speedMax, particleCount]);

  useFrame((_, delta) => {
    if (!trailRef.current) return;
    const { particles, trails } = stateRef.current;

    // First-frame init
    if (!stateRef.current.initialized) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const pos = latLonToVector3(p.lat, p.lon, GLOBE_RADIUS + 0.02);
        for (let t = 0; t < TRAIL_LENGTH; t++) {
          const idx = (i * TRAIL_LENGTH + t) * 3;
          trails[idx] = pos.x;
          trails[idx + 1] = pos.y;
          trails[idx + 2] = pos.z;
        }
      }
      stateRef.current.initialized = true;
    }

    const buf = trailRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life += 1;

      // Shift trail history
      for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
        const dst = (i * TRAIL_LENGTH + t) * 3;
        const src = (i * TRAIL_LENGTH + t - 1) * 3;
        trails[dst] = trails[src];
        trails[dst + 1] = trails[src + 1];
        trails[dst + 2] = trails[src + 2];
      }

      const vec = vectors[p.originIdx];
      let spd = 0.025 * (vec.speed / (speedMax || 0.1)) * delta * 60;
      let vo = vec.vo;
      let uo = vec.uo;

      // Apply procedural cyclone vortex influence
      if (liveStorms && liveStorms.length > 0) {
        for (const storm of liveStorms) {
          const dLat = p.lat - storm.lat;
          const dLon = p.lon - storm.lon;
          const distSq = dLat * dLat + dLon * dLon;
          
          // Influence radius roughly ~5-6 degrees
          if (distSq < 36.0) {
            const dist = Math.sqrt(distSq) || 0.001;
            // Smooth falloff towards the edges
            const factor = Math.max(0, 1.0 - (dist / 6.0));
            // Intensity based on wind speed
            const stormIntensity = (storm.max_wind_kt || 64.0) / 100.0;
            
            // Tangent vector for rotation (CCW in Northern Hemisphere, CW in Southern)
            const swirlDir = storm.lat >= 0 ? 1 : -1;
            const nx = dLon / dist;
            const ny = dLat / dist;
            
            const tangentU = -ny * swirlDir;
            const tangentV = nx * swirlDir;
            
            // Blend velocities. Stronger near the core.
            const blend = factor * factor * stormIntensity;
            const vortexSpeed = 2.0; 
            
            uo = uo * (1 - blend) + tangentU * vortexSpeed * blend;
            vo = vo * (1 - blend) + tangentV * vortexSpeed * blend;
            spd = spd * (1 + blend * 1.5);
          }
        }
      }

      let lat = p.lat + vo * spd;
      let lon = p.lon + uo * spd;

      // Respawn if out of bounds or end of life
      if (
        p.life >= p.maxLife ||
        lat < DOMAIN.latMin || lat > DOMAIN.latMax ||
        lon < DOMAIN.lonMin || lon > DOMAIN.lonMax
      ) {
        p.originIdx = Math.floor(Math.random() * vectors.length);
        const newVec = vectors[p.originIdx];
        lat = newVec.lat + (Math.random() - 0.5) * 0.5;
        lon = newVec.lon + (Math.random() - 0.5) * 0.5;
        // Clamp strictly inside domain
        lat = Math.max(DOMAIN.latMin + 0.1, Math.min(DOMAIN.latMax - 0.1, lat));
        lon = Math.max(DOMAIN.lonMin + 0.1, Math.min(DOMAIN.lonMax - 0.1, lon));
        
        p.life = 0;
        const rp = latLonToVector3(lat, lon, GLOBE_RADIUS + 0.02);
        for (let t = 0; t < TRAIL_LENGTH; t++) {
          const idx = (i * TRAIL_LENGTH + t) * 3;
          trails[idx] = rp.x;
          trails[idx + 1] = rp.y;
          trails[idx + 2] = rp.z;
        }
      }

      const np = latLonToVector3(lat, lon, GLOBE_RADIUS + 0.02);
      const head = i * TRAIL_LENGTH * 3;
      trails[head] = np.x;
      trails[head + 1] = np.y;
      trails[head + 2] = np.z;

      p.lat = lat;
      p.lon = lon;

      // Write line segment pairs
      for (let s = 0; s < TRAIL_LENGTH - 1; s++) {
        const si = (i * (TRAIL_LENGTH - 1) + s) * 6;
        const a = (i * TRAIL_LENGTH + s) * 3;
        const b = (i * TRAIL_LENGTH + s + 1) * 3;
        buf[si] = trails[a];
        buf[si + 1] = trails[a + 1];
        buf[si + 2] = trails[a + 2];
        buf[si + 3] = trails[b];
        buf[si + 4] = trails[b + 1];
        buf[si + 5] = trails[b + 2];
      }
    }

    trailRef.current.geometry.attributes.position.needsUpdate = true;
  });

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    return g;
  }, [trailPositions, trailColors]);

  return (
    <lineSegments ref={trailRef} geometry={geo} renderOrder={14}>
      <lineBasicMaterial
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

export default function CurrentVectors({
  vectors,
  speedMin,
  speedMax,
  visible = true,
  liveStorms = [],
}: CurrentVectorsProps) {
  if (!visible || vectors.length === 0) return null;

  return (
    <group>
      <StreamingCurrents vectors={vectors} speedMin={speedMin} speedMax={speedMax} liveStorms={liveStorms} />
    </group>
  );
}
