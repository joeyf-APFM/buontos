/**
 * Ask Ontos: whether its window is open, where it sits, and the page context
 * and scope its questions carry. The conversation itself lives in
 * mantine/ontos/ontos-store.ts. Only the scope is persisted.
 */
import { create } from 'zustand';
import type { WindowRect } from '@/mantine/assistant/window-geometry';

export interface CopilotEntity {
  type: string;
  name: string;
  id: string;
}

export interface CopilotPageContext {
  pageName: string;
  pageUrl: string;
  featureId?: string;
  selectedEntity?: CopilotEntity;
}

/**
 * Context scope toggle, surfaced via the "Asking about" chip menu.
 *
 * - `'page'`: Ask Ontos uses the current `pageContext` (page name,
 *   feature id, selected entity) to bias both the starter prompts and
 *   the chat payload.
 * - `'general'`: it ignores page context. Starter prompts shrink to
 *   global ones and the chat request omits the page-context fields so
 *   the backend treats it as a scope-free question.
 */
export type CopilotContextScope = 'page' | 'general';

interface CopilotState {
  isOpen: boolean;
  pageContext: CopilotPageContext | null;
  contextScope: CopilotContextScope;
  /** Where the user last put the window this session, or null for its default place. */
  windowRect: WindowRect | null;
  /** The user just opened Ask Ontos, so its window may take focus. */
  focusRequested: boolean;
  actions: {
    togglePanel: () => void;
    openPanel: () => void;
    closePanel: () => void;
    setContext: (pageName: string, pageUrl: string, selectedEntity?: CopilotEntity, featureId?: string) => void;
    clearContext: () => void;
    setContextScope: (scope: CopilotContextScope) => void;
    setWindowRect: (rect: WindowRect) => void;
    /** Whether the window may take focus now; consumes the request. */
    takeFocusRequest: () => boolean;
  };
}

const CONTEXT_SCOPE_KEY = 'copilot-context-scope';

function loadContextScope(): CopilotContextScope {
  try {
    return localStorage.getItem(CONTEXT_SCOPE_KEY) === 'general' ? 'general' : 'page';
  } catch {
    return 'page';
  }
}

export const COPILOT_DEFAULTS = {
  isOpen: false,
  pageContext: null,
  contextScope: 'page',
  windowRect: null,
  focusRequested: false,
} satisfies Omit<CopilotState, 'actions'>;

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  ...COPILOT_DEFAULTS,
  contextScope: loadContextScope(),
  actions: {
    togglePanel: () => (get().isOpen ? get().actions.closePanel() : get().actions.openPanel()),
    openPanel: () => set({ isOpen: true, focusRequested: true }),
    closePanel: () => set({ isOpen: false }),
    setContext: (pageName, pageUrl, selectedEntity, featureId) =>
      set({ pageContext: { pageName, pageUrl, featureId, selectedEntity } }),
    clearContext: () => set({ pageContext: null }),
    setContextScope: (scope) => {
      try {
        localStorage.setItem(CONTEXT_SCOPE_KEY, scope);
      } catch {
        // the choice still holds for this session
      }
      set({ contextScope: scope });
    },
    setWindowRect: (windowRect) => set({ windowRect }),
    takeFocusRequest: () => {
      if (!get().focusRequested) return false;
      set({ focusRequested: false });
      return true;
    },
  },
}));
