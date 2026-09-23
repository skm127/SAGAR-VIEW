import React, { useMemo } from 'react';
import './LiveConnectionIndicator.css';

interface Props {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastUpdated: string | null;
  currentTime: Date;
  /** Real dataset time range from the model info, e.g. ["2026-09-18T00:00:00", "2026-09-20T00:00:00"] */
  datasetTimeRange?: [string | null, string | null];
  /** Whether the loaded data is synthetic sample data */
  isSynthetic?: boolean;
}

export const LiveConnectionIndicator: React.FC<Props> = ({
  status,
  lastUpdated,
  currentTime,
  datasetTimeRange,
  isSynthetic = false,
}) => {
  const getStatusText = () => {
    switch (status) {
      case 'connecting': return 'Connecting...';
      case 'connected': return 'LIVE';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Offline';
      default: return 'Unknown';
    }
  };

  const modelAge = useMemo(() => {
    if (!datasetTimeRange || !datasetTimeRange[1]) return null;
    try {
      const latest = new Date(datasetTimeRange[1]);
      const now = new Date();
      const diffMs = now.getTime() - latest.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return 'Updated just now';
      if (diffHours < 24) return `Updated ${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `Updated ${diffDays}d ago`;
    } catch {
      return null;
    }
  }, [datasetTimeRange]);

  const realTimeLabel = useMemo(() => {
    return currentTime.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC';
  }, [currentTime]);

  return (
    <div className={`live-conn-indicator ${status}`} aria-live="polite" aria-atomic="true">
      <span className="live-conn-dot" />
      <span className="live-conn-text">{getStatusText()}</span>
      <span className="live-conn-model-date" title={lastUpdated ? `Heartbeat: ${lastUpdated} | ${modelAge}` : undefined}>
        {isSynthetic ? 'DEMO' : 'INCOIS'} | {realTimeLabel}
      </span>
    </div>
  );
};
