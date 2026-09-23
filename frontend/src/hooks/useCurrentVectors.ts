/**
 * useCurrentVectors — Fetches ocean current vector data for arrow visualization.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentVectors } from '../services/api';
import type { CurrentVector } from '../components/Globe/CurrentVectors';

export interface UseCurrentVectorsReturn {
  vectors: CurrentVector[];
  speedMin: number;
  speedMax: number;
  loading: boolean;
  visible: boolean;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCurrentVectors(
  depth: number,
  timeIndex: number
): UseCurrentVectorsReturn {
  const [vectors, setVectors] = useState<CurrentVector[]>([]);
  const [speedMin, setSpeedMin] = useState(0);
  const [speedMax, setSpeedMax] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const requestIdRef = useRef(0);

  const fetchVectors = useCallback(async () => {
    if (!visible) return;

    const currentId = ++requestIdRef.current;
    setLoading(true);

    try {
      const data = await getCurrentVectors(depth, timeIndex, 5);
      if (currentId !== requestIdRef.current) return;

      setVectors(data.vectors);
      setSpeedMin(data.speed_min);
      setSpeedMax(data.speed_max);
    } catch (err) {
      console.warn('Failed to fetch current vectors:', err);
    } finally {
      if (currentId === requestIdRef.current) setLoading(false);
    }
  }, [depth, timeIndex, visible]);

  useEffect(() => {
    fetchVectors();
  }, [fetchVectors]);

  return { vectors, speedMin, speedMax, loading, visible, setVisible };
}
