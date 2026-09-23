/**
 * Custom hook for managing in-situ Argo float observation profiles.
 */
import { useState, useEffect } from 'react';
import { getArgoProfiles } from '../services/api';
import type { ArgoProfileSummary } from '../types';

export function useArgoData() {
  const [profiles, setProfiles] = useState<ArgoProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getArgoProfiles()
      .then((data) => {
        if (data && data.profiles) {
          setProfiles(data.profiles);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch Argo profiles:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    profiles,
    loading,
    selectedProfileId,
    setSelectedProfileId,
  };
}
