/**
 * 3D Globe component using @react-three/fiber.
 * Renders NASA Blue Marble Earth with Fresnel atmospheric rim glow,
 * night-side city lights, cinematic sun lighting with day/night terminator,
 * tactical corner reconnaissance brackets, and active in-situ telemetry beacons.
 *
 * Visual design references:
 * - NASA Worldview (worldview.earthdata.nasa.gov)
 * - Palantir Gotham C2 displays
 * - Google Earth Studio cinematic mode
 */
import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { latLonToVector3, getBayOfBengalCameraPosition, GLOBE_RADIUS } from '../../utils/coordinates';
import AtmosphereShader from './AtmosphereShader';
import NightLights from './NightLights';
import OceanDataLayer from './OceanDataLayer';
import CurrentVectors, { type CurrentVector } from './CurrentVectors';
import ArgoMarkers from './ArgoMarkers';
import SubsurfaceVolumeBlock from './SubsurfaceVolumeBlock';
import CycloneTracks from './CycloneTracks';
import type { HistoricalStorm, LiveStorm } from '../../services/intelApi';
import type { OceanSliceData } from '../../hooks/useOceanData';
import type { ArgoProfileSummary } from '../../types';

interface GlobeProps {
  sliceData?: OceanSliceData | null;
  currentVectors?: CurrentVector[];
  currentSpeedMin?: number;
  currentSpeedMax?: number;
  showCurrents?: boolean;
  argoProfiles?: ArgoProfileSummary[];
  /** Platform markers beyond Argo floats: id, coordinates and display name. */
  extraPlatforms?: { id: string; platform_id: string; lat: number; lon: number; name: string; kind: 'buoy' | 'glider'; warning?: boolean }[];
  /** platform_id -> anomaly status from the fleet-wide analysis; drives marker colors. */
  platformStatus?: Record<string, string>;
  selectedArgoId?: string | null;
  targetCameraPos?: THREE.Vector3 | null;
  probedCoordinate?: { lat: number; lon: number } | null;
  oceanOpacity?: number;
  depthLevels?: number[];
  cameraPitch?: number;
  showVolumetricBlock?: boolean;
  verticalExaggeration?: number;
  onSelectArgo?: (id: string) => void;
  onProbeCoordinate?: (coord: { lat: number; lon: number }) => void;
  onContextMenuCoordinate?: (coord: { lat: number; lon: number }) => void;
  onHoverCoordinate?: (coord: { lat: number; lon: number } | null) => void;
  onCameraFlightComplete?: () => void;
  /** Real cyclone tracks (IBTrACS history + GDACS live) */
  showCyclones?: boolean;
  cycloneHistory?: HistoricalStorm[];
  cycloneLive?: LiveStorm[];
  selectedCycloneSid?: string | null;
}


/** Earth fallback while satellite textures load */
function EarthFallback() {
  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 32, 32]} />
      <meshStandardMaterial color="#061224" roughness={0.8} />
    </mesh>
  );
}

/** Enhanced Earth mesh with satellite textures and improved material */
function EarthMesh() {
  const [colorMap, specularMap, normalMap] = useTexture([
    '/textures/earth_atmos_2048.jpg',
    '/textures/earth_specular_2048.jpg',
    '/textures/earth_normal_2048.jpg',
  ]);

  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = 8;

  return (
    <mesh renderOrder={1}>
      <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
      <meshStandardMaterial
        map={colorMap}
        roughnessMap={specularMap}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(1.2, 1.2)}
        roughness={0.5}
        metalness={0.05}
        envMapIntensity={0.8}
      />
    </mesh>
  );
}

function Earth() {
  return (
    <Suspense fallback={<EarthFallback />}>
      <EarthMesh />
    </Suspense>
  );
}

/**
 * Cinematic sun that slowly orbits the scene, creating a natural
 * day/night terminator across the globe. The sun direction vector
 * is shared with NightLights to synchronize city glow appearance.
 */
function CinematicSun({ sunDirRef }: { sunDirRef: React.MutableRefObject<THREE.Vector3> }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Very slow orbit: nearly imperceptible, keeps Indian Ocean lit
    // Base position illuminates lat ~14°N, lon ~78°E (Indian Peninsula)
    const angle = t * 0.008; // ~13 minute revolution — practically static during demo
    const x = Math.cos(angle) * 15 + 5;
    const z = Math.sin(angle) * 10 + 8;
    const y = 10 + Math.sin(angle * 0.3) * 2;

    if (lightRef.current) {
      lightRef.current.position.set(x, y, z);
    }

    // Update shared sun direction for NightLights shader
    sunDirRef.current.set(x, y, z).normalize();
  });

  return (
    <>
      <directionalLight
        ref={lightRef}
        position={[20, 10, 8]}
        intensity={2.4}
        color="#fff8f0"
      />
      {/* Cool fill light from opposite hemisphere — prevents pure black shadows */}
      <directionalLight position={[-10, -3, -8]} intensity={0.6} color="#90caf9" />
    </>
  );
}

