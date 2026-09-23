/**
 * Custom hook for fetching and managing ocean model data from the API.
 * Handles loading states, binary data parsing, and reactive updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getModelSlice, getModelInfo, getTimeInfo } from '../services/api';
import type { OceanVariable, DatasetInfo } from '../types';

export interface OceanSliceData {
  values: Float32Array;
  width: number;
  height: number;
  vMin: number;
  vMax: number;
  variable: string;
  depth: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface UseOceanDataReturn {
  sliceData: OceanSliceData | null;
  datasetInfo: DatasetInfo | null;
  loading: boolean;
  error: string | null;
  variable: OceanVariable;
  depth: number;
  timeIndex: number;
  depthLevels: number[];
  timeSteps: number;
  dates: string[];
  setVariable: (v: OceanVariable) => void;
  setDepth: (d: number) => void;
  /** Accepts a value or functional updater (needed by TimeAnimator's rapid-step handling). */
  setTimeIndex: (t: number | ((prev: number) => number)) => void;
}

export function useOceanData(): UseOceanDataReturn {
  const [sliceData, setSliceData] = useState<OceanSliceData | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variable, setVariable] = useState<OceanVariable>('thetao');
  const [depth, setDepth] = useState<number>(0);
  const [timeIndex, setTimeIndex] = useState<number>(0);

  // Track the latest request to avoid race conditions
  const requestIdRef = useRef(0);

  // Fetch dataset info and dates on mount
  useEffect(() => {
    getModelInfo()
      .then((info) => setDatasetInfo(info))
      .catch((err) => {
        console.warn('Could not fetch model info:', err.message);
      });

    getTimeInfo()
      .then((tInfo) => {
        if (tInfo && tInfo.dates) {
          setDates(tInfo.dates);
          setTimeIndex(Math.max(0, tInfo.dates.length - 1));
        }
      })
      .catch((err) => {
        console.warn('Could not fetch time info:', err.message);
      });
  }, []);

  // Derived values from dataset info
  const depthLevels = datasetInfo?.depth_levels ?? [0, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  const timeSteps = datasetInfo?.time_steps ?? 7;

  // Fetch data slice whenever variable, depth, or timeIndex changes
  const fetchSlice = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, metadata } = await getModelSlice(variable, depth, timeIndex);

      // Only update if this is still the latest request
      if (currentRequestId !== requestIdRef.current) return;

      const slice: OceanSliceData = {
        values: data,
        width: parseInt(metadata['x-width'] || '0'),
        height: parseInt(metadata['x-height'] || '0'),
        vMin: parseFloat(metadata['x-min'] || '0'),
        vMax: parseFloat(metadata['x-max'] || '0'),
        variable: metadata['x-variable'] || variable,
        depth: parseFloat(metadata['x-depth'] || '0'),
        latMin: parseFloat(metadata['x-lat-min'] || '0'),
        latMax: parseFloat(metadata['x-lat-max'] || '28'),
        lonMin: parseFloat(metadata['x-lon-min'] || '60'),
        lonMax: parseFloat(metadata['x-lon-max'] || '100'),
      };

      setSliceData(slice);
    } catch (err: any) {
      if (currentRequestId !== requestIdRef.current) return;
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch data';
      setError(msg);
      console.error('Fetch slice error:', msg);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [variable, depth, timeIndex]);

  useEffect(() => {
    fetchSlice();
  }, [fetchSlice]);

  return {
    sliceData,
    datasetInfo,
    loading,
    error,
    variable,
    depth,
    timeIndex,
    depthLevels,
    timeSteps,
    dates,
    setVariable,
    setDepth,
    setTimeIndex,
  };
}
