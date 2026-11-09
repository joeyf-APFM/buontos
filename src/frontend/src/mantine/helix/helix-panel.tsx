/** Ask Helix's content, which the floating window (helix-window.tsx) renders. */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Anchor, Button, CloseButton, Textarea, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { HelixMark } from './helix-mark';
import { HelixMarkdown } from './helix-markdown';
import { useHelixStore, type HelixResult, type Turn } from './helix-store';
import classes from './helix.module.css';

const PREVIEW_ROWS = 5;
const SUGGESTIONS = ['contents', 'usage', 'changes'] as const;

/**
 * Where "Open in Databricks" points for a conversation. Genie One's
 * conversation URL isn't known yet (Task 1's spike, ruling R3), so there is no
 * link: once it is, build it here and each answer shows the link.
 */
function databricksConversationUrl(_workspaceHost: string, _conversationId: string | null): string | null {
  return null;
}

function ResultPreview({ result }: { result: HelixResult }) {
  const { t } = useTranslation('helix');
  const rows = result.rows.slice(0, PREVIEW_ROWS);
  const total = Number(result.total);
  return (
    <>
      <table className={classes.preview}>
        <thead>
          <tr>
            {result.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} title={cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {Number.isFinite(total) && total > rows.length && (
        <div className={classes.footer}>{t('panel.rows', { count: total, total: total.toLocaleString() })}</div>
      )}
    </>
  );
}

function Answer({ turn, pending }: { turn: Turn; pending: boolean }) {
  const { t } = useTranslation('helix');
  const [showSql, setShowSql] = useState(false);
  const workspaceHost = useHelixStore((s) => s.config?.workspace_host ?? '');
  const conversationId = useHelixStore((s) => s.conversationId);
  const openUrl = databricksConversationUrl(workspaceHost, conversationId);
  const waiting = pending && !turn.text && !turn.error;

  return (
    <div className={classes.bot} role="article" aria-label={t('panel.answer')}>
      {waiting && <div className={classes.typing}>{t('panel.thinking')}</div>}
      {turn.text && <HelixMarkdown text={turn.text} workspaceHost={workspaceHost} />}
      {showSql && turn.sql.length > 0 && <pre className={classes.sql}>{turn.sql.join('\n\n')}</pre>}
      {turn.result && turn.result.columns.length > 0 && <ResultPreview result={turn.result} />}
      {turn.error && (
        <div className={classes.error} role="alert">
          {turn.error}
        </div>
      )}
      {turn.stopped && <div className={classes.stopped}>{t('panel.stopped')}</div>}
      {(turn.sql.length > 0 || openUrl) && (
        <div className={classes.footer}>
          {turn.sql.length > 0 && (
            <UnstyledButton className={classes.link} onClick={() => setShowSql((v) => !v)} aria-expanded={showSql}>
              {showSql ? t('panel.hideSql') : t('panel.showSql')}
            </UnstyledButton>
          )}
          {openUrl && (
            <Anchor className={classes.link} href={openUrl} target="_blank" rel="noopener noreferrer">
              {t('panel.openInDatabricks')}
            </Anchor>
          )}
        </div>
      )}
    </div>
  );
}

interface HelixContentProps {
  /** The id for the title, which the window's dialog is labelled by. */
  titleId: string;
  /** The window drags by its header. */
  onHeaderPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
}

/** Helix's header, context chip, conversation and input. */
export function HelixContent({ titleId, onHeaderPointerDown }: HelixContentProps) {
  const { t } = useTranslation('helix');
  const context = useHelixStore((s) => s.context);
  const turns = useHelixStore((s) => s.turns);
  const busy = useHelixStore((s) => s.busy);
  const mode = useHelixStore((s) => s.config?.mode);
  const draft = useHelixStore((s) => s.draft);
  const { close, clearContext, ask, stop, newConversation, setDraft } = useHelixStore((s) => s.actions);
  const messages = useRef<HTMLDivElement>(null);

  // Keep the latest answer in view as it streams
  useEffect(() => {
    const el = messages.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const send = (question: string) => {
    if (!question.trim() || busy) return;
    setDraft('');
    void ask(question);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <>
      <div
        className={classes.head}
        data-drag-handle={onHeaderPointerDown ? true : undefined}
        onPointerDown={onHeaderPointerDown}
      >
        <HelixMark className={classes.headMark} />
        <h2 id={titleId} className={classes.headTitle}>
          {t('panel.title')} <span className={classes.headSub}>{t('panel.subtitle')}</span>
        </h2>
        <CloseButton className={classes.close} aria-label={t('panel.close')} onClick={close} />
      </div>
      {mode === 'shared' && <div className={classes.shared}>{t('panel.shared')}</div>}
      {context && (
        <div className={classes.context}>
          <span>{t('panel.context')}</span>
          <span className={`${classes.contextValue} ${classes.mono}`} title={context}>
            {context}
          </span>
          <CloseButton size="xs" aria-label={t('panel.removeContext')} onClick={clearContext} />
        </div>
      )}
      <div className={classes.messages} ref={messages} role="log" aria-label={t('panel.conversation')}>
        {turns.length === 0 ? (
          <div>
            <div className={classes.hint}>
              {context ? t('panel.hintWithContext') : t('panel.hintWithoutContext')}{' '}
              {mode === 'shared' ? t('panel.hintShared') : t('panel.hintUser')}
            </div>
            <div className={classes.chips}>
              {SUGGESTIONS.map((key) => (
                <UnstyledButton key={key} className={classes.chip} onClick={() => send(t(`panel.suggestions.${key}`))}>
                  {t(`panel.suggestions.${key}`)}
                </UnstyledButton>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <div className={classes.me}>{turn.question}</div>
              <Answer turn={turn} pending={busy && i === turns.length - 1} />
            </div>
          ))
        )}
      </div>
      <div className={classes.composer}>
        <div className={classes.inputRow}>
          <Textarea
            className={classes.input}
            aria-label={t('panel.input')}
            placeholder={t('panel.placeholder')}
            autosize
            minRows={1}
            maxRows={5}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          {busy ? (
            <Button variant="default" onClick={stop}>
              {t('panel.stop')}
            </Button>
          ) : (
            <Button color="aura.9" onClick={() => send(draft)} disabled={!draft.trim()}>
              {t('panel.ask')}
            </Button>
          )}
        </div>
        {turns.length > 0 && (
          <Anchor component="button" type="button" className={classes.newConversation} onClick={newConversation}>
            {t('panel.newConversation')}
          </Anchor>
        )}
      </div>
    </>
  );
}
