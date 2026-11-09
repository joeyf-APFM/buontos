import { create } from 'zustand';

interface HelixState {
  /** Whether the Helix panel is showing. */
  isOpen: boolean;
  /** What the user is looking at (e.g. an asset's full name), offered to Helix as context. */
  context: string | null;
  actions: {
    open: () => void;
    close: () => void;
    setContext: (context: string | null) => void;
    clearContext: () => void;
  };
}

export const useHelixStore = create<HelixState>()((set) => ({
  isOpen: false,
  context: null,
  actions: {
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    setContext: (context) => set({ context }),
    clearContext: () => set({ context: null }),
  },
}));
