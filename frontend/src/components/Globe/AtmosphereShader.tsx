/**
 * AtmosphereShader.tsx
 * Fresnel-based atmospheric glow component that creates the iconic "thin blue line"
 * atmosphere effect visible at grazing angles, matching NASA ISS photography.
 *
 * Uses a custom GLSL shader pair:
 * - Vertex shader computes the view-angle intensity via Fresnel approximation
 * - Fragment shader outputs a bright cyan-blue rim glow that intensifies at the
 *   limb (edge) of the globe and fades toward the center
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLOBE_RADIUS } from '../../utils/coordinates';

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uGlowColor;
  uniform vec3 uGlowColor2;
  uniform float uIntensity;
  uniform float uPower;
  uniform float uTime;
  
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - dot(viewDir, vNormal);
    fresnel = pow(fresnel, uPower);
    fresnel *= uIntensity;
    
    // Subtle time-based shimmer for atmospheric scintillation
    float shimmer = 1.0 + 0.04 * sin(uTime * 0.8 + vWorldPosition.y * 3.0);
    fresnel *= shimmer;
    
    // Blend two atmosphere colors — inner cyan, outer deep blue
    vec3 col = mix(uGlowColor, uGlowColor2, pow(fresnel, 0.6));
    
    gl_FragColor = vec4(col, fresnel * 0.85);
  }
`;

export default function AtmosphereShader() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uGlowColor: { value: new THREE.Color('#4fc3f7') },
      uGlowColor2: { value: new THREE.Color('#1565c0') },
      uIntensity: { value: 1.6 },
      uPower: { value: 3.2 },
      uTime: { value: 0.0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
  });

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        uniforms,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [uniforms]
  );

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.015, 64, 64]} />
    </mesh>
  );
}
