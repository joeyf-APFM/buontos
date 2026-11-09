/**
 * Ask Ontos's conversation for this browser session: it survives the window
 * closing and reopening (R26), but not a reload. The server keeps the
 * history (sessions); `sessionId` continues one.
 */
import { create } from 'zustand';
import i18n from '@/i18n/config';
import { deleteSession, fetchLLMStatus, fetchSessions, sendMessage } from '@/components/search/llm-search-api';
import type { ChatMessage, LLMSearchStatus, SessionSummary } from '@/types/llm-search';

interface OntosState {
  /** `/api/llm-search/status`, or null until known (or when it failed). */
  status: LLMSearchStatus | null;
  messages: ChatMessage[];
  sessionId: string | undefined;
  sessions: SessionSummary[];
  /** A question is with the server (the API doesn't stream). */
  busy: boolean;
  /** The last request's failure, shown as an error message. */
  error: string | null;
  draft: string;
  actions: {
    /** Fetches the status once; later calls reuse it. */
    loadStatus: () => Promise<void>;
    loadSessions: () => Promise<void>;
    send: (content: string) => Promise<void>;
    selectSession: (id: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    newConversation: () => void;
    setDraft: (draft: string) => void;
  };
}

export const ONTOS_DEFAULTS = {
  status: null,
  messages: [],
  sessionId: undefined,
  sessions: [],
  busy: false,
  error: null,
  draft: '',
} satisfies Omit<OntosState, 'actions'>;

let statusRequest: Promise<void> | null = null;

/** Tool messages and empty assistant turns (tool calls) aren't shown. */
const shown = (m: ChatMessage) => m.role === 'user' || (m.role === 'assistant' && !!m.content);

const errorText = (e: unknown, fallbackKey: string) =>
  e instanceof Error && e.message ? e.message : i18n.t(fallbackKey);

export const useOntosStore = create<OntosState>()((set, get) => ({
  ...ONTOS_DEFAULTS,
  actions: {
    loadStatus: () => {
      if (get().status) return Promise.resolve();
      statusRequest ??= fetchLLMStatus()
        .then((status) => set({ status }))
        .catch(() => set({ status: null }))
        .finally(() => {
          statusRequest = null;
        });
      return statusRequest;
    },

    loadSessions: async () => {
      try {
        set({ sessions: await fetchSessions() });
      } catch {
        // the history list stays as it was
      }
    },

    send: async (content) => {
      const text = content.trim();
      if (!text || get().busy) return;
      const question: ChatMessage = { id: `temp-${Date.now()}`, role: 'user', content: text, timestamp: new Date().toISOString() };
      set((s) => ({ messages: [...s.messages, question], busy: true, error: null }));
      try {
        const response = await sendMessage(text, get().sessionId);
        set((s) => ({ sessionId: response.session_id, messages: [...s.messages, response.message] }));
        void get().actions.loadSessions();
      } catch (e) {
        set({ error: errorText(e, 'search:copilot.messageSendFailed') });
      } finally {
        set({ busy: false });
      }
    },

    selectSession: async (id) => {
      try {
        const response = await fetch(`/api/llm-search/sessions/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error();
        const session = await response.json();
        const messages: ChatMessage[] = Array.isArray(session.messages) ? session.messages : [];
        set({ sessionId: session.id, messages: messages.filter(shown), error: null });
      } catch {
        set({ error: i18n.t('search:llm.messages.loadSessionFailed') });
      }
    },

    deleteSession: async (id) => {
      try {
        await deleteSession(id);
        set((s) => ({
          sessions: s.sessions.filter((x) => x.id !== id),
          ...(s.sessionId === id ? { sessionId: undefined, messages: [], error: null } : {}),
        }));
      } catch {
        set({ error: i18n.t('search:llm.messages.deleteSessionFailed') });
      }
    },

    newConversation: () => set({ sessionId: undefined, messages: [], error: null }),
    setDraft: (draft) => set({ draft }),
  },
}));
