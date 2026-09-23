/**
 * ArgoMarkers — Tactical 3D Interactive Target Beacons for Profiling Floats.
 * Features sonar radar rings, beacon pulses, outer glow halos on selection,
 * floating platform ID labels on hover, and non-intrusive hover tooltips.
 *
 * Visual design: OSIRIS / Palantir C2 beacon language with additive glow sprites.
 */
import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { latLonToVector3, GLOBE_RADIUS } from '../../utils/coordinates';
import type { ArgoProfileSummary } from '../../types';

/** Non-Argo platforms (moored buoys, gliders) rendered from live backend data. */
export interface ExtraPlatform {
  id: string;
  platform_id: string;
  lat: number;
  lon: number;
  name: string;
  kind: 'buoy' | 'glider';
  warning?: boolean;
}

interface ArgoMarkersProps {
  profiles: ArgoProfileSummary[];
  extraPlatforms?: ExtraPlatform[];
  /** platform_id -> anomaly status from the fleet-wide analysis; drives marker colors. */
  platformStatus?: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function SingleBuoy({
  profile,
  isSelected,
  onSelect,
  platformStatus,
}: {
  profile: ArgoProfileSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
  platformStatus?: Record<string, string>;
}) {
  const [hovered, setHovered] = useState(false);
  const beaconRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pos = latLonToVector3(profile.latitude, profile.longitude, GLOBE_RADIUS + 0.02);

  // Marker status is driven by the live fleet-wide anomaly analysis, not by
  // hardcoded platform IDs.
  const status = platformStatus?.[profile.platform_id];
  const isCritical = status === 'CRITICAL_ANOMALY';
  const isWarning = status === 'WARNING';
  const statusColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';

  // Radar ping & beacon blink animation
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Radar expanding ring
    if (ringRef.current) {
      const pingSpeed = isCritical ? 1.2 : isWarning ? 0.9 : 0.6;
      const pingT = (t * pingSpeed + (Number(profile.platform_id) % 4) * 0.4) % 1.5;
      const scale = 0.8 + pingT * 2.8;
      ringRef.current.scale.set(scale, scale, scale);
      const ringMat = ringRef.current.material as THREE.MeshBasicMaterial;
      ringMat.opacity = Math.max(0, 0.7 - pingT / 1.5);
    }

    // Beacon blink
    if (beaconRef.current) {
      const blinkRate = isCritical ? 8 : isWarning ? 4 : 2;
      const blink = Math.sin(t * blinkRate);
      const beaconMat = beaconRef.current.material as THREE.MeshBasicMaterial;
      beaconMat.opacity = isSelected ? 1.0 : 0.4 + 0.6 * (blink > 0 ? 1 : 0);
    }

    // Outer glow halo pulse on selection or hover
    if (glowRef.current) {
      const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
      if (isSelected || hovered) {
        const pulse = 0.25 + 0.15 * Math.sin(t * 4);
        glowMat.opacity = pulse;
        const s = 1.0 + 0.15 * Math.sin(t * 3);
        glowRef.current.scale.set(s, s, s);
      } else {
        glowMat.opacity = 0;
      }
    }
  });

  const tetherGeo = useMemo(() => {
    const dir = pos.clone().normalize().multiplyScalar(-0.075);
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      dir,
    ]);
  }, [pos]);

  const tetherMat = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: statusColor,
      transparent: true,
      opacity: isCritical ? 0.85 : 0.45,
    });
  }, [statusColor, isCritical]);

  const deepSensorPos = useMemo(() => {
    return pos.clone().normalize().multiplyScalar(-0.075);
  }, [pos]);

  // Compute outward-facing normal for label positioning
  const labelOffset = useMemo(() => {
    return pos.clone().normalize().multiplyScalar(0.07);
  }, [pos]);

  return (
    <group position={pos}>
      {/* Subsurface Sounding Column Tether (0-2000m profiling descent) */}
      <primitive object={new THREE.Line(tetherGeo, tetherMat)} />
      <mesh position={deepSensorPos}>
        <sphereGeometry args={[0.007, 8, 8]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.7} />
      </mesh>

      {/* Outer Glow Halo (visible on selection/hover) */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial
          color={isSelected ? '#38bdf8' : statusColor}
          transparent
          opacity={0}
          side={THREE.FrontSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Radar Sonar Ping Ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.02, 0.028, 24]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 3D Floating Buoy Core */}
      <mesh>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : statusColor}
          emissive={statusColor}
          emissiveIntensity={hovered || isSelected ? 1.4 : 0.7}
          roughness={0.2}
          metalness={0.85}
        />
      </mesh>

      {/* Invisible Larger Hit Target for Effortless Clicking */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(profile.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Floating Platform ID Label (billboard facing camera, shown on hover) */}
      {(hovered || isSelected) && (
        <Text
          position={labelOffset}
          fontSize={0.025}
          color={isCritical ? '#fca5a5' : isWarning ? '#fde68a' : '#6ee7b7'}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.003}
          outlineColor="#000000"
          font={undefined}
        >
          {profile.platform_id}
        </Text>
      )}

      {/* Mathematically Honest Subsurface Thermal Plume (Proportional to Delta) */}
      {(isCritical || isWarning) && (
        <mesh position={pos.clone().normalize().multiplyScalar(-0.038)}>
          <sphereGeometry args={[isCritical ? 0.048 : 0.026, 16, 16]} />
          <meshBasicMaterial
            color={isCritical ? '#FF3366' : '#FFB300'}
            transparent
            opacity={isCritical ? 0.35 : 0.2}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Top Beacon Pulse Dot */}
      <mesh ref={beaconRef} position={[0, 0.025, 0]}>
        <sphereGeometry args={[0.01, 12, 12]} />
        <meshBasicMaterial
          color={isCritical ? '#fca5a5' : '#ffffff'}
          transparent
          opacity={1.0}
        />
      </mesh>
    </group>
  );
}