/** Subtle lat/lon coordinate grid lines with cleaner styling */
function GridLines() {
  const material = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: '#38bdf8',
        opacity: 0.09,
        transparent: true,
        dashSize: 0.06,
        gapSize: 0.04,
      }),
    []
  );

  const lines = useMemo(() => {
    const group: React.ReactNode[] = [];
    // Latitude lines every 15° for cleaner look
    for (let lat = -75; lat <= 75; lat += 15) {
      const points: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 3) {
        points.push(latLonToVector3(lat, lon, GLOBE_RADIUS + 0.003));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, material);
      line.computeLineDistances();
      group.push(<primitive key={`lat-${lat}`} object={line} />);
    }
    // Longitude lines every 15°
    for (let lon = -180; lon < 180; lon += 15) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        points.push(latLonToVector3(lat, lon, GLOBE_RADIUS + 0.003));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, material);
      line.computeLineDistances();
      group.push(<primitive key={`lon-${lon}`} object={line} />);
    }
    return group;
  }, [material]);

  return <>{lines}</>;
}

/** Tactical surveillance boundary and corner brackets for Indian Ocean domain */
function TacticalSurveillanceGrid() {
  const bracketMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#00f0ff',
        opacity: 0.85,
        transparent: true,
      }),
    []
  );

  const borderMaterial = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: '#0ea5e9',
        opacity: 0.3,
        transparent: true,
        dashSize: 0.08,
        gapSize: 0.04,
      }),
    []
  );

  const { bracketGeo, borderGeo } = useMemo(() => {
    const bracketPoints: THREE.Vector3[] = [];
    const borderPoints: THREE.Vector3[] = [];

    const corners = [
      { lat: 0, lon: 60, dLat: 2.5, dLon: 2.5 },
      { lat: 0, lon: 100, dLat: 2.5, dLon: -2.5 },
      { lat: 28, lon: 60, dLat: -2.5, dLon: 2.5 },
      { lat: 28, lon: 100, dLat: -2.5, dLon: -2.5 },
    ];

    corners.forEach((c) => {
      const pCorner = latLonToVector3(c.lat, c.lon, GLOBE_RADIUS + 0.012);
      const pLat = latLonToVector3(c.lat + c.dLat, c.lon, GLOBE_RADIUS + 0.012);
      const pLon = latLonToVector3(c.lat, c.lon + c.dLon, GLOBE_RADIUS + 0.012);

      bracketPoints.push(pLat, pCorner);
      bracketPoints.push(pCorner, pLon);
    });

    // Perimeter boundary line connecting the surveillance zone
    for (let lon = 60; lon <= 100; lon += 2) {
      borderPoints.push(latLonToVector3(28, lon, GLOBE_RADIUS + 0.01));
    }
    for (let lat = 28; lat >= 0; lat -= 2) {
      borderPoints.push(latLonToVector3(lat, 100, GLOBE_RADIUS + 0.01));
    }
    for (let lon = 100; lon >= 60; lon -= 2) {
      borderPoints.push(latLonToVector3(0, lon, GLOBE_RADIUS + 0.01));
    }
    for (let lat = 0; lat <= 28; lat += 2) {
      borderPoints.push(latLonToVector3(lat, 60, GLOBE_RADIUS + 0.01));
    }

    const bGeo = new THREE.BufferGeometry().setFromPoints(bracketPoints);
    const pGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    return { bracketGeo: bGeo, borderGeo: pGeo };
  }, []);

  const borderLine = useMemo(() => {
    const line = new THREE.Line(borderGeo, borderMaterial);
    line.computeLineDistances();
    return line;
  }, [borderGeo, borderMaterial]);

  return (
    <group>
      <primitive object={new THREE.LineSegments(bracketGeo, bracketMaterial)} />
      <primitive object={borderLine} />
    </group>
  );
}

/** Smoothly lerps camera position when user selects a sector or float */
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function CameraLerpController({
  targetPosition,
  onComplete,
  groupRef,
}: {
  targetPosition?: THREE.Vector3 | null;
  onComplete?: () => void;
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const { camera } = useThree();
  const completedRef = React.useRef(false);
  const previousTargetRef = React.useRef<THREE.Vector3 | null>(null);
  const worldTarget = React.useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (targetPosition) {
      if (previousTargetRef.current !== targetPosition) {
        previousTargetRef.current = targetPosition;
        completedRef.current = false;
      }
      // Targets are lat/lon positions on the un-rotated globe; the globe group
      // may have idled into a rotation, so rotate the target with it.
      worldTarget.current.copy(targetPosition).applyAxisAngle(Y_AXIS, groupRef.current?.rotation.y ?? 0);
      camera.position.lerp(worldTarget.current, Math.min(1, delta * 3.2));
      if (!completedRef.current && camera.position.distanceTo(worldTarget.current) < 0.025) {
        completedRef.current = true;
        onComplete?.();
      }
    } else {
      previousTargetRef.current = null;
      completedRef.current = false;
    }
  });
  return null;
}

