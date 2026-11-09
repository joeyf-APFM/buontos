/**
 * Ask Ontos in the shared floating assistant window (R26), rebuilt in
 * Mantine from the old drawer (components/copilot/copilot-panel.tsx): server
 * history, the page/general scope chip, the welcome card, starter prompts,
 * markdown answers, consent gating and the disclaimer.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ActionIcon, Anchor, Button, CloseButton, Menu, Popover, Textarea, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, History, Plus, Sparkles, Trash2 } from 'lucide-react';
import LLMConsentDialog, { hasLLMConsent } from '@/components/common/llm-consent-dialog';
import { useCopilotQuestions } from '@/hooks/use-copilot-questions';
import { chatMessageText } from '@/lib/chat-message-text';
import { useCopilotStore } from '@/stores/copilot-store';
import { useUICustomizationStore } from '@/stores/ui-customization-store';
import type { LLMConfig } from '@/types/llm';
import type { ChatMessage } from '@/types/llm-search';
import { AssistantWindow } from '@/mantine/assistant/assistant-window';
import { SafeMarkdown } from '@/mantine/assistant/safe-markdown';
import { useOntosStore } from './ontos-store';
import classes from './ontos.module.css';

const WELCOME_DISMISSED_KEY = 'copilot-welcome-dismissed';
const isOntosOpen = () => useCopilotStore.getState().isOpen;

const readFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

function HistoryMenu() {
  const { t } = useTranslation(['search', 'ontos-assistant']);
  const [opened, setOpened] = useState(false);
  const sessions = useOntosStore((s) => s.sessions);
  const sessionId = useOntosStore((s) => s.sessionId);
  const { selectSession, deleteSession, newConversation, loadSessions } = useOntosStore((s) => s.actions);

  return (
    <Popover opened={opened} onChange={setOpened} hideDetached={false} position="bottom-end" width={260} shadow="md" withinPortal>
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t('search:llm.history')}
          aria-expanded={opened}
          onClick={() => {
            if (!opened) void loadSessions(); // fresh history each time it opens
            setOpened(!opened);
          }}
        >
          <History size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p={4} className={classes.history}>
        <UnstyledButton
          className={classes.historyItem}
          onClick={() => {
            newConversation();
            setOpened(false);
          }}
        >
          <Plus size={13} aria-hidden /> {t('search:llm.newConversation')}
        </UnstyledButton>
        {sessions.map((session) => {
          const title = session.title || t('search:llm.untitled');
          return (
            <div key={session.id} className={classes.historyRow} data-current={session.id === sessionId || undefined}>
              <UnstyledButton
                className={classes.historyItem}
                onClick={() => {
                  setOpened(false);
                  void selectSession(session.id);
                }}
              >
                {title}
              </UnstyledButton>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={t('ontos-assistant:deleteSession', { title })}
                onClick={() => void deleteSession(session.id)}
              >
                <Trash2 size={12} />
              </ActionIcon>
            </div>
          );
        })}
      </Popover.Dropdown>
    </Popover>
  );
}

function ScopeChip() {
  const { t } = useTranslation('search');
  const pageContext = useCopilotStore((s) => s.pageContext);
  const contextScope = useCopilotStore((s) => s.contextScope);
  const setContextScope = useCopilotStore((s) => s.actions.setContextScope);
  const entity = pageContext?.selectedEntity;

  return (
    <Menu position="bottom-start" shadow="md" withinPortal>
      <Menu.Target>
        <UnstyledButton className={classes.scope}>
          <span>{t('copilot.askingAbout')}</span>
          {contextScope === 'general' ? (
            <span className={classes.scopeValue}>{t('copilot.scopeGeneral')}</span>
          ) : entity ? (
            <>
              <span className={classes.scopeValue}>{entity.name}</span>
              <span className={classes.scopeType}>{entity.type}</span>
            </>
          ) : (
            <span className={classes.scopeValue}>{pageContext?.pageName || t('copilot.scopeThisPage')}</span>
          )}
          <ChevronDown size={12} aria-hidden />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {(['page', 'general'] as const).map((scope) => (
          <Menu.Item
            key={scope}
            leftSection={<Check size={13} style={{ opacity: contextScope === scope ? 1 : 0 }} aria-hidden />}
            onClick={() => setContextScope(scope)}
          >
            {scope === 'page' ? t('copilot.scopePageSpecific') : t('copilot.scopeGeneral')}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const { t } = useTranslation(['search', 'ontos-assistant']);
  if (message.role === 'user') return <div className={classes.me}>{message.content}</div>;
  if (message.error_code) {
    return (
      <div className={`${classes.bot} ${classes.error}`} role="alert">
        {chatMessageText(message, t)}
      </div>
    );
  }
  return (
    <div className={classes.bot} role="article" aria-label={t('ontos-assistant:answer')}>
      <SafeMarkdown text={chatMessageText(message, t)} />
    </div>
  );
}

function OntosContent() {
  const { t } = useTranslation(['search', 'ontos-assistant', 'copilot-questions']);
  const shortName = useUICustomizationStore((s) => s.getShortName());
  const status = useOntosStore((s) => s.status);
  const messages = useOntosStore((s) => s.messages);
  const busy = useOntosStore((s) => s.busy);
  const error = useOntosStore((s) => s.error);
  const draft = useOntosStore((s) => s.draft);
  const { send, setDraft, newConversation, loadSessions } = useOntosStore((s) => s.actions);
  const questionGroups = useCopilotQuestions(status?.adoption_mode ?? null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => readFlag(WELCOME_DISMISSED_KEY));
  const [pending, setPending] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const llmConfig: LLMConfig = {
    enabled: status?.enabled ?? false,
    endpoint: status?.endpoint ?? null,
    system_prompt: null,
    disclaimer_text: status?.disclaimer ?? '',
  };

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Keep the latest message in view
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, error]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    if (!hasLLMConsent(llmConfig)) {
      setPending(text);
      return;
    }
    setDraft('');
    void send(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
    }
  };

  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    } catch {
      // dismissed for this session only
    }
  };

  const placeholder = t('search:copilot.inputPlaceholder', { shortName });

  return (
    <>
      <LLMConsentDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        onAccept={() => {
          const text = pending;
          setPending(null);
          if (text) {
            setDraft('');
            void send(text);
          }
        }}
        llmConfig={llmConfig}
      />
      <div className={classes.scopeRow}>
        <ScopeChip />
      </div>
      <div className={classes.messages} ref={list} role="log" aria-label={t('ontos-assistant:conversation')}>
        {messages.length === 0 ? (
          <>
            {!welcomeDismissed && (
              <div className={classes.welcome}>
                <Sparkles size={14} className={classes.welcomeIcon} aria-hidden />
                <div>
                  <b>{t('search:copilot.welcome', { shortName })}</b>
                  <p>{t('search:copilot.welcomeDescription')}</p>
                </div>
                <CloseButton size="xs" aria-label={t('ontos-assistant:dismissWelcome')} onClick={dismissWelcome} />
              </div>
            )}
            {questionGroups.map((group) => (
              <div key={group.category} role="group" aria-label={group.label}>
                <div className={classes.groupLabel}>{group.label}</div>
                <div className={classes.prompts}>
                  {group.questions.map((q) => (
                    <UnstyledButton key={q.key} className={classes.prompt} onClick={() => ask(q.text)}>
                      {q.text}
                    </UnstyledButton>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
        {busy && <div className={`${classes.bot} ${classes.typing}`}>{t('search:llm.thinking')}</div>}
        {error && (
          <div className={classes.failure} role="alert">
            {error}
          </div>
        )}
      </div>
      <div className={classes.composer}>
        <div className={classes.inputRow}>
          <Textarea
            className={classes.input}
            aria-label={placeholder}
            placeholder={placeholder}
            autosize
            minRows={1}
            maxRows={5}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          <Button color="aura.9" onClick={() => ask(draft)} disabled={busy || !draft.trim()}>
            {t('ontos-assistant:send')}
          </Button>
        </div>
        {messages.length > 0 && (
          <Anchor component="button" type="button" className={classes.newConversation} onClick={newConversation}>
            {t('search:llm.newConversation')}
          </Anchor>
        )}
        {status?.disclaimer && <div className={classes.disclaimer}>{status.disclaimer}</div>}
      </div>
    </>
  );
}

export function OntosWindow() {
  const { t } = useTranslation(['search', 'ontos-assistant']);
  const shortName = useUICustomizationStore((s) => s.getShortName());
  const rect = useCopilotStore((s) => s.windowRect);
  const focusRequested = useCopilotStore((s) => s.focusRequested);
  const { closePanel, setWindowRect, takeFocusRequest } = useCopilotStore((s) => s.actions);

  return (
    <AssistantWindow
      title={t('search:copilot.title', { shortName })}
      icon={<Sparkles size={14} aria-hidden />}
      headerExtras={<HistoryMenu />}
      closeLabel={t('ontos-assistant:close', { shortName })}
      onClose={closePanel}
      isOpen={isOntosOpen}
      rect={rect}
      onRectChange={setWindowRect}
      focusRequested={focusRequested}
      takeFocusRequest={takeFocusRequest}
    >
      <OntosContent />
    </AssistantWindow>
  );
}
