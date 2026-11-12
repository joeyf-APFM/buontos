/**
 * Read-only Turtle serialization viewer for a concept's RDF triples.
 * Advanced view only. Fetches triples via SPARQL query and displays as Turtle syntax.
 */
import { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader } from '@mantine/core';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import panel from '@/components/common/panel.module.css';
import classes from './turtle-serialization-panel.module.css';

interface TurtleSerializationPanelProps {
  conceptIri: string;
}

export function TurtleSerializationPanel({ conceptIri }: TurtleSerializationPanelProps) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { post } = useApi();
  const { toast } = useToast();

  const [turtleText, setTurtleText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  // Retry bumps it, to fetch again
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // An answer for a concept the page has moved on from is dropped
    let cancelled = false;
    const fetchTriples = async () => {
      setLoading(true);
      setError(null);
      try {
        // Query the triples for this concept
        const sparql = `SELECT ?p ?o WHERE { <${conceptIri}> ?p ?o }`;
        const res = await post<Array<{ p: string; o: string | object }>>('/api/semantic-models/query', {
          sparql,
        });
        if (cancelled) return;

        if (res.error) {
          throw new Error(res.error);
        }

        if (!res.data || !Array.isArray(res.data)) {
          throw new Error('Invalid response format');
        }

        // Format as Turtle: <subject> <predicate> <object> .
        const lines = res.data.map((row) => {
          const p = row.p || '';
          let o = row.o || '';

          // Handle object: if it's a URI, wrap in <>; if string, quote it
          let objStr: string;
          if (typeof o === 'string') {
            // Simple heuristic: if it looks like a URL/IRI, wrap in <>; else quote
            if (o.startsWith('http://') || o.startsWith('https://') || o.startsWith('urn:')) {
              objStr = `<${o}>`;
            } else {
              // Escape quotes in the string
              const escaped = o.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              objStr = `"${escaped}"`;
            }
          } else {
            // JSON object — stringify it
            objStr = JSON.stringify(o);
          }

          return `<${conceptIri}> <${p}> ${objStr} .`;
        });

        if (lines.length === 0) {
          setTurtleText(`# No triples found for <${conceptIri}>`);
        } else {
          setTurtleText(lines.join('\n'));
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to fetch triples');
        setTurtleText('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (conceptIri) {
      fetchTriples();
    }
    return () => {
      cancelled = true;
    };
  }, [conceptIri, post, attempt]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(turtleText);
      toast({
        title: t('common:toast.success'),
        description: t('common:messages.copiedToClipboard', { defaultValue: 'Copied to clipboard' }),
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('common:toast.error'),
        description: err?.message || 'Failed to copy',
      });
    }
  };

  // A flush panel (components/common/panel.module.css): the page's Pane frames it
  return (
    <div className={panel.pane} data-flush aria-labelledby={titleId}>
      <div className={panel.head}>
        <h3 id={titleId} className={panel.title}>
          {t('semantic-models:advanced.turtle', 'RDF (Turtle)')}
        </h3>
        {!loading && !error && turtleText && (
          <div className={panel.actions}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={24}
              onClick={handleCopy}
              aria-label={t('common:actions.copy', 'Copy')}
              title={t('common:actions.copy', 'Copy')}
            >
              <Copy size={14} />
            </ActionIcon>
          </div>
        )}
      </div>

      <div className={panel.body}>
        {loading && (
          <p className={classes.loading}>
            <Loader size={12} color="currentColor" />
            {t('common:actions.loading')}
          </p>
        )}

        {error && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('common:toast.error')}>
            <span className={classes.error}>{error}</span>
            <div className={classes.alertActions}>
              <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {t('common:retry')}
              </Button>
            </div>
          </Alert>
        )}

        {!loading && !error && turtleText && <pre className={classes.turtle}>{turtleText}</pre>}
      </div>
    </div>
  );
}
