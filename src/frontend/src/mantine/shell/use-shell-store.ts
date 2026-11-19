import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { NAV_GROUPS, isPanelGroup, type ActiveLocation, type NavGroupId } from './nav-config';

interface ShellState {
  /** The group whose panel is showing, or null for the strip alone. */
  openGroup: NavGroupId | null;
  /** A pinned panel stays open after navigating. */
  pinned: boolean;
  /** Ids of parent items whose sub-items are showing. */
  expanded: string[];
  /** The panel was just opened on the way to its default page: the next navigation keeps it. Not stored. */
  holdOpen: boolean;
  actions: {
    /**
     * Opens the group's panel. With `holdOpen`, just before going to the
     * group's default page: that navigation doesn't close it, even unpinned.
     */
    openPanel: (group: NavGroupId, holdOpen?: boolean) => void;
    /** Closes the panel, pinned or not (the pin is kept). */
    closePanel: () => void;
    setPinned: (pinned: boolean) => void;
    toggleExpanded: (id: string) => void;
    /**
     * After any navigation, to `here` (the new page's place in the menu, or
     * null for a page in no group): a direct-link group's page (Workflows)
     * closes the panel; otherwise an unpinned panel closes, and a pinned one
     * switches to the page's group.
     */
    afterNavigate: (here: ActiveLocation | null) => void;
  };
}

export const SHELL_DEFAULTS = { openGroup: null, pinned: true, expanded: [] as string[], holdOpen: false } satisfies Partial<ShellState>;

const isLinkGroup = (id: NavGroupId) => NAV_GROUPS.some((g) => g.id === id && g.link);

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      ...SHELL_DEFAULTS,
      actions: {
        openPanel: (group, holdOpen = false) => set({ openGroup: group, holdOpen }),
        closePanel: () => set({ openGroup: null, holdOpen: false }),
        setPinned: (pinned) => set({ pinned }),
        toggleExpanded: (id) =>
          set((s) => ({
            expanded: s.expanded.includes(id) ? s.expanded.filter((e) => e !== id) : [...s.expanded, id],
          })),
        afterNavigate: (here) =>
          set((s) => {
            if (here && isLinkGroup(here.group)) return { openGroup: null, holdOpen: false };
            if (s.holdOpen) return { holdOpen: false };
            if (!s.pinned) return { openGroup: null };
            // The panel follows the page; on a page in no group it stays as it was
            return s.openGroup && here ? { openGroup: here.group } : {};
          }),
      },
    }),
    {
      name: 'apfm-shell',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ openGroup, pinned, expanded }) => ({ openGroup, pinned, expanded }),
      // A stored group this version doesn't open a panel for (removed, or
      // the Workflows link) comes back as no open panel
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
