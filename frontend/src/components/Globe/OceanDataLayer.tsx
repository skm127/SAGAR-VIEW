/**
 * OceanDataLayer — Renders ocean model data as a colored texture overlay
 * on the globe surface. This is the core visualization component.
 *
 * Technical approach:
 * 1. Receive a Float32Array of values + metadata from the API
 * 2. Convert values → RGBA pixels using a scientific colormap
 * 3. Create a THREE.DataTexture from the RGBA data
 * 4. Map the texture onto a curved surface patch at the Bay of Bengal coordinates
 */
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { latLonToVector3, vector3ToLatLon, GLOBE_RADIUS } from '../../utils/coordinates';
import { valuesToRGBA, getColormap } from '../../utils/colormap';
import type { OceanSliceData } from '../../hooks/useOceanData';

interface OceanDataLayerProps {
  data: OceanSliceData;
  opacity?: number;
  onProbe?: (coord: { lat: number; lon: number }) => void;
  onContextMenu?: (coord: { lat: number; lon: number }) => void;
  onHoverCoord?: (coord: { lat: number; lon: number } | null) => void;
}

export default function OceanDataLayer({
  data,
  opacity = 0.85,
  onProbe,
  onContextMenu,
  onHoverCoord,
}: OceanDataLayerProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create the curved surface geometry for the data region
  const geometry = useMemo(() => {
    const latMin = data.latMin;
    const latMax = data.latMax;
    const lonMin = data.lonMin;
    const lonMax = data.lonMax;

    // Match geometry resolution to data resolution for accurate mapping
    const latSteps = Math.min(data.height, 100);
    const lonSteps = Math.min(data.width, 100);

    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= latSteps; i++) {
      for (let j = 0; j <= lonSteps; j++) {
        const lat = latMin + (latMax - latMin) * (i / latSteps);
        const lon = lonMin + (lonMax - lonMin) * (j / lonSteps);
        // Positioned cleanly above globe surface to prevent z-fighting
        const pos = latLonToVector3(lat, lon, GLOBE_RADIUS + 0.014);
        vertices.push(pos.x, pos.y, pos.z);
        // UV: j maps to longitude (u), i maps to latitude (v)
        // Note: texture row 0 = lat_min (bottom of data), so v = i/latSteps
        uvs.push(j / lonSteps, i / latSteps);
      }
    }

    for (let i = 0; i < latSteps; i++) {
      for (let j = 0; j < lonSteps; j++) {
        const a = i * (lonSteps + 1) + j;
        const b = a + lonSteps + 1;
        // Counter-clockwise winding so normals point outward towards space
        indices.push(a, a + 1, b);
        indices.push(a + 1, b + 1, b);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [data.latMin, data.latMax, data.lonMin, data.lonMax, data.height, data.width]);

  // Create DataTexture whenever data or opacity changes
  const texture = useMemo(() => {
    if (!data.values || data.values.length === 0) return null;
    const colormap = getColormap(data.variable);
    const rgba = valuesToRGBA(
      data.values,
      colormap,
      data.vMin,
      data.vMax,
      opacity,
      data.width,
      data.height,
      6
    );

    const tex = new THREE.DataTexture(
      rgba,
      data.width,
      data.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }, [data.values, data.width, data.height, data.vMin, data.vMax, data.variable, opacity]);

  useEffect(() => {
    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, [texture]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (e.point && onProbe) {
      const coord = vector3ToLatLon(e.point);
      onProbe(coord);
    }
  };

  const handleContextMenu = (e: any) => {
    e.stopPropagation();
    if (e.nativeEvent) {
      e.nativeEvent.preventDefault();
    }
    if (e.point && onContextMenu) {
      const coord = vector3ToLatLon(e.point);
      onContextMenu(coord);
    }
  };

  const handlePointerMove = (e: any) => {
    e.stopPropagation();
    if (e.point && onHoverCoord) {
      const coord = vector3ToLatLon(e.point);
      onHoverCoord(coord);
    }
  };

  const handlePointerOut = () => {
    if (onHoverCoord) {
      onHoverCoord(null);
    }
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      renderOrder={5}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      <meshBasicMaterial
        map={texture ?? undefined}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
