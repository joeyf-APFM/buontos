import { useTranslation } from 'react-i18next';
import { ActionIcon } from '@mantine/core';
import { BookOpen, Copy, ExternalLink, Layers, User, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AURA_STATUS, badgeToneStyle } from '@/components/common/aura-status';
import { typeTone } from '@/components/knowledge/concept-tones';
import { StatusProgressBar } from '@/components/semantic/status-progress-bar';
import { DetailsGrid, type DetailsRow } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { systemRdfNamespaceDisplayLabel } from '@/lib/system-rdf-namespace-labels';
import type { OntologyConcept } from '@/types/ontology';
import classes from './concept-summary-panel.module.css';

// ---------------------------------------------------------------------------
// ConceptSummaryPanel: the first pane on the concept detail page, under the
// page header that carries the concept's name and status (wave 2 Task 15).
// Mirrors the Data Contracts "core metadata": the full lifecycle chain, the
// key facts (type / version / status / scheme), the copyable IRI (Advanced
// view only, it is the ontology layer), and the business-facing synonyms /
// examples captured in the Edit Concept dialog. Purely presentational: the
// page owns data and actions.
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, typeof Layers> = {
  concept: Layers,
  class: BookOpen,
  property: Zap,
  individual: User,
  term: Layers,
};

export interface ConceptSummaryPanelProps {
  concept: OntologyConcept;
  /** Engine's current version number; hidden while unknown. */
  currentVersion?: number | null;
  /** Scheme record's current label; falls back to the prettified source key. */
  schemeLabel?: string;
}

export function ConceptSummaryPanel({ concept, currentVersion, schemeLabel }: ConceptSummaryPanelProps) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { toast } = useToast();

  // Properties have no lifecycle and no versions.
  const isProperty = concept.concept_type === 'property';
  const showStatus = Boolean(concept.status) && !isProperty;
  const synonyms = concept.synonyms ?? [];
  const examples = concept.examples ?? [];

  const handleCopyIri = async () => {
    try {
      await navigator.clipboard.writeText(concept.iri);
      toast({
        title: t('common:toast.success'),
        description: t('common:messages.copiedToClipboard', { defaultValue: 'Copied to clipboard' }),
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t('common:toast.error'),
        description: t('semantic-models:summary.copyFailed', 'Could not copy the IRI.'),
      });
    }
  };

  const TypeIcon = TYPE_ICONS[concept.concept_type] || Layers;
  const tone = typeTone(concept.concept_type);
  const scheme = concept.source_context
    ? schemeLabel ?? systemRdfNamespaceDisplayLabel(concept.source_context, t)
    : null;

  // Key facts (mirrors the contract header card)
  const facts: DetailsRow[] = [
    {
      label: t('semantic-models:summary.type', 'Type'),
      value: (
        <span className={classes.typeLine}>
          <TypeIcon aria-hidden style={{ color: AURA_STATUS[tone].mark }} />
          <Badge variant="outline" style={badgeToneStyle(tone)}>
            {t(`semantic-models:types.${concept.concept_type}`)}
          </Badge>
        </span>
      ),
    },
    ...(!isProperty
      ? [{
          label: t('semantic-models:summary.version', 'Version'),
          value: currentVersion != null
            ? <Badge variant="secondary" className={classes.version}>v{currentVersion}</Badge>
            : <span className={classes.dash}>-</span>,
        }]
      : []),
    ...(showStatus
      ? [{
          label: t('semantic-models:summary.status', 'Status'),
          value: t(`semantic-models:status.${concept.status}`, concept.status as string),
        }]
      : []),
    ...(scheme ? [{ label: t('semantic-models:fields.scheme', 'Concept scheme'), value: scheme }] : []),
    // Synonyms and examples from the Edit Concept dialog, only when set.
    ...(synonyms.length > 0
      ? [{
          label: t('semantic-models:fields.synonyms', 'Synonyms'),
          value: (
            <div className={classes.chips} data-testid="concept-summary-synonyms">
              {synonyms.map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </div>
          ),
        }]
      : []),
    ...(examples.length > 0
      ? [{
          label: t('semantic-models:fields.examples', 'Examples'),
          value: (
            <ul className={classes.examples} data-testid="concept-summary-examples">
              {examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ),
        }]
      : []),
  ];

  return (
    <div className={classes.summary} data-testid="concept-summary-panel">
      {/* Full-lifecycle visibility: where this concept sits in the chain. */}
      {showStatus && <StatusProgressBar status={concept.status as string} />}

      <DetailsGrid rows={facts} />

      {/* Raw IRI chip: ontology layer, Advanced view only. Copyable. */}
      <div className={`adv-only ${classes.iri}`} data-testid="concept-summary-iri">
        <span className={classes.iriLabel}>IRI</span>
        <code className={classes.iriCode} title={concept.iri}>
          {concept.iri}
        </code>
        <ActionIcon
          variant="subtle"
          color="gray"
          size={24}
          onClick={() => {
            void handleCopyIri();
          }}
          aria-label={t('semantic-models:summary.copyIri', 'Copy IRI')}
          title={t('semantic-models:summary.copyIri', 'Copy IRI')}
        >
          <Copy size={14} />
        </ActionIcon>
        <a
          href={concept.iri}
          target="_blank"
          rel="noopener noreferrer"
          className={classes.open}
          aria-label={t('semantic-models:details.openIriAria')}
        >
          <ExternalLink size={14} aria-hidden />
        </a>
      </div>
    </div>
  );
}

export default ConceptSummaryPanel;