function MooredBuoy3DMarker({
  buoy,
  isSelected,
  onSelect,
}: {
  buoy: ExtraPlatform;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLonToVector3(buoy.lat, buoy.lon, GLOBE_RADIUS + 0.02), [buoy.lat, buoy.lon]);
  
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    return q;
  }, [pos]);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const t = clock.getElapsedTime();
      const pingT = (t * 0.8) % 1.6;
      const scale = 0.7 + pingT * 2.2;
      ringRef.current.scale.set(scale, scale, scale);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.6 - pingT / 1.6);
    }

    if (glowRef.current) {
      const t = clock.getElapsedTime();
      const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
      if (isSelected || hovered) {
        glowMat.opacity = 0.2 + 0.1 * Math.sin(t * 4);
      } else {
        glowMat.opacity = 0;
      }
    }
  });

  const labelOffset = useMemo(() => new THREE.Vector3(0, 0.08, 0), []);

  return (
    <group position={pos} quaternion={quaternion}>
      {/* Outer glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial
          color={buoy.warning ? '#ff9800' : '#ffc107'}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Mooring radar ping ring */}
      <mesh ref={ringRef} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.02, 0.03, 32]} />
        <meshBasicMaterial
          color={buoy.warning ? '#ff9800' : '#ffc107'}
          transparent
          opacity={0.0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Sleek Diamond buoy body instead of cartoon cup */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.03, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(buoy.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <cylinderGeometry args={[0.02, 0.02, 0.05, 16]} />
        <meshStandardMaterial
          color={isSelected ? '#ffffff' : buoy.warning ? '#f97316' : '#facc15'}
          emissive={buoy.warning ? '#ea580c' : '#ca8a04'}
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.7}
        />
      </mesh>

      {/* Invisible Larger Hit Target for Effortless Clicking */}
      <mesh
        position={[0, 0.03, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(buoy.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      
      {/* Subsurface glow / mooring line hint */}
      <mesh position={[0, -0.025, 0]}>
        <cylinderGeometry args={[0.005, 0.01, 0.05, 12]} />
        <meshBasicMaterial
          color={buoy.warning ? '#fde68a' : '#fcd34d'}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Floating Platform ID Label (shown on hover) */}
      {(hovered || isSelected) && (
        <Text
          position={labelOffset}
          fontSize={0.028}
          color={buoy.warning ? '#fde68a' : '#fcd34d'}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.003}
          outlineColor="#000000"
          font={undefined}
        >
          {buoy.platform_id}
        </Text>
      )}
    </group>
  );
}

function Glider3DMarker({
  glider,
  isSelected,
  onSelect,
}: {
  glider: ExtraPlatform;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = useMemo(() => latLonToVector3(glider.lat, glider.lon, GLOBE_RADIUS + 0.02), [glider.lat, glider.lon]);
  
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    return q;
  }, [pos]);

  const pulseRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const t = clock.getElapsedTime();
      const scale = 1.0 + 0.3 * Math.sin(t * 3);
      pulseRef.current.scale.set(scale, scale, scale);
    }

    if (glowRef.current) {
      const t = clock.getElapsedTime();
      const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
      if (isSelected || hovered) {
        glowMat.opacity = 0.2 + 0.1 * Math.sin(t * 4);
      } else {
        glowMat.opacity = 0;
      }
    }
  });

  const labelOffset = useMemo(() => new THREE.Vector3(0, 0.08, 0), []);

  return (
    <group position={pos} quaternion={quaternion}>
      {/* Outer glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial
          color="#34d399"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh
        ref={pulseRef}
        castShadow
        receiveShadow
        position={[0, 0.03, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(glider.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <octahedronGeometry args={[0.025, 0]} />
        <meshStandardMaterial
          color={isSelected ? '#ffffff' : '#34d399'}
          emissive="#059669"
          emissiveIntensity={0.6}
          roughness={0.2}
        />
      </mesh>
      
      {/* Invisible Larger Hit Target for Effortless Clicking */}
      <mesh
        position={[0, 0.03, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(glider.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Floating label on hover */}
      {(hovered || isSelected) && (
        <Text
          position={labelOffset}
          fontSize={0.028}
          color="#6ee7b7"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.003}
          outlineColor="#000000"
          font={undefined}
        >
          {glider.name || glider.platform_id}
        </Text>
      )}
    </group>
  );
}

export default function ArgoMarkers({
  profiles,
  extraPlatforms = [],
  platformStatus,
  selectedId,
  onSelect,
}: ArgoMarkersProps) {
  const buoys = extraPlatforms.filter((p) => p.kind === 'buoy');
  const gliders = extraPlatforms.filter((p) => p.kind === 'glider');

  return (
    <group>
      {/* 1. Argo Profiling Floats */}
      {profiles.map((profile) => (
        <SingleBuoy
          key={profile.id}
          profile={profile}
          isSelected={selectedId === profile.id}
          onSelect={onSelect}
          platformStatus={platformStatus}
        />
      ))}

      {/* 2. INCOIS OMNI & RAMA Moored Buoys — live backend positions */}
      {buoys.map((buoy) => (
        <MooredBuoy3DMarker
          key={buoy.id}
          buoy={buoy}
          isSelected={selectedId === buoy.id}
          onSelect={onSelect}
        />
      ))}

      {/* 3. INCOIS Autonomous Gliders — live backend positions */}
      {gliders.map((glider) => (
        <Glider3DMarker
          key={glider.id}
          glider={glider}
          isSelected={selectedId === glider.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
