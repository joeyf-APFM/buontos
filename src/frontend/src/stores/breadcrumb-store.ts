import { create } from 'zustand';

export interface BreadcrumbSegment {
  label: string;
  path?: string; // Optional path for navigation
  /** Instead of a path: an action within the page (the shell's breadcrumb shows a button). */
  onSelect?: () => void;
}

/**
 * What a page tells the shell's breadcrumb (mantine/shell/shell-breadcrumb.tsx)
 * about itself. The shell takes the page's place in the menu from nav-config;
 * a page under a menu item (a detail page) adds its entity's name here.
 */
export interface BreadcrumbState {
  staticSegments: BreadcrumbSegment[];
  dynamicTitle: string | null; // Restored: for the last dynamic part (e.g., item name)
  /** Crumbs within the page, after all of its own, on any page (the explorer's tree path). */
  trailingSegments: BreadcrumbSegment[];
  setStaticSegments: (segments: BreadcrumbSegment[]) => void;
  setDynamicTitle: (title: string | null) => void; // Restored
  setTrailingSegments: (segments: BreadcrumbSegment[]) => void;
  /** Forget what the last page set; the shell calls it when the page changes. */
  clearPage: () => void;
}

const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  staticSegments: [],
  dynamicTitle: null,
  trailingSegments: [],
  setStaticSegments: (segments) => set({ staticSegments: segments }),
  setDynamicTitle: (title) => set({ dynamicTitle: title }),
  setTrailingSegments: (segments) => set({ trailingSegments: segments }),
  clearPage: () => set({ staticSegments: [], dynamicTitle: null, trailingSegments: [] }),
}));

export default useBreadcrumbStore;
