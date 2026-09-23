import { useState, useEffect, useRef } from 'react';
import type { LiveOceanResponse, LiveFleetResponse } from '../types';

interface LiveFeedState {
  oceanData: LiveOceanResponse | null;
  fleetData: LiveFleetResponse | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastUpdated: string | null;
  error: string | null;
}

export function useLiveFeed() {
  const [state, setState] = useState<LiveFeedState>({
    oceanData: null,
    fleetData: null,
    connectionStatus: 'disconnected',
    lastUpdated: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setState(prev => ({ ...prev, connectionStatus: reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting' }));

    const es = new EventSource('/api/realtime/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      setState(prev => ({ ...prev, connectionStatus: 'connected', error: null }));
      reconnectAttempts.current = 0;
    };

    es.addEventListener('update', (e: MessageEvent) => {
      try {
        if (e.data.trim() === 'keepalive') return;
        const payload = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          oceanData: payload.ocean || prev.oceanData,
          fleetData: payload.fleet || prev.fleetData,
          lastUpdated: payload.timestamp,
        }));
      } catch (err) {
        console.error('Failed to parse SSE payload', err);
      }
    });

    es.onerror = () => {
      es.close();
      setState(prev => ({
        ...prev,
        connectionStatus: 'disconnected',
        error: 'Live feed connection lost. Reconnecting...',
      }));

      // Exponential backoff
      const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current += 1;
      
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connect, timeout);
    };
  };

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  return state;
}