/**
 * Tactical crosshair probe reticle with rotating outer ring,
 * scanning sweepline, and radial anchor lines.
 */
function ProbeReticle({ coordinate }: { coordinate: { lat: number; lon: number } }) {
  const pos = latLonToVector3(coordinate.lat, coordinate.lon, GLOBE_RADIUS + 0.016);
  const outerRingRef = useRef<THREE.Mesh>(null);
  const sweepRef = useRef<THREE.Mesh>(null);
  const pulseRingRef = useRef<THREE.Mesh>(null);

  // Orient the reticle to face outward from globe surface
  const orientation = useMemo(() => {
    const normal = pos.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return new THREE.Euler().setFromQuaternion(quat);
  }, [pos]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Rotating outer targeting ring (2 RPM)
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = t * 0.8;
    }

    // Scanning sweepline rotation (faster)
    if (sweepRef.current) {
      sweepRef.current.rotation.z = -t * 2.5;
    }

    // Pulsing expansion ring
    if (pulseRingRef.current) {
      const pulse = (t * 1.2) % 2.0;
      const scale = 1.0 + pulse * 0.8;
      pulseRingRef.current.scale.set(scale, scale, scale);
      const mat = pulseRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.6 - pulse * 0.3);
    }
  });

  // Create the scanning wedge (sweepline) geometry
  const sweepGeo = useMemo(() => {
    const shape = new THREE.Shape();
    const angle = Math.PI / 8; // 22.5° wedge
    shape.moveTo(0, 0);
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
      const a = -angle / 2 + (angle * i) / segments;
      shape.lineTo(Math.cos(a) * 0.04, Math.sin(a) * 0.04);
    }
    shape.lineTo(0, 0);
    return new THREE.ShapeGeometry(shape);
  }, []);

  // Crosshair lines (4 radial arms)
  const crosshairLines = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const innerR = 0.018;
    const outerR = 0.05;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      points.push(
        new THREE.Vector3(Math.cos(angle) * innerR, Math.sin(angle) * innerR, 0),
        new THREE.Vector3(Math.cos(angle) * outerR, Math.sin(angle) * outerR, 0)
      );
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <group position={pos} rotation={orientation}>
      {/* Rotating outer segmented targeting ring */}
      <mesh ref={outerRingRef}>
        <ringGeometry args={[0.038, 0.044, 32, 1, 0, Math.PI * 1.5]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Inner solid ring */}
      <mesh>
        <ringGeometry args={[0.015, 0.018, 24]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Scanning sweepline wedge */}
      <mesh ref={sweepRef} geometry={sweepGeo}>
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Pulsing expansion ring */}
      <mesh ref={pulseRingRef}>
        <ringGeometry args={[0.04, 0.045, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Crosshair radial arms */}
      <primitive
        object={new THREE.LineSegments(
          crosshairLines,
          new THREE.LineBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.65 })
        )}
      />

      {/* Center beacon dot */}
      <mesh position={[0, 0, 0.002]}>
        <sphereGeometry args={[0.008, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

/**
 * Idle auto-rotation controller.
 * Slowly rotates the globe group when the user hasn't interacted for a few seconds.
 * Pauses immediately on any orbit control interaction.
 */
function AutoRotation({ groupRef, flightActive }: { groupRef: React.RefObject<THREE.Group | null>; flightActive: boolean }) {
  const idleTimeRef = useRef(0);
  const lastCamPosRef = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    if (!groupRef.current) return;

    // Hold the globe still while the camera is flying to a target.
    if (flightActive) {
      idleTimeRef.current = 0;
      lastCamPosRef.current.copy(camera.position);
      return;
    }

    // Detect if camera moved (user interaction)
    const camMoved = camera.position.distanceTo(lastCamPosRef.current) > 0.001;
    lastCamPosRef.current.copy(camera.position);

    if (camMoved) {
      idleTimeRef.current = 0;
    } else {
      idleTimeRef.current += delta;
    }

    // Start slow rotation after 4 seconds of idle
    if (idleTimeRef.current > 4.0) {
      const rampUp = Math.min(1, (idleTimeRef.current - 4.0) / 3.0);
      groupRef.current.rotation.y += 0.0004 * rampUp * delta * 60;
    }
  });

  return null;
}

