/**
 * The explorer's session state: what the user had open when they left
 * /assets, restored when they come back (R21). In memory only, so it lasts
 * for the browser session and not across reloads.
 */
import { create } from 'zustand';
import usePermissionsStore from '@/stores/permissions-store';
import type { AssetStatus } from '@/types/asset';
import type { AssetSummary, ConceptOption, TreeNode } from './api';
import type { SectionId, TreeSelection } from './asset-tree';
import type { Expansion } from './use-expansions';

export interface TreeSession {
  /** Loaded tree levels by parent key. */
  children: Record<string, TreeNode[]>;
  /** Each section's unfolded nodes. */
  expanded: Partial<Record<SectionId, Record<string, boolean>>>;
}

export interface PageSession {
  selection: TreeSelection | null;
  selectionCount: number;
  nameInput: string;
  typedName: { nodeKey?: string; name: string };
  typeFilter: string | null;
  statusFilter: string | null;
  concept: ConceptOption | null;
  conceptSearch: string;
  conceptOptions: ConceptOption[];
  pageState: { listKey: string; number: number };
  listToken: number;
  treeToken: number;
  answer: { requestKey: string; listKey: string; page: { items: AssetSummary[]; total: number }; error: string | null } | null;
  selectedAsset: AssetSummary | null;
  nodeStatus: { key: string; token: number; status: AssetStatus } | null;
  /** The node's Helix context: its label, or a column's full name. */
  nodeContext: string | null;
}

export interface GridSession {
  scope: string;
  map: Record<string, Expansion>;
}

interface ExplorerStore {
  tree: TreeSession | null;
  page: PageSession | null;
  grid: GridSession | null;
  actions: {
    saveTreeChildren: (children: TreeSession['children']) => void;
    saveTreeExpanded: (section: SectionId, expanded: Record<string, boolean>) => void;
    savePage: (page: PageSession) => void;
    saveGrid: (grid: GridSession) => void;
    /** Forgets everything (tests; a fresh session). */
    reset: () => void;
  };
}

export const useExplorerStore = create<ExplorerStore>()((set) => ({
  tree: null,
  page: null,
  grid: null,
  actions: {
    saveTreeChildren: (children) => set((s) => ({ tree: { expanded: {}, ...s.tree, children } })),
    saveTreeExpanded: (section, expanded) =>
      set((s) => ({ tree: { children: {}, ...s.tree, expanded: { ...s.tree?.expanded, [section]: expanded } } })),
    savePage: (page) => set({ page }),
    saveGrid: (grid) => set({ grid }),
    reset: () => set({ tree: null, page: null, grid: null }),
  },
}));

// Another applied role sees other assets: what was saved under the old one goes
usePermissionsStore.subscribe((state, prev) => {
  if (state.appliedRoleId !== prev.appliedRoleId) useExplorerStore.getState().actions.reset();
});
