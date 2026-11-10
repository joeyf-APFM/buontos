import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isPanelGroup, type NavGroupId } from './nav-config';

interface ShellState {
  /** The group whose panel is showing, or null for the strip alone. */
  openGroup: NavGroupId | null;
  /** A pinned panel stays open after navigating. */
  pinned: boolean;
  /** Ids of parent items whose sub-items are showing. */
  expanded: string[];
  actions: {
    /** Opens the group's panel; on the open group, closes it. */
    toggleGroup: (group: NavGroupId) => void;
    setPinned: (pinned: boolean) => void;
    toggleExpanded: (id: string) => void;
    /** Closes the panel unless it is pinned. */
    afterNavigate: () => void;
  };
}

export const SHELL_DEFAULTS = { openGroup: null, pinned: true, expanded: [] as string[] } satisfies Partial<ShellState>;

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      ...SHELL_DEFAULTS,
      actions: {
        toggleGroup: (group) => set((s) => ({ openGroup: s.openGroup === group ? null : group })),
        setPinned: (pinned) => set({ pinned }),
        toggleExpanded: (id) =>
          set((s) => ({
            expanded: s.expanded.includes(id) ? s.expanded.filter((e) => e !== id) : [...s.expanded, id],
          })),
        afterNavigate: () => set((s) => (s.pinned ? {} : { openGroup: null })),
      },
    }),
    {
      name: 'apfm-shell',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ openGroup, pinned, expanded }) => ({ openGroup, pinned, expanded }),
      // A stored group this version doesn't open a panel for (removed, like
      // Govern and Deploy, or the Workflows link) comes back as no open panel
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ShellState>;
        return {
          ...current,
          ...saved,
          openGroup: isPanelGroup(saved.openGroup) ? saved.openGroup : null,
          actions: current.actions,
        };
      },
    },
  ),
);
