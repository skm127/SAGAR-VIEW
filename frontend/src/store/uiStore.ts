import { create } from 'zustand';

export type ProductMode = 'research' | 'operational' | 'sounding' | 'datamanager' | 'learn';
export type ExplainMode = 'citizen' | 'scientist';

interface UIState {
  // Global product mode
  productMode: ProductMode;
  setProductMode: (mode: ProductMode) => void;
  
  // Explainability
  explainMode: ExplainMode;
  setExplainMode: (mode: ExplainMode) => void;

  // Modals visibility
  briefingOpen: boolean;
  setBriefingOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  provenanceOpen: boolean;
  setProvenanceOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  coLocationOpen: boolean;
  setCoLocationOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  transectModalOpen: boolean;
  setTransectModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  searchModalOpen: boolean;
  setSearchModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  realtimeModalOpen: boolean;
  setRealtimeModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  guideOpen: boolean;
  setGuideOpen: (open: boolean | ((prev: boolean) => boolean)) => void;

  toolsMenuOpen: boolean;
  setToolsMenuOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  productMode: 'research',
  setProductMode: (mode) => set({ productMode: mode }),

  explainMode: 'citizen',
  setExplainMode: (mode) => set({ explainMode: mode }),

  briefingOpen: false,
  setBriefingOpen: (updater) => set((state) => ({ briefingOpen: typeof updater === 'function' ? updater(state.briefingOpen) : updater })),

  provenanceOpen: false,
  setProvenanceOpen: (updater) => set((state) => ({ provenanceOpen: typeof updater === 'function' ? updater(state.provenanceOpen) : updater })),

  coLocationOpen: false,
  setCoLocationOpen: (updater) => set((state) => ({ coLocationOpen: typeof updater === 'function' ? updater(state.coLocationOpen) : updater })),

  transectModalOpen: false,
  setTransectModalOpen: (updater) => set((state) => ({ transectModalOpen: typeof updater === 'function' ? updater(state.transectModalOpen) : updater })),

  searchModalOpen: false,
  setSearchModalOpen: (updater) => set((state) => ({ searchModalOpen: typeof updater === 'function' ? updater(state.searchModalOpen) : updater })),

  realtimeModalOpen: false,
  setRealtimeModalOpen: (updater) => set((state) => ({ realtimeModalOpen: typeof updater === 'function' ? updater(state.realtimeModalOpen) : updater })),

  guideOpen: false,
  setGuideOpen: (updater) => set((state) => ({ 
    guideOpen: typeof updater === 'function' ? updater(state.guideOpen) : updater 
  })),

  toolsMenuOpen: false,
  setToolsMenuOpen: (open) => set({ toolsMenuOpen: open }),
}));
