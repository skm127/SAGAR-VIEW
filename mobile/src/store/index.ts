import { create } from 'zustand';

interface AppState {
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  subscribedRegions: string[];
  toggleRegionSubscription: (region: string) => void;
  alertThreshold: 'WARNING' | 'CRITICAL_ANOMALY';
  setAlertThreshold: (threshold: 'WARNING' | 'CRITICAL_ANOMALY') => void;
}

export const useAppStore = create<AppState>((set) => ({
  hasCompletedOnboarding: false,
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  subscribedRegions: ['bay_of_bengal', 'arabian_sea'],
  toggleRegionSubscription: (region) => set((state) => ({
    subscribedRegions: state.subscribedRegions.includes(region) 
      ? state.subscribedRegions.filter(r => r !== region)
      : [...state.subscribedRegions, region]
  })),
  alertThreshold: 'CRITICAL_ANOMALY',
  setAlertThreshold: (alertThreshold) => set({ alertThreshold }),
}));
