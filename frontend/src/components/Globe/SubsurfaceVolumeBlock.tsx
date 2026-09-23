/**
 * SubsurfaceVolumeBlock.tsx
 * Renders 3D volumetric ocean water column slabs and vertical sounding depth column:
 * - Multi-depth translucent horizontal horizon discs/plates (0m, 50m, 100m, 200m, 500m)
 * - Laser sounding depth beam penetrating through the water column
 * - Subsurface depth boundary cage with depth rings and live depth tag
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { latLonToVector3, GLOBE_RADIUS } from '../../utils/coordinates';
import { getColormapColor } from '../../utils/colormap';

interface SubsurfaceVolumeBlockProps {
  coordinate: { lat: number; lon: number };
  depthLevels: number[];
  currentDepth: number;
  variable: string;
  verticalExaggeration?: number;
  visible?: boolean;
}

export const SubsurfaceVolumeBlock: React.FC<SubsurfaceVolumeBlockProps> = ({
  coordinate,
  depthLevels,
  currentDepth,
  variable,
  verticalExaggeration = 1.0,
  visible = true,
}) => {
  if (!visible) return null;

  const { lat, lon } = coordinate;

  // Render depth levels down through the globe crust (subsurface)
  const layers = useMemo(() => {
    // Select key depth markers from available depth levels or defaults
    const keyMarkers = [0, 50, 100, 200, 500];
    const targetDepths = depthLevels.filter((d) => keyMarkers.includes(d) || Math.abs(d - currentDepth) < 10);
    const resolvedDepths = Array.from(new Set(targetDepths.length > 0 ? targetDepths : keyMarkers)).sort((a, b) => a - b);
    const maxD = resolvedDepths[resolvedDepths.length - 1] || 500;

    return resolvedDepths.map((d) => {
      // Subsurface offset radius: surface is GLOBE_RADIUS + 0.01, 500m depth is GLOBE_RADIUS - 0.25 * exaggeration
      const depthRatio = d / maxD;
      const depthOffset = (depthRatio * 0.32) * verticalExaggeration;
      const r = (GLOBE_RADIUS + 0.01) - depthOffset;
      const center = latLonToVector3(lat, lon, r);

      // Temperature gradient representation (warm top, cool bottom)
      const normVal = Math.max(0, Math.min(1, 1 - depthRatio * 0.85));
      const col = getColormapColor(variable, normVal);
      const threeCol = new THREE.Color(col.r, col.g, col.b);

      const isCurrent = Math.abs(currentDepth - d) < 30;

      return {
        depth: d,
        radius: r,
        center,
        color: threeCol,
        isCurrent,
      };
    });
  }, [lat, lon, variable, verticalExaggeration, currentDepth]);

  // Construct vertical sounding line through all depth layers
  const soundingLine = useMemo(() => {
    if (layers.length < 2) return null;
    const top = layers[0].center;
    const bottom = layers[layers.length - 1].center;
    const geo = new THREE.BufferGeometry().setFromPoints([top, bottom]);
    const mat = new THREE.LineBasicMaterial({
      color: '#00E5FF',
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
    });
    return new THREE.Line(geo, mat);
  }, [layers]);

  // Bounding cylinder / water column cage
  const cagePillars = useMemo(() => {
    if (layers.length < 2) return [];
    const topR = layers[0].radius;
    const botR = layers[layers.length - 1].radius;
    const offsets = [
      { dLat: 0.7, dLon: 0.7 },
      { dLat: -0.7, dLon: 0.7 },
      { dLat: -0.7, dLon: -0.7 },
      { dLat: 0.7, dLon: -0.7 },
    ];

    const lines: THREE.Line[] = [];
    const mat = new THREE.LineBasicMaterial({
      color: '#0284c7',
      transparent: true,
      opacity: 0.35,
    });

    offsets.forEach((off) => {
      const pTop = latLonToVector3(lat + off.dLat, lon + off.dLon, topR);
      const pBot = latLonToVector3(lat + off.dLat, lon + off.dLon, botR);
      const geo = new THREE.BufferGeometry().setFromPoints([pTop, pBot]);
      lines.push(new THREE.Line(geo, mat));
    });

    return lines;
  }, [lat, lon, layers]);

  return (
    <group>
      {/* Sounding ray penetrating the water column */}
      {soundingLine && <primitive object={soundingLine} />}

      {/* Water column corner cage pillars */}
      {cagePillars.map((line, idx) => (
        <primitive key={`pillar-${idx}`} object={line} />
      ))}

      {/* Depth Horizon Plates */}
      {layers.map((layer) => {
        // Normal pointing from globe center outwards
        const normal = layer.center.clone().normalize();
        const rot = new THREE.Euler();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        rot.setFromQuaternion(quat);

        return (
          <group key={`depth-slab-${layer.depth}`} position={layer.center} rotation={rot}>
            {/* Outer glowing boundary ring */}
            <mesh>
              <ringGeometry args={[0.07, 0.08, 32]} />
              <meshBasicMaterial
                color={layer.isCurrent ? '#00E5FF' : layer.color}
                transparent
                opacity={layer.isCurrent ? 0.95 : 0.4}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Inner translucent depth slab disc */}
            <mesh>
              <circleGeometry args={[0.07, 32]} />
              <meshBasicMaterial
                color={layer.color}
                transparent
                opacity={layer.isCurrent ? 0.5 : 0.22}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>

            {/* Center node */}
            <mesh position={[0, 0, 0.002]}>
              <sphereGeometry args={[layer.isCurrent ? 0.012 : 0.006, 12, 12]} />
              <meshBasicMaterial color={layer.isCurrent ? '#FFFFFF' : '#00E5FF'} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

export default SubsurfaceVolumeBlock;
