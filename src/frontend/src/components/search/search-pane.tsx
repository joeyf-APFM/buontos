import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, TextInput, UnstyledButton } from '@mantine/core';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pane } from '@/mantine/page';
import classes from './search.module.css';

export interface SearchResult {
  value: string;
  label: string;
}

export interface SearchPaneProps {
  /** Names the pane. */
  paneLabel: string;
  /** The line over the field ("Search and select a concept:"). */
  intro: string;
  /** Also the field's name. */
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  onFocus: () => void;
  /** Shown under the field while `open`. */
  results: SearchResult[];
  open: boolean;
  onPick: (result: SearchResult) => void;
  /** Before each result's text. */
  icon: ReactNode;
  showClear: boolean;
  clearLabel: string;
  onClear: () => void;
  /** The search answered with nothing for this query. */
  noResults: boolean;
  /** The search's error, if it failed. */
  error: string | null;
  onRetry: () => void;
}

/**
 * The search pane the Concepts and Properties tabs share (wave 2 Task 13b):
 * the intro, the field with Clear at its end, and under it the results (a
 * button each, the IRI in its title), a "No results found" line, or a failed
 * search's error with Retry.
 */
export function SearchPane({
  paneLabel,
  intro,
  placeholder,
  query,
  onQueryChange,
  onFocus,
  results,
  open,
  onPick,
  icon,
  showClear,
  clearLabel,
  onClear,
  noResults,
  error,
  onRetry,
}: SearchPaneProps) {
  const { t } = useTranslation(['search', 'common']);
  return (
    <Pane aria-label={paneLabel}>
      <p className={classes.intro}>{intro}</p>
      <TextInput
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        // The field was named by its placeholder; it keeps that name
        aria-label={placeholder}
        rightSection={
          showClear ? (
            <ActionIcon variant="subtle" color="gray" size={22} aria-label={clearLabel} title={clearLabel} onClick={onClear}>
              <X aria-hidden size={14} />
            </ActionIcon>
          ) : undefined
        }
      />

      {open && results.length > 0 && (
        <div className={classes.results}>
          {results.map((result) => (
            <UnstyledButton key={result.value} className={classes.result} onClick={() => onPick(result)} title={result.value}>
              {icon}
              <span className={classes.ellipsis}>{result.label} - {result.value}</span>
            </UnstyledButton>
          ))}
        </div>
      )}

      {error !== null ? (
        <div className={classes.state}>
          <Alert
            color="red"
            variant="light"
            icon={<AlertCircle />}
            title={t('search:states.searchFailed', 'The search failed.')}
            className={classes.alert}
          >
            {error && <span className={classes.alertMessage}>{error}</span>}
          </Alert>
          <Button variant="outline" onClick={onRetry}>{t('common:retry')}</Button>
        </div>
      ) : noResults ? (
        <p className={classes.note}>{t('search:noResults', 'No results found')}</p>
      ) : null}
    </Pane>
  );
}

/** A failed load of the selected item's details: the error, then Retry. */
export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation(['search', 'common']);
  return (
    <div className={classes.state}>
      <Alert
        color="red"
        variant="light"
        icon={<AlertCircle />}
        title={t('search:states.loadFailed', 'Could not load the details.')}
        className={classes.alert}
      >
        {error && <span className={classes.alertMessage}>{error}</span>}
      </Alert>
      <Button variant="outline" onClick={onRetry}>{t('common:retry')}</Button>
    </div>
  );
}
