/**
 * LLM Search Component
 *
 * Conversational AI interface for querying data products, costs,
 * glossary terms, and executing analytics queries.
 *
 * On the page kit (wave 2 Task 16): one kit pane with the History popover
 * in its head, the messages in a log that scrolls inside the pane, and the
 * composer under it, always in view. The debug and tool-result details fold
 * with Mantine Collapse. The LLM-disabled state is a pane of its own.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Collapse, Loader, Popover, Textarea, UnstyledButton } from '@mantine/core';
import { Send, User, AlertCircle, Trash2, MessageSquare, Plus, ChevronDown, Sparkles, RefreshCw, Pencil, Bug, ChevronRight, Clock, Wrench, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pane } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LLMConsentDialog, { hasLLMConsent } from '@/components/common/llm-consent-dialog';
import type { LLMConfig } from '@/types/llm';
import type {
  AdoptionMode,
  ChatMessage,
  DebugInfo,
  LLMSearchStatus,
  SessionSummary,
} from '@/types/llm-search';
import { fetchLLMStatus, fetchSessions, sendMessage, deleteSession } from './llm-search-api';
import { LoadError } from './search-pane';
import { chatMessageText } from '@/lib/chat-message-text';
import { useUICustomizationStore } from '@/stores/ui-customization-store';
import classes from './llm-search.module.css';


// ============================================================================
// Message Component
// ============================================================================

interface MessageProps {
  message: ChatMessage;
  debugInfo?: DebugInfo | null;
  onRerun?: (content: string) => void;
  onCopyToInput?: (content: string) => void;
}

function Message({ message, debugInfo, onRerun, onCopyToInput }: MessageProps) {
  const { t } = useTranslation(['search']);
  const shortName = useUICustomizationStore((s) => s.getShortName());
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Don't render tool messages (they're internal)
  if (message.role === 'tool' || message.role === 'system') {
    return null;
  }

  // Don't render assistant messages that are just tool calls (no content)
  if (isAssistant && !message.content && message.tool_calls) {
    return null;
  }

  return (
    <div className={classes.message}>
      <div className={classes.row} data-role={isUser ? 'user' : 'assistant'}>
        {/* Avatar */}
        <div className={classes.avatar} role="img" aria-label={isUser ? t('search:llm.you') : shortName}>
          {isUser ? <User aria-hidden /> : <Sparkles aria-hidden />}
        </div>

        {/* Message Content */}
        <div className={classes.bubble}>
          {isUser ? (
            <p className={classes.userText}>{message.content}</p>
          ) : (
            <div className={classes.markdown}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // A wide table scrolls inside the message
                  table: ({ children }) => (
                    <div className={classes.tableWrap}>
                      <table>{children}</table>
                    </div>
                  ),
                }}
              >
                {chatMessageText(message, t)}
              </ReactMarkdown>
            </div>
          )}

          {/* Timestamp */}
          <div className={classes.time}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>

        {/* A question's actions, shown on hover and on focus */}
        {isUser && message.content && (
          <div className={classes.actions}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => onCopyToInput?.(message.content || '')}
              aria-label={t('search:llm.copyToInput')}
              title={t('search:llm.copyToInput')}
            >
              <Pencil aria-hidden />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => onRerun?.(message.content || '')}
              aria-label={t('search:llm.rerun')}
              title={t('search:llm.rerun')}
            >
              <RefreshCw aria-hidden />
            </ActionIcon>
          </div>
        )}
      </div>

      {/* Debug panel below assistant messages */}
      {isAssistant && debugInfo && <DebugPanel debug={debugInfo} />}
    </div>
  );
}


// ============================================================================
// Debug Panel Component
// ============================================================================

interface DebugPanelProps {
  debug: DebugInfo;
}

