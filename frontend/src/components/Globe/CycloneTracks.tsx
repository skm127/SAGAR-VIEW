/**
 * CycloneTracks — real cyclone tracks on the globe.
 *
 * - Historical: IBTrACS v04r01 best tracks, each segment colored by the
 *   JTWC 1-min max wind (Saffir–Simpson classes); rapid-intensification (RI)
 *   onset points are marked with a ring.
 * - Live: GDACS observed track (solid, bright) + forecast track (dashed).
 * The selected storm is drawn brighter with per-fix markers.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { latLonToVector3, GLOBE_RADIUS } from '../../utils/coordinates';
import type { HistoricalStorm, LiveStorm } from '../../services/intelApi';

const R = GLOBE_RADIUS + 0.022;

export function windColor(kt: number | null | undefined): THREE.Color {
  if (kt == null) return new THREE.Color('#94a3b8');
  if (kt < 34) return new THREE.Color('#7dd3fc');
  if (kt < 64) return new THREE.Color('#34d399');
  if (kt < 83) return new THREE.Color('#facc15');
  if (kt < 96) return new THREE.Color('#fb923c');
  if (kt < 113) return new THREE.Color('#f97316');
  if (kt < 137) return new THREE.Color('#ef4444');
  return new THREE.Color('#d946ef');
}

function trackSegments(storm: HistoricalStorm, dim: number) {
  const pos: number[] = [];
  const col: number[] = [];
  const pts = storm.track.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = latLonToVector3(pts[i].lat, pts[i].lon, R);
    const b = latLonToVector3(pts[i + 1].lat, pts[i + 1].lon, R);
    const c = windColor(pts[i + 1].wind_kt ?? pts[i].wind_kt).multiplyScalar(dim);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

interface Props {
  historical: HistoricalStorm[];
  live: LiveStorm[];
  selectedSid?: string | null;
}

export default function CycloneTracks({ historical, live, selectedSid }: Props) {
  const histObjects = useMemo(() => {
    return historical.map((s) => {
      const selected = s.sid === selectedSid;
      const geo = trackSegments(s, selected ? 1.0 : 0.55);
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: selected ? 1.0 : selectedSid ? 0.18 : 0.55,
        depthWrite: false,
      });
      return { sid: s.sid, line: new THREE.LineSegments(geo, mat), selected, storm: s };
    });
  }, [historical, selectedSid]);

  const liveObjects = useMemo(() => {
    return live.map((s) => {
      const observed = s.track.filter((p) => !p.forecast);
      const forecast = s.track.filter((p, i, arr) => p.forecast || (i < arr.length - 1 && arr[i + 1].forecast));
      const mk = (pts: typeof s.track, dashed: boolean) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => latLonToVector3(p.lat, p.lon, R + 0.004)));
        const mat = dashed
          ? new THREE.LineDashedMaterial({ color: '#f472b6', dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.95 })
          : new THREE.LineBasicMaterial({ color: '#f43f5e', transparent: true, opacity: 1.0 });
        const line = new THREE.Line(geo, mat);
        if (dashed) line.computeLineDistances();
        return line;
      };
      const head = s.track.filter((p) => !p.forecast).slice(-1)[0] ?? { lat: s.lat, lon: s.lon };
      return {
        id: s.event_id,
        observed: observed.length > 1 ? mk(observed, false) : null,
        forecast: forecast.length > 1 ? mk(forecast, true) : null,
        head: latLonToVector3(head.lat, head.lon, R + 0.006),
      };
    });
  }, [live]);

  return (
    <group>
      {histObjects.map((o) => (
        <group key={o.sid}>
          <primitive object={o.line} />
          {o.storm.ri && (
            <mesh position={latLonToVector3(o.storm.ri.lat, o.storm.ri.lon, R + 0.003)}>
              <sphereGeometry args={[o.selected ? 0.012 : 0.006, 12, 12]} />
              <meshBasicMaterial color="#f97316" transparent opacity={o.selected ? 1 : selectedSid ? 0.25 : 0.8} />
            </mesh>
          )}
          {o.selected &&
            o.storm.track
              .filter((_, i) => i % 2 === 0)
              .map((p, i) => (
                <mesh key={i} position={latLonToVector3(p.lat, p.lon, R + 0.002)}>
                  <sphereGeometry args={[0.0045, 8, 8]} />
                  <meshBasicMaterial color={windColor(p.wind_kt)} />
                </mesh>
              ))}
        </group>
      ))}
      {liveObjects.map((o) => (
        <group key={o.id}>
          {o.observed && <primitive object={o.observed} />}
          {o.forecast && <primitive object={o.forecast} />}
          <mesh position={o.head}>
            <sphereGeometry args={[0.016, 16, 16]} />
            <meshBasicMaterial color="#f43f5e" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
