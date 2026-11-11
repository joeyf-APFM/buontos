import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Checkbox,
  Combobox,
  InputBase,
  Loader,
  TextInput,
  Textarea,
  useCombobox,
} from '@mantine/core';
import { Check, Sparkles, X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { InfoTip } from '@/components/common/info-tip';
import { FIELD_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { useConceptMode, ConceptModeSwitch } from '@/components/concepts/mode-switch';

import type { AssetTypeRead } from '@/types/asset';
import type {
  Run,
  RunCreatePayload,
  TermMappingTargetEntityType,
} from '@/types/term-mapping';
import {
  SHIPPED_OPT_IN_CONTEXTS,
  TARGET_ENTITY_TYPE_LABELS,
} from '@/types/term-mapping';
import classes from './run-config-dialog.module.css';

/**
 * A selectable concept-scheme mapping source, as returned by
 * GET /api/term-mappings/contexts. This is provenance-agnostic: it includes
 * schemes authored/imported on the Explore/Define page (urn:glossary /
 * urn:ontology / urn:taxonomy) AND uploaded RDF sources (urn:semantic-model) —
 * exactly the set the engine runs against. (Previously the dialog read the
 * semantic_models table, so Explore-authored ontologies were invisible and it
 * wrongly reported 'no customer ontologies loaded'.)
 */
interface SelectableContext {
  context: string;
  label: string;
  concept_count: number;
}

interface RunConfigDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created run once the suggester finishes. */
  onCreated: (run: Run) => void;
}

/** Default asset-type filter (matches the backend's historical default). */
const DEFAULT_ASSET_TYPE_NAMES = ['Column'];

const DEFAULT_ENTITY_TYPES: TermMappingTargetEntityType[] = [
  'asset',
  'data_contract_property',
];

export default function RunConfigDialog({
  isOpen,
  onOpenChange,
  onCreated,
}: RunConfigDialogProps) {
  const { t } = useTranslation(['term-mapping', 'common']);
  const { toast } = useToast();
  const { get, post } = useApi();
  const [mode] = useConceptMode();
  const advanced = mode === 'advanced';

  const [models, setModels] = useState<SelectableContext[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Form state ---------------------------------------------------------------
  // Empty selectedContexts === "use every enabled customer ontology"
  // (backend default). We still surface the list so users see what will run.
  const [selectedContexts, setSelectedContexts] = useState<Set<string>>(new Set());
  const [allContexts, setAllContexts] = useState<boolean>(true);
  const [shippedSelected, setShippedSelected] = useState<Set<string>>(new Set());
  const [entityTypes, setEntityTypes] = useState<Set<TermMappingTargetEntityType>>(
    new Set(DEFAULT_ENTITY_TYPES),
  );
  const [assetTypeNames, setAssetTypeNames] = useState<string[]>(DEFAULT_ASSET_TYPE_NAMES);
  const [assetTypes, setAssetTypes] = useState<AssetTypeRead[]>([]);
  const [assetTypesLoading, setAssetTypesLoading] = useState(false);
  const [assetTypeSearch, setAssetTypeSearch] = useState('');
  const [limit, setLimit] = useState<string>('500');
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Reset whenever the dialog opens fresh.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedContexts(new Set());
    setAllContexts(true);
    setShippedSelected(new Set());
    setEntityTypes(new Set(DEFAULT_ENTITY_TYPES));
    setAssetTypeNames(DEFAULT_ASSET_TYPE_NAMES);
    setLimit('500');
    setComment('');
    void fetchModels();
    void fetchAssetTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // A newer load (a Retry, or the dialog opening again) drops an older answer
  const modelsSeq = useRef(0);
  const fetchModels = async () => {
    const seq = ++modelsSeq.current;
    setModelsLoading(true);
    setModelsError(null);
    try {
      // Provenance-agnostic: every selectable concept scheme in the graph
      // (authored/imported on Explore/Define AND uploaded RDF sources), i.e.
      // exactly what the engine will run against. NOT the semantic_models table.
      const res = await get<SelectableContext[]>('/api/term-mappings/contexts');
      if (res.error) throw new Error(res.error);
      if (seq !== modelsSeq.current) return;
      const contexts = Array.isArray(res.data) ? res.data : [];
      setModels(contexts);
      // Out-of-the-box ergonomics: when the user has zero customer schemes,
      // pre-check the Databricks shipped taxonomy so "Create run" is immediately
      // useful for demos / first-time exploration. They can still uncheck it.
      if (contexts.length === 0) {
        setShippedSelected((prev) =>
          prev.size === 0 ? new Set(['urn:taxonomy:databricks_ontology']) : prev,
        );
      }
    } catch (e) {
      if (seq !== modelsSeq.current) return;
      setModelsError(
        e instanceof Error ? e.message : t('runConfig.toast.loadOntologiesFailed'),
      );
    } finally {
      if (seq === modelsSeq.current) setModelsLoading(false);
    }
  };

  // Asset types come from the same endpoint as Settings > Asset Types. A
  // failure is non-fatal: the default selection still submits.
  const assetTypesSeq = useRef(0);
  const fetchAssetTypes = async () => {
    const seq = ++assetTypesSeq.current;
    setAssetTypesLoading(true);
    try {
      const res = await get<AssetTypeRead[]>('/api/asset-types?limit=100');
      if (res.error) throw new Error(res.error);
      if (seq !== assetTypesSeq.current) return;
      const list = Array.isArray(res.data) ? res.data : [];
      setAssetTypes(list.filter((at) => at.status !== 'deprecated'));
    } catch {
      if (seq === assetTypesSeq.current) setAssetTypes([]);
    } finally {
      if (seq === assetTypesSeq.current) setAssetTypesLoading(false);
    }
  };

  // Options = API asset types, plus any selected name the API didn't return
  // (e.g. the 'Column' default before types load) so it stays removable.
  const assetTypeOptions = useMemo(() => {
    const names = assetTypes.map((at) => at.name);
    const extra = assetTypeNames.filter((n) => !names.includes(n));
    return [...names, ...extra].sort((a, b) => a.localeCompare(b));
  }, [assetTypes, assetTypeNames]);

  const visibleAssetTypes = useMemo(() => {
    const q = assetTypeSearch.trim().toLowerCase();
    return q ? assetTypeOptions.filter((n) => n.toLowerCase().includes(q)) : assetTypeOptions;
  }, [assetTypeOptions, assetTypeSearch]);

  // The asset-type picker: a list with a search field. Escape closes only
  // the list (the kit Dialog leaves the key to it) and gives focus back to
  // the picker's button.
  const assetTypesTarget = useRef<HTMLButtonElement>(null);
  const assetTypesBox = useCombobox({
    onDropdownOpen: () => assetTypesBox.focusSearchInput(),
    onDropdownClose: (source) => {
      assetTypesBox.resetSelectedOption();
      setAssetTypeSearch('');
      if (source === 'keyboard') assetTypesTarget.current?.focus();
    },
  });

  const handleToggleAssetType = (name: string) => {
    setAssetTypeNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const enabledCustomerCount = models.length;

  const previewContextNames = useMemo(() => {
    if (allContexts) return models.map((m) => m.label);
    return models
      .filter((m) => selectedContexts.has(m.context))
      .map((m) => m.label);
  }, [models, selectedContexts, allContexts]);

  const handleToggleContext = (urn: string) => {
    setAllContexts(false);
    setSelectedContexts((prev) => {
      const next = new Set(prev);
      if (next.has(urn)) {
        next.delete(urn);
      } else {
        next.add(urn);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    setAllContexts((prev) => !prev);
    setSelectedContexts(new Set());
  };

  const handleToggleShipped = (urn: string) => {
    setShippedSelected((prev) => {
      const next = new Set(prev);
      if (next.has(urn)) {
        next.delete(urn);
      } else {
        next.add(urn);
      }
      return next;
    });
  };

  const handleToggleEntityType = (et: TermMappingTargetEntityType) => {
    setEntityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(et)) {
        next.delete(et);
      } else {
        next.add(et);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (entityTypes.size === 0) {
      toast({
        title: t('runConfig.validation.noTargetType'),
        description: t('runConfig.validation.noTargetTypeDescription'),
        variant: 'destructive',
      });
      return;
    }
    if (allContexts === false && selectedContexts.size === 0 && shippedSelected.size === 0) {
      toast({
        title: t('runConfig.validation.noOntology'),
        description: t('runConfig.validation.noOntologyDescription'),
        variant: 'destructive',
      });
      return;
    }

    const payload: RunCreatePayload = {
      target_filter: {
        entity_types: Array.from(entityTypes),
        asset_type_names: entityTypes.has('asset') ? [...assetTypeNames] : undefined,
        limit: Number.isFinite(parseInt(limit, 10)) ? parseInt(limit, 10) : undefined,
      },
      include_shipped: Array.from(shippedSelected),
      engines: ['heuristic'],
      comment: comment.trim() || undefined,
    };
    if (!allContexts) {
      payload.ontology_contexts = Array.from(selectedContexts);
    }

    setSubmitting(true);
    try {
      const res = await post<Run>('/api/term-mappings/runs', payload);
      if (res.error) throw new Error(res.error);
      const run = res.data;
      if (!run || !run.id) throw new Error(t('runConfig.toast.createdEmpty'));
      const total = (run.stats?.suggestions_total as number) ?? 0;
      const targets = (run.stats?.targets as number) ?? 0;
      toast({
        title: t('runConfig.toast.created'),
        description: t(
          total === 1
            ? 'runConfig.toast.createdDescriptionOne'
            : 'runConfig.toast.createdDescriptionMany',
          { total, targets },
        ),
      });
      onCreated(run);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t('runConfig.toast.failed'),
        description: e instanceof Error ? e.message : t('toast.unknownError'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const info = (text: string) => <InfoTip text={text} />;

  const sectionHead = (label: string, tip: ReactNode, end?: ReactNode) => (
    <div className={classes.sectionHead}>
      <h3 className={classes.sectionTitle}>{label}</h3>
      {tip}
      {end && <span className={classes.sectionEnd}>{end}</span>}
    </div>
  );

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={
        <span className={form.titleLine}>
          <Sparkles size={16} className={classes.titleIcon} aria-hidden />
          {t('runConfig.title')}
        </span>
      }
      description={t('runConfig.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || modelsLoading}>
            {submitting ? (
              <>
                <Loader size={12} color="currentColor" />
                {t('runConfig.submitting')}
              </>
            ) : (
              <>
                <Sparkles size={14} aria-hidden />
                {t('runConfig.submit')}
              </>
            )}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Simple/Advanced toggle lives in the dialog so users can switch
            without leaving the run setup. Drives the same global mode as
            the rest of the concepts UI (adv-only rows + {advanced} blocks). */}
        <div className={classes.mode}>
          <ConceptModeSwitch />
        </div>

        {/* Customer ontologies ---------------------------------------- */}
        <section className={classes.section}>
          {sectionHead(
            t('runConfig.customerOntologies'),
            info(t('runConfig.customerOntologiesTooltip', 'Select which ontologies to use for matching. Choose all or pick specific ones.')),
            <Badge variant="outline">{t('runConfig.enabledCount', { count: enabledCustomerCount })}</Badge>,
          )}
          {modelsLoading ? (
            <div className={form.loading}>
              <Loader size="xs" />
              {t('runConfig.loadingOntologies')}
            </div>
          ) : modelsError ? (
            <Alert color="red" variant="light" className={classes.alert}>
              <span className={classes.alertText}>{modelsError}</span>
              <div className={form.alertActions}>
                <Button variant="outline" size="sm" onClick={() => void fetchModels()}>
                  {t('common:retry', 'Retry')}
                </Button>
              </div>
            </Alert>
          ) : enabledCustomerCount === 0 ? (
            <div className={form.note}>
              <p>{t('runConfig.noCustomerOntologies')}</p>
            </div>
          ) : (
            <div className={classes.box} data-scroll="">
              <Checkbox
                size="xs"
                checked={allContexts}
                onChange={() => handleToggleAll()}
                label={<span className={classes.strong}>{t('runConfig.useAll')}</span>}
              />
              <div className={classes.nested}>
                {models.map((m) => {
                  const urn = m.context;
                  const checked = allContexts || selectedContexts.has(urn);
                  return (
                    <Checkbox
                      key={urn}
                      size="xs"
                      checked={checked}
                      disabled={allContexts}
                      onChange={() => handleToggleContext(urn)}
                      classNames={{ body: classes.checkBody, labelWrapper: classes.checkLabel }}
                      label={
                        <span className={classes.option}>
                          <span className={classes.optionName}>{m.label}</span>
                          <Badge variant="secondary">{m.concept_count}</Badge>
                          <span className={classes.urn} hidden={!advanced}>{urn}</span>
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Shipped opt-in (advanced-only) ----------------------------- */}
        {advanced && (
          <section className={classes.section}>
            {sectionHead(
              t('runConfig.shippedTitle'),
              info(t('runConfig.shippedTooltip', 'Databricks-provided reference taxonomies you can also match against, in addition to your own.')),
            )}
            <div className={classes.box}>
              {SHIPPED_OPT_IN_CONTEXTS.map((opt) => (
                <Checkbox
                  key={opt.value}
                  size="xs"
                  checked={shippedSelected.has(opt.value)}
                  onChange={() => handleToggleShipped(opt.value)}
                  classNames={{ body: classes.checkBody, labelWrapper: classes.checkLabel }}
                  label={
                    <span className={classes.option}>
                      <span className={classes.optionName}>{opt.label}</span>
                      <span className={classes.urn}>{opt.value}</span>
                    </span>
                  }
                />
              ))}
            </div>
            <p className={form.hint}>
              <Trans i18nKey="term-mapping:runConfig.shippedHelp" components={{ code: <code className={form.code} /> }} />
            </p>
          </section>
        )}

        {/* Target selection ------------------------------------------- */}
        <section className={classes.section}>
          {sectionHead(
            t('runConfig.targetTypes'),
            info(t('runConfig.targetTypesTooltip', 'Entity types to match concepts against. Select which platforms to include.')),
          )}
          <div className={classes.targets}>
            {(Object.keys(TARGET_ENTITY_TYPE_LABELS) as TermMappingTargetEntityType[])
              .filter((et) => et !== 'dataset')
              .map((et) => {
                // In Simple mode, hide non-core entity types
                const isCore = ['asset', 'data_product', 'data_contract'].includes(et);
                const hidden = !advanced && !isCore;
                return (
                  <div key={et} hidden={hidden}>
                    <Checkbox
                      size="xs"
                      checked={entityTypes.has(et)}
                      onChange={() => handleToggleEntityType(et)}
                      label={TARGET_ENTITY_TYPE_LABELS[et]}
                    />
                  </div>
                );
              })}
          </div>
          {entityTypes.has('asset') && (
            <div className={classes.assetTypes}>
              {assetTypeNames.length > 0 && (
                <div className={classes.chips} data-testid="tm-asset-types-selected">
                  {assetTypeNames.map((name) => (
                    <span key={name} className={classes.chip}>
                      <span>{name}</span>
                      <button
                        type="button"
                        className={classes.chipRemove}
                        aria-label={t('runConfig.removeAssetType', {
                          defaultValue: 'Remove {{name}}',
                          name,
                        })}
                        onClick={() => handleToggleAssetType(name)}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Combobox
                store={assetTypesBox}
                size="xs"
                onOptionSubmit={(name) => handleToggleAssetType(name)}
              >
                <Combobox.Target targetType="button" withExpandedAttribute>
                  <InputBase
                    ref={assetTypesTarget}
                    id="tm-asset-types"
                    component="button"
                    type="button"
                    size="xs"
                    role="combobox"
                    pointer
                    label={t(
                      'runConfig.assetTypesSelectLabel',
                      'Asset types to match. Defaults to "Column".',
                    )}
                    classNames={FIELD_CLASSES}
                    rightSection={<Combobox.Chevron />}
                    rightSectionPointerEvents="none"
                    onClick={() => assetTypesBox.toggleDropdown()}
                  >
                    <span className={classes.pickerValue}>
                      {assetTypeNames.length > 0
                        ? t('runConfig.assetTypesSelectedCount', {
                            defaultValue: '{{count}} selected',
                            count: assetTypeNames.length,
                          })
                        : t('runConfig.assetTypesSelectPlaceholder', 'Select asset types')}
                    </span>
                  </InputBase>
                </Combobox.Target>
                <Combobox.Dropdown>
                  <Combobox.Search
                    value={assetTypeSearch}
                    onChange={(e) => setAssetTypeSearch(e.currentTarget.value)}
                    placeholder={t('runConfig.assetTypesSearch', 'Search asset types...')}
                    aria-label={t('runConfig.assetTypesSearch', 'Search asset types...')}
                  />
                  <Combobox.Options className={classes.options}>
                    {assetTypesLoading ? (
                      <Combobox.Empty>
                        <span className={form.loading}>
                          <Loader size="xs" />
                          {t('runConfig.assetTypesLoading', 'Loading asset types...')}
                        </span>
                      </Combobox.Empty>
                    ) : visibleAssetTypes.length === 0 ? (
                      <Combobox.Empty>{t('runConfig.assetTypesEmpty', 'No asset types found.')}</Combobox.Empty>
                    ) : (
                      visibleAssetTypes.map((name) => {
                        const picked = assetTypeNames.includes(name);
                        return (
                          <Combobox.Option key={name} value={name} active={picked} aria-selected={picked} className={classes.optionRow}>
                            <Check size={14} className={classes.check} data-picked={picked || undefined} aria-hidden />
                            {name}
                          </Combobox.Option>
                        );
                      })
                    )}
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>
            </div>
          )}
        </section>

        {/* Limit + comment -------------------------------------------- */}
        <section className={classes.limitRow}>
          <TextInput
            id="tm-limit"
            type="number"
            min={1}
            label={t('runConfig.limit')}
            value={limit}
            onChange={(e) => setLimit(e.currentTarget.value)}
            classNames={FIELD_CLASSES}
          />
          <Textarea
            id="tm-comment"
            label={t('runConfig.comment')}
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            rows={2}
            placeholder={t('runConfig.commentPlaceholder')}
            classNames={FIELD_CLASSES}
          />
        </section>

        {/* Preview line ----------------------------------------------- */}
        <div className={form.note}>
          <p>
            {(() => {
              const customerPart =
                previewContextNames.length === 0
                  ? t('runConfig.previewNoOntologies')
                  : t(
                      previewContextNames.length === 1
                        ? 'runConfig.previewCustomerOne'
                        : 'runConfig.previewCustomerMany',
                      { count: previewContextNames.length },
                    );
              const shippedPart =
                shippedSelected.size > 0
                  ? t(
                      shippedSelected.size === 1
                        ? 'runConfig.previewShippedOne'
                        : 'runConfig.previewShippedMany',
                      { count: shippedSelected.size },
                    )
                  : null;
              const targetPart = t(
                entityTypes.size === 1
                  ? 'runConfig.previewTargetTypeOne'
                  : 'runConfig.previewTargetTypeMany',
                { count: entityTypes.size },
              );
              return (
                <Trans
                  i18nKey={
                    shippedPart
                      ? 'term-mapping:runConfig.previewLineWithShipped'
                      : 'term-mapping:runConfig.previewLine'
                  }
                  components={{ strong: <strong /> }}
                  values={{ customerPart, shippedPart: shippedPart ?? '', targetPart }}
                />
              );
            })()}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
