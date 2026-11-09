/**
 * Ask Helix's state for this browser session (no persistence: history lasts
 * only as long as the page).
 */
import { create } from 'zustand';
import i18n from '@/i18n/config';
import { useCopilotStore } from '@/stores/copilot-store';
import { askHelix, type HelixAskBody } from './helix-stream';

export interface HelixResult {
  columns: string[];
  rows: string[][];
  total?: string;
}

export interface Turn {
  question: string;
  /** The answer's markdown, built up as it streams. */
  text: string;
  /** The SQL Genie ran, in order. */
  sql: string[];
  /** The last result's preview, when its rows and columns are lists. */
  result?: HelixResult;
  error?: string;
  /** The user stopped the answer. */
  stopped?: boolean;
}

/** `GET /api/settings/helix`. */
export interface HelixConfig {
  enabled: boolean;
  mode: 'user' | 'shared';
  workspace_host: string;
}

/** The floating window's place and size, in viewport pixels. */
export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HelixState {
  /** Whether the Helix panel is showing. */
  isOpen: boolean;
  /** What the user is looking at (e.g. an asset's full name), offered to Helix as context. */
  context: string | null;
  conversationId: string | null;
  turns: Turn[];
  /** An answer is streaming. */
  busy: boolean;
  /** Helix's settings, or null while unknown or when Helix is off. */
  config: HelixConfig | null;
  /** The unsent question, kept while Helix switches between pane and window. */
  draft: string;
  /** Where the floating window was last put, or null for its default place. */
  windowRect: WindowRect | null;
  /**
   * The user just opened Helix, so it may take focus. Only that does: a pane
   * turning into a window as you navigate leaves focus on the new page.
   */
  focusRequested: boolean;
  actions: {
    open: () => void;
    close: () => void;
    setContext: (context: string | null) => void;
    clearContext: () => void;
    ask: (question: string) => Promise<void>;
    /** Aborts the streaming answer, keeping what has arrived. */
    stop: () => void;
    newConversation: () => void;
    /** Reads Helix's settings; a failure or 404 means Helix is off. */
    loadConfig: () => Promise<void>;
    setDraft: (draft: string) => void;
    setWindowRect: (rect: WindowRect) => void;
    /** Whether Helix may take focus now; consumes the request. */
    takeFocusRequest: () => boolean;
  };
}

export const HELIX_DEFAULTS = {
  isOpen: false,
  context: null,
  conversationId: null,
  turns: [],
  busy: false,
  config: null,
  draft: '',
  windowRect: null,
  focusRequested: false,
} satisfies Omit<HelixState, 'actions'>;

/** The running answer's abort handle; a newer conversation replaces it. */
let running: AbortController | null = null;

const isList = (v: unknown): v is unknown[] => Array.isArray(v);

/** A result event's preview, or undefined when its rows or columns aren't lists. */
function toResult(data: { columns?: unknown; rows?: unknown; total?: unknown }): HelixResult | undefined {
  if (!isList(data.columns) || !isList(data.rows)) return undefined;
  return {
    columns: data.columns.map((c) => String(c ?? '')),
    rows: data.rows.filter(isList).map((r) => r.map((cell) => (cell == null ? '' : String(cell)))),
    total: data.total == null ? undefined : String(data.total),
  };
}

export const useHelixStore = create<HelixState>()((set, get) => {
  /** Changes the last turn, if this answer is still the running one. */
  const updateTurn = (owner: AbortController, change: (turn: Turn) => Partial<Turn>) => {
    if (running !== owner) return;
    set((s) => {
      const turns = [...s.turns];
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = { ...last, ...change(last) };
      return { turns };
    });
  };

  return {
    ...HELIX_DEFAULTS,
    actions: {
      open: () => {
        // One right-hand panel at a time: Helix replaces Ask Ontos
        if (useCopilotStore.getState().isOpen) useCopilotStore.getState().actions.closePanel();
        set({ isOpen: true, focusRequested: true });
      },
      close: () => set({ isOpen: false }),
      setContext: (context) => set({ context }),
      clearContext: () => set({ context: null }),

      ask: async (question) => {
        const q = question.trim();
        const { busy, context, conversationId } = get();
        if (!q || busy) return;
        const owner = new AbortController();
        running = owner;
        set((s) => ({ busy: true, turns: [...s.turns, { question: q, text: '', sql: [] }] }));

        // Only the chip's text goes to Genie, and only while the chip is there
        const body: HelixAskBody = { question: q };
        if (context) body.context = context;
        if (conversationId) body.conversation_id = conversationId;

        try {
          for await (const { kind, data } of askHelix(body, owner.signal)) {
            if (running !== owner) return;
            if (kind === 'conversation' && typeof data.conversation_id === 'string') {
              set({ conversationId: data.conversation_id });
            } else if (kind === 'text' && typeof data.text === 'string') {
              updateTurn(owner, (t) => ({ text: t.text ? `${t.text}\n\n${data.text}` : data.text }));
            } else if (kind === 'sql' && typeof data.sql === 'string') {
              updateTurn(owner, (t) => ({ sql: [...t.sql, data.sql] }));
            } else if (kind === 'result') {
              const result = toResult(data);
              if (result) updateTurn(owner, () => ({ result }));
            } else if (kind === 'error') {
              const message = typeof data.message === 'string' && data.message ? data.message : i18n.t('helix:errors.network');
              updateTurn(owner, () => ({ error: message }));
            }
          }
          if (owner.signal.aborted) updateTurn(owner, () => ({ stopped: true }));
        } finally {
          if (running === owner) {
            running = null;
            set({ busy: false });
          }
        }
      },

      stop: () => running?.abort(),

      newConversation: () => {
        running?.abort();
        running = null;
        set({ turns: [], conversationId: null, busy: false });
      },

      setDraft: (draft) => set({ draft }),
      setWindowRect: (windowRect) => set({ windowRect }),
      takeFocusRequest: () => {
        if (!get().focusRequested) return false;
        set({ focusRequested: false });
        return true;
      },

      loadConfig: async () => {
        try {
          const response = await fetch('/api/settings/helix');
          const data = response.ok ? await response.json() : null;
          const config = data && data.enabled ? (data as HelixConfig) : null;
          // With Helix off, nothing may stay hidden behind a panel that isn't there
          set(config ? { config } : { config: null, isOpen: false });
        } catch {
          set({ config: null, isOpen: false });
        }
      },
    },
  };
});

// ...and Ask Ontos replaces Helix
useCopilotStore.subscribe((state, prev) => {
  if (state.isOpen && !prev.isOpen) useHelixStore.setState({ isOpen: false });
});
