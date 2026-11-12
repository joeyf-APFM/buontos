import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Checkbox, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { useApi } from '@/hooks/use-api';
import classes from './concept-select-dialog.module.css';
import type {
  InlineSuggestRequest,
  InlineSuggestResponse,
  InlineSuggestion,
  TermMappingTargetEntityType,
} from '@/types/term-mapping';

// `type` is the real concept_type when the list is type-filtered
// (e.g. 'class', 'individual'); otherwise 'class' or 'property'.
// `source_context` (type-filtered list only) is the scheme's group key.
type ConceptItem = { value: string; label: string; type: string; source_context?: string | null };

interface MappingSource {
  /** Term-mapping entity_type (e.g. 'asset' or 'data_contract_property'). */
  entity_type: TermMappingTargetEntityType;
  /** Entity id in the same encoding the term-mapping adapters use.
   *  Can be a placeholder when the entity isn't saved yet; pair with
   *  `name` so the backend can still propose suggestions. */
  entity_id: string;
  /** Display name to use when the entity isn't persisted (draft form). */
  name?: string;
  /** Primitive type hint (e.g. "string", "integer"). */
  type_label?: string;
  /** Parent entity name (e.g. table name for a column). */
  parent_name?: string;
}

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (iri: string) => void;
  parentConceptIris?: string[];
  entityType?: 'class' | 'property';
  /** When provided, the dialog adds a "Suggested by mapping" tier sourced
   *  from the term-mapping inline heuristic. No persistence; purely a hint. */
  mappingSource?: MappingSource;
  /** Optional: only offer concepts whose `concept_type` is listed (e.g.
   *  ['class'] for an rdfs:subClassOf picker). Omit for the default list. */
  conceptTypes?: string[];
  /** Optional: restrict the type-filtered list to one scheme (its group key,
   *  sent as `source_context`). Ignored without `conceptTypes`. */
  scopeSourceKey?: string;
  /** Display label of the scoped scheme (group header). */
  scopeLabel?: string;
  /** Group key -> scheme label for the group headers; falls back to the key. */
  schemeLabels?: Record<string, string>;
  /** Scoped mode only: offer an "Include other schemes" checkbox (off by
   *  default) that lists all schemes, grouped by scheme. */
  allowOtherSchemes?: boolean;
  /** IRIs never offered (dropped client-side after the fetch). */
  excludeIris?: string[];
  /** Overrides for the default title and search placeholder. */
  title?: string;
  searchPlaceholder?: string;
  /**
   * Where focus goes once the picker has closed, for an opener that unmounts
   * meanwhile (BusinessConceptsDisplay's empty-state Add gives way to the
   * list's Add once a concept is picked). Otherwise the kit Dialog gives
   * focus back to its opener itself (ruling R41).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

// Scoped or widened lists drop excluded entries client-side, so ask for more.
const SCOPED_LIMIT = '200';

export default function ConceptSelectDialog({
  isOpen,
  onOpenChange,
  onSelect,
  parentConceptIris,
  entityType = 'class',
  mappingSource,
  conceptTypes,
  scopeSourceKey,
  scopeLabel,
  schemeLabels,
  allowOtherSchemes = false,
  excludeIris,
  title,
  searchPlaceholder,
  returnFocusTo,
}: Props) {
  const { t } = useTranslation();
  const { get, post } = useApi();
  const [q, setQ] = useState('');
  const [suggested, setSuggested] = useState<ConceptItem[]>([]);
  const [other, setOther] = useState<ConceptItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [includeOtherSchemes, setIncludeOtherSchemes] = useState(false);
  const [mappingHints, setMappingHints] = useState<InlineSuggestion[]>([]);

  // Type-filtered mode: the flat concepts endpoint narrows by concept_type
  // server-side. No "suggested" tier in this mode.
  const typeFilter = conceptTypes && conceptTypes.length > 0 ? conceptTypes.join(',') : '';
  // Scoped mode: type-filtered and limited to one scheme. The opt-in checkbox
  // widens it to all schemes (grouped by scheme below).
  const scoped = !!scopeSourceKey && !!typeFilter && entityType !== 'property';
  const widened = scoped && allowOtherSchemes && includeOtherSchemes;

  useEffect(() => {
    // An answer for a search the user has typed past is dropped
    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams({
        q: q,
        limit: scoped ? SCOPED_LIMIT : '50'
      });

      const baseEndpoint = entityType === 'property' ? '/api/semantic-models/properties' : '/api/semantic-models/concepts';

      const list = (data: unknown): ConceptItem[] => (Array.isArray(data) ? data : []);
      if (typeFilter && entityType !== 'property') {
        params.set('concept_types', typeFilter);
        if (scoped && !widened) params.set('source_context', scopeSourceKey!);
        const res = await get<ConceptItem[]>(`${baseEndpoint}?${params}`);
        if (cancelled) return;
        setSuggested([]);
        setOther(list(res.data));
      } else if (parentConceptIris && parentConceptIris.length > 0) {
        params.set('parent_iris', parentConceptIris.join(','));
        const res = await get<{suggested: ConceptItem[], other: ConceptItem[]}>(`${baseEndpoint}/suggestions?${params}`);
        if (cancelled) return;
        setSuggested(list(res.data?.suggested));
        setOther(list(res.data?.other));
      } else {
        const res = await get<ConceptItem[]>(`${baseEndpoint}?${params}`);
        if (cancelled) return;
        setSuggested([]);
        setOther(list(res.data));
      }
      setLoaded(true);
    };
    const timer = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, parentConceptIris, entityType, typeFilter, scoped, widened, scopeSourceKey]);

  const excludeKey = (excludeIris || []).join('|');
  const excluded = useMemo(() => new Set(excludeKey ? excludeKey.split('|') : []), [excludeKey]);
  const visibleSuggested = excluded.size ? suggested.filter((r) => !excluded.has(r.value)) : suggested;
  const visibleOther = excluded.size ? other.filter((r) => !excluded.has(r.value)) : other;

  // Widened list: one group per scheme, the scoped scheme first, then the
  // others by label. Headers only when more than one scheme is present.
  const schemeLabel = (key: string) => schemeLabels?.[key] || key;
  const byScheme = new Map<string, ConceptItem[]>();
  if (widened) {
    visibleOther.forEach((r) => {
      const key = r.source_context || '';
      if (!byScheme.has(key)) byScheme.set(key, []);
      byScheme.get(key)!.push(r);
    });
  }
  const groups = widened
    ? Array.from(byScheme.entries())
        .sort(([a], [b]) => {
          if (a === scopeSourceKey) return -1;
          if (b === scopeSourceKey) return 1;
          return schemeLabel(a).localeCompare(schemeLabel(b));
        })
        .map(([key, items]) => ({ key, items }))
    : [{ key: '', items: visibleOther }];
  const showGroupHeaders = groups.length > 1;
  const groupHeader = (key: string) => {
    if (key === scopeSourceKey) {
      return t('semantic-models:conceptSelect.thisScheme', 'This scheme: {{label}}', {
        label: scopeLabel || schemeLabel(key),
      });
    }
    return key ? schemeLabel(key) : t('semantic-models:conceptSelect.noScheme', 'No scheme');
  };
  const classesOnly = typeFilter === 'class';

  // Inline mapping suggestions. We deliberately re-fetch only when the
  // dialog is (re)opened or the source entity changes — these are
  // expensive (full heuristic run) and shouldn't fire on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen || !mappingSource) {
        setMappingHints([]);
        return;
      }
      try {
        const body: InlineSuggestRequest = {
          source_entity_type: mappingSource.entity_type,
          source_entity_id: mappingSource.entity_id,
          limit: 5,
          ...(mappingSource.name ? { name: mappingSource.name } : {}),
          ...(mappingSource.type_label ? { type_label: mappingSource.type_label } : {}),
          ...(mappingSource.parent_name ? { parent_name: mappingSource.parent_name } : {}),
        };
        const res = await post<InlineSuggestResponse>('/api/term-mappings/suggestions-for', body);
        if (cancelled) return;
        setMappingHints(Array.isArray(res.data?.suggestions) ? res.data.suggestions : []);
      } catch {
        // Mapping hints are pure value-add; never block the picker.
        if (!cancelled) setMappingHints([]);
      }
    };
    void run();
    return () => { cancelled = true; };
    // Re-fetch when the user edits the in-progress name in a draft form
    // so suggestions track what's actually typed.
  }, [
    isOpen,
    mappingSource?.entity_type,
    mappingSource?.entity_id,
    mappingSource?.name,
    mappingSource?.type_label,
    mappingSource?.parent_name,
  ]);

  const placeholder = searchPlaceholder ?? `Search business ${entityType === 'property' ? 'properties' : 'concepts'}...`;

  // One concept: its type, the label over the IRI, and Select
  const row = (r: ConceptItem, tier?: 'suggested') => (
    <div key={r.value} className={classes.row} data-tier={tier}>
      <div className={classes.main}>
        <Badge variant="secondary" className={classes.type}>{r.type}</Badge>
        <div className={classes.text}>
          <div className={classes.label} title={r.label}>
            {r.label}
          </div>
          <div className={classes.iri} title={r.value}>
            {r.value}
          </div>
        </div>
      </div>
      <Button size="sm" variant={tier ? 'default' : 'outline'} className={classes.select} onClick={() => onSelect(r.value)}>Select</Button>
    </div>
  );

  // On the kit Dialog: its callers open it from the page or from a kit
  // dialog (wave 2 Task 15; the Radix ones that stacked it moved first, R38)
  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="xl"
      title={title ?? `Select Business ${entityType === 'property' ? 'Property' : 'Concept'}`}
      returnFocusTo={returnFocusTo}
    >
      <div className={classes.picker}>
        <TextInput
          placeholder={placeholder}
          aria-label={placeholder}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          data-autofocus
        />
        {scoped && allowOtherSchemes && (
          <Checkbox
            id="concept-select-include-other-schemes"
            checked={includeOtherSchemes}
            onChange={(e) => setIncludeOtherSchemes(e.currentTarget.checked)}
            label={t('semantic-models:conceptSelect.includeOtherSchemes', 'Include other schemes')}
          />
        )}
        <div className={classes.results}>
          {mappingHints.length > 0 && (
            <div className={classes.tier}>
              <div className={classes.tierHead}>
                <Sparkles aria-hidden /> Suggested by term mapping
              </div>
              {mappingHints.map((h) => (
                <div key={h.target_concept_iri} className={classes.row} data-tier="mapping">
                  <div className={classes.main}>
                    <Badge variant="secondary" className={classes.type}>
                      {Math.round(h.confidence * 100)}%
                    </Badge>
                    <div className={classes.text}>
                      <div className={classes.label} title={h.target_concept_label ?? h.target_concept_iri}>
                        {h.target_concept_label ?? h.target_concept_iri}
                      </div>
                      <div className={classes.reason} title={h.reason}>
                        {h.reason}
                      </div>
                      <div className={classes.iri} title={h.target_concept_iri}>
                        {h.target_concept_iri}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="default" className={classes.select} onClick={() => onSelect(h.target_concept_iri)}>Select</Button>
                </div>
              ))}
            </div>
          )}
          {visibleSuggested.length > 0 && (
            <div className={classes.tier}>
              <div className={classes.tierHead}>
                Suggested (child {entityType === 'property' ? 'properties' : 'concepts'})
              </div>
              {visibleSuggested.map((r) => row(r, 'suggested'))}
            </div>
          )}
          {visibleOther.length > 0 && (
            <div className={classes.tier}>
              {visibleSuggested.length > 0 && (
                <div className={classes.tierHead}>
                  Other {entityType === 'property' ? 'properties' : 'concepts'}
                </div>
              )}
              {groups.map((group) => (
                <div key={group.key || '_'} className={classes.tier}>
                  {showGroupHeaders && (
                    <div className={classes.tierHead}>
                      {groupHeader(group.key)}
                    </div>
                  )}
                  {group.items.map((r) => row(r))}
                </div>
              ))}
            </div>
          )}
          {scoped && !widened && loaded && visibleOther.length === 0 && (
            <div className={classes.empty}>
              <p>
                {q.trim()
                  ? t('semantic-models:conceptSelect.noMatchesInScheme', 'No matches in this scheme.')
                  : classesOnly
                    ? t('semantic-models:conceptSelect.noClassesInScheme', 'No classes in this scheme yet.')
                    : t('semantic-models:conceptSelect.noConceptsInScheme', 'No concepts in this scheme yet.')}
              </p>
              {allowOtherSchemes && (
                <p>
                  {t(
                    'semantic-models:conceptSelect.includeOtherSchemesHint',
                    'Tick "Include other schemes" to pick from another scheme.',
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