/** Main Globe component */
export default function Globe({
  sliceData,
  currentVectors = [],
  currentSpeedMin = 0,
  currentSpeedMax = 0.2,
  showCurrents = false,
  argoProfiles = [],
  extraPlatforms = [],
  platformStatus,
  selectedArgoId = null,
  targetCameraPos = null,
  probedCoordinate = null,
  oceanOpacity = 0.82,
  depthLevels = [0, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500],
  cameraPitch = 50,
  showVolumetricBlock = true,
  verticalExaggeration = 1.0,
  onSelectArgo,
  onProbeCoordinate,
  onContextMenuCoordinate,
  onHoverCoordinate,
  onCameraFlightComplete,
  showCyclones = false,
  cycloneHistory = [],
  cycloneLive = [],
  selectedCycloneSid = null,
}: GlobeProps) {
  const cameraPos = getBayOfBengalCameraPosition(6.8);
  const sunDirRef = useRef(new THREE.Vector3(1, 0.3, 0.5).normalize());
  const globeGroupRef = useRef<THREE.Group>(null);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{
          position: [cameraPos.x, cameraPos.y, cameraPos.z],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.5,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        {/* Bright, clear lighting — Indian Ocean always well-lit */}
        <ambientLight intensity={0.55} color="#e3f2fd" />
        <hemisphereLight args={['#b3e5fc', '#1a237e', 0.45]} />
        <CinematicSun sunDirRef={sunDirRef} />

        {/* Deep space starfield — cinematic density */}
        <Stars radius={85} depth={60} count={8000} factor={4.5} fade speed={0.3} />

        {/* Dynamic Smooth Camera Transition */}
        <CameraLerpController targetPosition={targetCameraPos} onComplete={onCameraFlightComplete} groupRef={globeGroupRef} />

        {/* Main globe group with idle auto-rotation */}
        <group ref={globeGroupRef}>
          <AutoRotation groupRef={globeGroupRef} flightActive={targetCameraPos !== null} />

          {/* NASA Earth Globe with enhanced textures */}
          <Earth />

          {/* Fresnel atmospheric rim glow */}
          <AtmosphereShader />

          {/* NASA Earth at Night city lights on dark hemisphere */}
          <NightLights sunDirection={sunDirRef.current} />

          {/* Lat/Lon Coordinate Graticule — dashed style */}
          <GridLines />

          {/* Tactical Indian Ocean Surveillance Boundary Grid */}
          <TacticalSurveillanceGrid />

          {/* Ocean Data Layer with soft edge feathering, click probe, and 60 FPS hover */}
          {sliceData && (
            <OceanDataLayer
              data={sliceData}
              opacity={oceanOpacity}
              onProbe={onProbeCoordinate}
              onContextMenu={onContextMenuCoordinate}
              onHoverCoord={onHoverCoordinate}
            />
          )}

          {/* Tactical Coordinate Probe Reticle */}
          {probedCoordinate && <ProbeReticle coordinate={probedCoordinate} />}

          {/* 3D Subsurface Water Column Depth Slabs */}
          {probedCoordinate && sliceData && (
            <SubsurfaceVolumeBlock
              coordinate={probedCoordinate}
              depthLevels={depthLevels}
              currentDepth={sliceData.depth}
              variable={sliceData.variable}
              verticalExaggeration={verticalExaggeration}
              visible={showVolumetricBlock}
            />
          )}

          {/* 3D Current Vector Directional Cones */}
          {showCurrents && (
            <CurrentVectors
              vectors={currentVectors}
              speedMin={currentSpeedMin}
              speedMax={currentSpeedMax}
              visible={showCurrents}
              liveStorms={cycloneLive}
            />
          )}

          {/* Real cyclone tracks: IBTrACS history + GDACS live/forecast */}
          {showCyclones && (cycloneHistory.length > 0 || cycloneLive.length > 0) && (
            <CycloneTracks historical={cycloneHistory} live={cycloneLive} selectedSid={selectedCycloneSid} />
          )}

          {/* In-Situ Argo Buoys with Radar Sonar Pings */}
          {argoProfiles.length > 0 && onSelectArgo && (
            <ArgoMarkers
              profiles={argoProfiles}
              extraPlatforms={extraPlatforms}
              platformStatus={platformStatus}
              selectedId={selectedArgoId}
              onSelect={onSelectArgo}
            />
          )}
        </group>

        {/* Camera Controls with Dynamic Google Earth Pitch */}
        <OrbitControls
          enablePan
          enableDamping
          dampingFactor={0.08}
          minDistance={4.0}
          maxDistance={12}
          minPolarAngle={THREE.MathUtils.degToRad(Math.max(15, 90 - cameraPitch))}
          maxPolarAngle={THREE.MathUtils.degToRad(Math.min(130, 90 + cameraPitch))}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
