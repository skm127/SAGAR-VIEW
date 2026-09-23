/**
 * NightLights.tsx
 * Night-side city lights layer using NASA Earth at Night (Black Marble) imagery.
 * Uses a custom shader that blends in city light emission only on the dark
 * hemisphere of the globe, determined by dot-product with sun direction.
 *
 * The result is warm city glow visible on the night side while the sunlit
 * hemisphere shows the standard albedo texture naturally.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { GLOBE_RADIUS } from '../../utils/coordinates';

const NIGHTLIGHTS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NIGHTLIGHTS_FRAGMENT = /* glsl */ `
  uniform sampler2D uNightMap;
  uniform vec3 uSunDirection;
  uniform float uIntensity;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  
  void main() {
    // How much this fragment faces the sun (1.0 = full sun, -1.0 = full dark)
    float sunDot = dot(vWorldNormal, uSunDirection);
    
    // Smooth transition at the terminator line (avoid harsh cutoff)
    // nightFactor = 1.0 on full dark side, 0.0 on full sun side
    float nightFactor = smoothstep(0.08, -0.25, sunDot);
    
    vec4 nightColor = texture2D(uNightMap, vUv);
    
    // Tone down city light warmth to avoid blowing out
    vec3 warmLights = nightColor.rgb * vec3(1.0, 0.9, 0.8);
    
    float luminance = dot(warmLights, vec3(0.299, 0.587, 0.114));
    float alpha = nightFactor * luminance * uIntensity;
    
    gl_FragColor = vec4(warmLights * (uIntensity * 0.7), alpha);
  }
`;

interface NightLightsProps {
  sunDirection?: THREE.Vector3;
}

function NightLightsInner({ sunDirection }: NightLightsProps) {
  const nightMap = useTexture('/textures/earth_nightlights_2048.jpg');
  const meshRef = useRef<THREE.Mesh>(null);

  nightMap.colorSpace = THREE.SRGBColorSpace;

  const sunDir = useMemo(
    () => sunDirection?.clone().normalize() || new THREE.Vector3(1, 0.3, 0.5).normalize(),
    [sunDirection]
  );

  const uniforms = useMemo(
    () => ({
      uNightMap: { value: nightMap },
      uSunDirection: { value: sunDir },
      uIntensity: { value: 1.6 },
    }),
    [nightMap, sunDir]
  );

  // Keep sun direction synced
  useFrame(() => {
    if (sunDirection) {
      uniforms.uSunDirection.value.copy(sunDirection).normalize();
    }
  });

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NIGHTLIGHTS_VERTEX,
        fragmentShader: NIGHTLIGHTS_FRAGMENT,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [uniforms]
  );

  return (
    <mesh ref={meshRef} material={material} renderOrder={2}>
      <sphereGeometry args={[GLOBE_RADIUS + 0.003, 96, 96]} />
    </mesh>
  );
}

import { Suspense } from 'react';

export default function NightLights(props: NightLightsProps) {
  return (
    <Suspense fallback={null}>
      <NightLightsInner {...props} />
    </Suspense>
  );
}