function DebugPanel({ debug }: DebugPanelProps) {
  const { t } = useTranslation(['search']);
  const [isOpen, setIsOpen] = useState(false);
  const hasSessionContext = debug.session_context?.is_follow_up && debug.session_context.prior_tool_results > 0;

  return (
    <div className={classes.debug}>
      <UnstyledButton className={classes.fold} aria-expanded={isOpen} onClick={() => setIsOpen((o) => !o)}>
        <Bug aria-hidden />
        <span>{t('search:llm.debug.title')}</span>
        <ChevronRight aria-hidden className={classes.chevron} data-open={isOpen || undefined} />
        <span className={classes.faint}>
          {t('search:llm.debug.toolCallCount', { count: debug.total_tool_calls })}
          {hasSessionContext && ` ${t('search:llm.debug.priorResults', { count: debug.session_context!.prior_tool_results })}`}
          {' '}&middot; {debug.total_elapsed_ms}ms
        </span>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <div className={classes.debugBody}>
          {/* Session Context */}
          {hasSessionContext && (
            <div className={classes.followUp}>
              <MessageSquare aria-hidden />
              <span>{t('search:llm.debug.followUp', { messages: debug.session_context!.prior_messages, results: debug.session_context!.prior_tool_results })}</span>
            </div>
          )}

          {/* Query Classification */}
          <div className={classes.debugSection}>
            <div className={classes.debugTitle}>{t('search:llm.debug.queryClassification')}</div>
            <div><span className={classes.label}>{t('search:llm.debug.query')}</span> {debug.query_classification.user_query}</div>
            <div className={classes.inline}>
              <span className={classes.label}>{t('search:llm.debug.categories')}</span>
              {debug.query_classification.categories.map((cat) => (
                <Badge key={cat} variant="secondary">{cat}</Badge>
              ))}
            </div>
            <div>
              <span className={classes.label}>{t('search:llm.debug.toolsProvided')}</span>{' '}
              {debug.query_classification.tools_count} (<code className={classes.code}>{debug.query_classification.tools_provided.join(', ')}</code>)
            </div>
          </div>

          {/* Model Info */}
          <div className={`${classes.debugSection} ${classes.inline}`}>
            <div><span className={classes.label}>{t('search:llm.debug.model')}</span> <code className={classes.code}>{debug.model}</code></div>
            <div><span className={classes.label}>{t('search:llm.debug.iterations')}</span> {debug.total_iterations}</div>
            <div className={classes.inline}>
              <Clock aria-hidden className={classes.labelIcon} />
              <span>{debug.total_elapsed_ms}ms {t('search:llm.debug.total')}</span>
            </div>
          </div>

          {/* Tool Executions */}
          {debug.tool_executions.length > 0 && (
            <div className={classes.debugSection}>
              <div className={classes.debugTitle}>{t('search:llm.debug.toolExecutions')}</div>
              {debug.tool_executions.map((exec, idx) => (
                <ToolExecutionDetail key={idx} exec={exec} />
              ))}
            </div>
          )}

          {/* Iterations */}
          {debug.iterations.length > 1 && (
            <div className={classes.debugSection}>
              <div className={classes.debugTitle}>{t('search:llm.debug.llmIterations')}</div>
              {debug.iterations.map((iter, idx) => (
                <div key={idx} className={`${classes.inline} ${classes.label}`}>
                  <span>#{iter.iteration}</span>
                  <span>{iter.llm_call_ms}ms</span>
                  <span>{t('search:llm.debug.messagesSent', { count: iter.messages_sent })}</span>
                  {iter.has_tool_calls && <span>{t('search:llm.debug.toolCallsShort', { count: iter.tool_calls.length })}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

function ToolExecutionDetail({ exec }: { exec: DebugInfo['tool_executions'][0] }) {
  const { t } = useTranslation(['search', 'common']);
  const [showResult, setShowResult] = useState(false);

  return (
    <div className={classes.tool}>
      <div className={classes.inline}>
        <Wrench aria-hidden className={classes.labelIcon} />
        <code className={classes.code} data-strong="">{exec.tool}</code>
        {exec.success ? (
          <CheckCircle2 aria-hidden className={classes.ok} />
        ) : (
          <XCircle aria-hidden className={classes.failed} />
        )}
        <span className={`${classes.label} ${classes.end}`}>{exec.execution_ms}ms</span>
      </div>
      <div className={classes.label}>
        <span>{t('search:llm.debug.args')} </span>
        <code className={classes.code} data-wrap="">{JSON.stringify(exec.arguments)}</code>
      </div>
      {exec.error && (
        <div className={classes.failed}>{t('common:states.error')}: {exec.error}</div>
      )}
      {exec.result && (
        <>
          <UnstyledButton className={classes.fold} data-small="" aria-expanded={showResult} onClick={() => setShowResult((o) => !o)}>
            <ChevronRight aria-hidden className={classes.chevron} data-open={showResult || undefined} />
            {showResult ? t('search:llm.debug.hideResult') : t('search:llm.debug.showResult')}
          </UnstyledButton>
          <Collapse in={showResult}>
            <pre className={classes.result}>
              {JSON.stringify(exec.result, null, 2)}
            </pre>
          </Collapse>
        </>
      )}
    </div>
  );
}


// ============================================================================
// Session List Component
// ============================================================================

interface SessionListProps {
  sessions: SessionSummary[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: () => void;
}

function SessionList({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession
}: SessionListProps) {
  const { t } = useTranslation(['search', 'common']);
  const [opened, setOpened] = useState(false);

  if (sessions.length === 0) {
    return null;
  }

  const history = t('search:llm.history');

  return (
    // hideDetached off, as the Ontos window's: the pane head never scrolls away
    <Popover opened={opened} onChange={setOpened} hideDetached={false} position="bottom-end" width={300} shadow="md" trapFocus returnFocus>
      <Popover.Target>
        {/* Controlled, so the target toggles it; Popover.Target adds aria-expanded */}
        <Button variant="outline" size="sm" type="button" onClick={() => setOpened((o) => !o)}>
          <MessageSquare aria-hidden />
          {history}
          <ChevronDown aria-hidden />
        </Button>
      </Popover.Target>
      <Popover.Dropdown aria-label={history} className={classes.history}>
        <UnstyledButton
          className={classes.session}
          onClick={() => {
            setOpened(false);
            onNewSession();
          }}
        >
          <Plus aria-hidden className={classes.labelIcon} />
          {t('search:llm.newConversation')}
        </UnstyledButton>
        <div className={classes.divider} />
        <div className={classes.sessions}>
          {sessions.map((session) => {
            const title = session.title || t('search:llm.untitled');
            return (
              <div key={session.id} className={classes.sessionRow} data-current={session.id === currentSessionId || undefined}>
                <UnstyledButton
                  className={classes.session}
                  onClick={() => {
                    setOpened(false);
                    onSelectSession(session.id);
                  }}
                >
                  {title}
                </UnstyledButton>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={t('search:llm.deleteSession', { title })}
                  title={t('search:llm.deleteSession', { title })}
                  onClick={() => onDeleteSession(session.id)}
                >
                  <Trash2 aria-hidden />
                </ActionIcon>
              </div>
            );
          })}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}


// ============================================================================
// Example Questions Component
// ============================================================================

interface ExampleQuestionsProps {
  onSelectQuestion: (question: string) => void;
  adoptionMode?: AdoptionMode | null;
}

function ExampleQuestions({ onSelectQuestion, adoptionMode }: ExampleQuestionsProps) {
  const { t } = useTranslation(['search']);

  // Mode-aware example set: a blank workspace wants onboarding
  // questions, not "show me failing checks". When the snapshot is
  // unavailable (`adoptionMode == null`) we keep the historical
  // 'active' list as the safe default.
  const examples =
    adoptionMode === 'blank'
      ? [
          t('search:llm.examples.howToCreateProduct'),
          t('search:llm.examples.howToSetupDomains'),
          t('search:llm.examples.whatIsOntos'),
          t('search:llm.examples.coreConcepts'),
        ]
      : [
          t('search:llm.examples.findCustomerData'),
          t('search:llm.examples.dataProductsCost'),
          t('search:llm.examples.businessTermsSales'),
          t('search:llm.examples.showDataProducts'),
        ];

  return (
    <div className={classes.examples}>
      <p className={classes.muted}>{t('search:llm.tryAsking')}</p>
      <div className={classes.exampleList}>
        {examples.map((question, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            type="button"
            className={classes.example}
            onClick={() => onSelectQuestion(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}


// ============================================================================
// Main Component
// ============================================================================

export default function LLMSearch() {
  const { t } = useTranslation(['search', 'common']);
  const shortName = useUICustomizationStore((s) => s.getShortName());
  const [status, setStatus] = useState<LLMSearchStatus | null>(null);
  // The status and the sessions failed to load (Retry loads them again)
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  // A session whose messages failed to load (Retry loads it again)
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfoMap, setDebugInfoMap] = useState<Record<string, DebugInfo>>({});

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Only the latest session pick may show: an earlier one that answers late is dropped
  const sessionRequest = useRef(0);
  // The session whose messages are on their way
  const pendingSessionId = useRef<string | null>(null);
  const { toast } = useToast();

  // Hidden keyboard shortcut: Ctrl+Shift+D to toggle debug mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDebugMode((prev) => {
          const next = !prev;
          toast({ title: next ? t('search:llm.debug.modeEnabled') : t('search:llm.debug.modeDisabled'), description: next ? t('search:llm.debug.modeEnabledDesc') : undefined });
          return next;
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toast]);

  // Build LLMConfig from status for consent dialog
  const llmConfig: LLMConfig = {
    enabled: status?.enabled ?? false,
    endpoint: status?.endpoint ?? null,
    system_prompt: null,
    disclaimer_text: status?.disclaimer ?? '',
  };

  // Scroll the log (not the page) to its end when messages change
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (typeof log.scrollTo === 'function') log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    else log.scrollTop = log.scrollHeight;
  }, [messages, isLoading]);

  // Load status and sessions on mount, and again on Retry; an answer after
  // unmount or after a newer attempt is dropped
  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      try {
        const [statusData, sessionsData] = await Promise.all([
          fetchLLMStatus(),
          fetchSessions(),
        ]);
        if (cancelled) return;
        setStatus(statusData);
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load LLM search data:', err);
        setLoadFailed(true);
      }
    }
    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Handle sending a message
  const handleSend = async () => {
    const messageContent = input.trim();
    if (!messageContent || isLoading) return;

    // Show consent dialog on first use if not already consented
    if (!hasLLMConsent(llmConfig)) {
      setShowConsentDialog(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setFailedSessionId(null);
    // The conversation this question belongs to: if the user opens another
    // (or a new one) before the answer comes, the answer stays out of it
    const conversation = sessionRequest.current;

    try {
      const response = await sendMessage(messageContent, currentSessionId, debugMode);

      if (conversation === sessionRequest.current) {
        // Update session ID
        setCurrentSessionId(response.session_id);

        // Add assistant message
        setMessages((prev) => [...prev, response.message]);

        // Store debug info keyed by the assistant message ID
        if (response.debug && response.message.id) {
          setDebugInfoMap((prev) => ({ ...prev, [response.message.id]: response.debug! }));
        }
      }

      // Refresh sessions list (the sent conversation shows in History either way)
      const updatedSessions = await fetchSessions();
      setSessions(Array.isArray(updatedSessions) ? updatedSessions : []);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('search:copilot.messageSendFailed');
      toast({
        title: t('common:toast.error'),
        description: errorMessage,
        variant: 'destructive',
      });
      if (conversation === sessionRequest.current) {
        setError(errorMessage);
        // Remove the user message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      }
    } finally {
      setIsLoading(false);
      // After the composer is enabled again
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle re-running a previous message
  const handleRerun = useCallback(async (content: string) => {
    if (!content || isLoading) return;

    // Show consent dialog on first use if not already consented
    if (!hasLLMConsent(llmConfig)) {
      setInput(content);
      setShowConsentDialog(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);
    // As in handleSend: an answer after a switch of conversation stays out of it
    const conversation = sessionRequest.current;

    try {
      const response = await sendMessage(content, currentSessionId, debugMode);
      if (conversation === sessionRequest.current) {
        setCurrentSessionId(response.session_id);
        setMessages((prev) => [...prev, response.message]);
        if (response.debug && response.message.id) {
          setDebugInfoMap((prev) => ({ ...prev, [response.message.id]: response.debug! }));
        }
      }
      const updatedSessions = await fetchSessions();
      setSessions(Array.isArray(updatedSessions) ? updatedSessions : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('search:copilot.messageSendFailed');
      toast({
        title: t('common:toast.error'),
        description: errorMessage,
        variant: 'destructive',
      });
      if (conversation === sessionRequest.current) {
        setError(errorMessage);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isLoading, llmConfig, currentSessionId, debugMode, toast]);

  // Handle copying a message to the input for editing
  const handleCopyToInput = useCallback((content: string) => {
    setInput(content);
    inputRef.current?.focus();
  }, []);

  // Handle session selection; a slower answer for an earlier pick is dropped
  const handleSelectSession = async (sessionId: string) => {
    const id = ++sessionRequest.current;
    pendingSessionId.current = sessionId;
    setFailedSessionId(null);
    try {
      const response = await fetch(`/api/llm-search/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to load session');
      const session = await response.json();
      if (id !== sessionRequest.current) return;
      pendingSessionId.current = null;
      setCurrentSessionId(session.id);
      const loaded: ChatMessage[] = Array.isArray(session.messages) ? session.messages : [];
      setMessages(loaded.filter((m: ChatMessage) =>
        m.role === 'user' || (m.role === 'assistant' && m.content)
      ));
    } catch (err) {
      if (id !== sessionRequest.current) return;
      pendingSessionId.current = null;
      setFailedSessionId(sessionId);
      toast({
        title: t('common:toast.error'),
        description: t('search:llm.messages.loadSessionFailed'),
        variant: 'destructive',
      });
    }
  };

  // Handle session deletion
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      // The open session, one still loading, or one whose load failed: drop
      // any answer on its way, and its Retry and debug details
      if (currentSessionId === sessionId || failedSessionId === sessionId || pendingSessionId.current === sessionId) {
        sessionRequest.current += 1;
        pendingSessionId.current = null;
        setCurrentSessionId(undefined);
        setMessages([]);
        setFailedSessionId(null);
        setDebugInfoMap({});
      }
      toast({
        title: t('search:llm.messages.sessionDeleted'),
        description: t('search:llm.messages.sessionDeletedDesc'),
      });
    } catch (err) {
      toast({
        title: t('common:toast.error'),
        description: t('search:llm.messages.deleteSessionFailed'),
        variant: 'destructive',
      });
    }
  };

  // Start new session
  const handleNewSession = () => {
    sessionRequest.current += 1;
    setFailedSessionId(null);
    setCurrentSessionId(undefined);
    setMessages([]);
    setDebugInfoMap({});
    setError(null);
    inputRef.current?.focus();
  };

  // Handle example question selection
  const handleSelectQuestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  // Render disabled state if LLM is not enabled
  if (status && !status.enabled) {
    return (
      <Pane title={t('search:llm.disabledTitle')} className={classes.disabledPane}>
        <p className={classes.intro}>{t('search:llm.disabledSubtitle')}</p>
        <Alert color="gray" variant="light" icon={<AlertCircle />} className={classes.disabled}>
          {t('search:llm.disabledMessage')}
        </Alert>
      </Pane>
    );
  }

  // Handle consent accepted - continue with the pending message
  const handleConsentAccepted = () => {
    // If there's input, send it after consent
    if (input.trim()) {
      // Small delay to let dialog close
      setTimeout(() => {
        handleSend();
      }, 100);
    }
  };

  const placeholder = t('search:llm.inputPlaceholder');

  return (
    <>
      {/* LLM Consent Dialog */}
      <LLMConsentDialog
        open={showConsentDialog}
        onOpenChange={setShowConsentDialog}
        onAccept={handleConsentAccepted}
        llmConfig={llmConfig}
      />

      <Pane
        title={t('search:llm.title', { shortName })}
        actions={
          <SessionList
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onNewSession={handleNewSession}
          />
        }
        flush
        className={classes.chat}
      >
        <div className={classes.chatBody}>
          <p className={classes.subtitle}>{t('search:llm.subtitle')}</p>

          {/* Messages: they scroll here, so the composer and the page header stay in view */}
          <div ref={logRef} role="log" aria-label={t('search:llm.messagesLabel')} className={classes.log} tabIndex={0}>
            {loadFailed ? (
              <LoadError error={t('search:llm.messages.loadFailed')} onRetry={() => { setLoadFailed(false); setLoadAttempt((n) => n + 1); }} />
            ) : failedSessionId ? (
              <LoadError error={t('search:llm.messages.loadSessionFailed')} onRetry={() => handleSelectSession(failedSessionId)} />
            ) : messages.length === 0 ? (
              <div className={classes.welcome}>
                <div className={classes.welcomeIcon}>
                  <Sparkles aria-hidden />
                </div>
                <h3 className={classes.welcomeTitle}>{t('search:llm.welcomeTitle')}</h3>
                <p className={classes.muted}>{t('search:llm.welcomeMessage')}</p>
                <ExampleQuestions
                  onSelectQuestion={handleSelectQuestion}
                  adoptionMode={status?.adoption_mode ?? null}
                />
              </div>
            ) : (
              <div className={classes.messages}>
                {messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    debugInfo={debugInfoMap[message.id]}
                    onRerun={handleRerun}
                    onCopyToInput={handleCopyToInput}
                  />
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className={classes.row} data-role="assistant">
                    <div className={classes.avatar} aria-hidden>
                      <Sparkles aria-hidden />
                    </div>
                    <div className={`${classes.bubble} ${classes.thinking}`}>
                      <Loader size={14} />
                      <span className={classes.muted}>{t('search:llm.thinking')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={classes.composer}>
            {error && (
              <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.error}>
                <span className={classes.errorMessage}>{error}</span>
              </Alert>
            )}

            <div className={classes.composerRow}>
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                // The field was named by its placeholder; it keeps that name
                aria-label={placeholder}
                autosize
                minRows={2}
                maxRows={6}
                disabled={isLoading}
                className={classes.input}
              />
              <ActionIcon
                variant="filled"
                size={36}
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                aria-label={t('search:llm.send')}
                title={t('search:llm.send')}
                className={classes.send}
              >
                {isLoading ? <Loader size={14} color="currentColor" /> : <Send aria-hidden />}
              </ActionIcon>
            </div>

            <p className={classes.hint}>
              {t('search:llm.inputHint')}
              {status?.model_name && (
                <span className={classes.faint}>• {t('search:llm.model')}: {status.model_name}</span>
              )}
              {debugMode && (
                <UnstyledButton className={classes.debugOn} onClick={() => setDebugMode(false)} title={t('search:llm.debug.clickToDisable')} aria-label={t('search:llm.debug.clickToDisable')}>
                  <Bug aria-hidden />
                  {t('search:llm.debug.title')}
                </UnstyledButton>
              )}
            </p>
          </div>
        </div>
      </Pane>
    </>
  );
}
