import { useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Loader, Select, TextInput } from '@mantine/core';
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, Tabs } from '@/mantine/page';
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { MatchingRule, SurvivorshipRule, MdmConfig, MatchRuleType, SurvivorshipStrategy } from '@/types/mdm';
import { useOpenSession } from './use-open-session';
import classes from './mdm-editors.module.css';

interface MatchingRulesEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  config: MdmConfig;
}

type Section = 'matching' | 'survivorship';

const MONO_FIELD = { ...FIELD_CLASSES, input: classes.monoInput };

const splitList = (text: string) => text.split(',').map((f) => f.trim()).filter(Boolean);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * A text field for a value kept in another form (a list, a number): the text
 * stays as typed (a trailing comma, an empty number), while `parse` gives the
 * value. The old fields showed the parsed value back, so a comma vanished as
 * it was typed and an emptied number came back at once. When the value
 * changes from outside (another rule took this place), the text follows it.
 */
function DraftInput<T>({ value, format, parse, equals, onValue, ...props }: {
  value: T;
  format: (value: T) => string;
  parse: (text: string) => T;
  equals: (a: T, b: T) => boolean;
  onValue: (value: T) => void;
} & Omit<ComponentProps<typeof TextInput>, 'value' | 'onChange'>) {
  const [text, setText] = useState(() => format(value));
  if (!equals(parse(text), value)) setText(format(value));
  return (
    <TextInput
      {...props}
      value={text}
      onChange={(e) => {
        const next = e.currentTarget.value;
        setText(next);
        onValue(parse(next));
      }}
    />
  );
}

const parseNumber = (fallback: number) => (text: string) => parseFloat(text) || fallback;

export default function MatchingRulesEditor({
  isOpen,
  onClose,
  onSuccess,
  config,
}: MatchingRulesEditorProps) {
  const [matchingRules, setMatchingRules] = useState<MatchingRule[]>(
    config.matching_rules || []
  );
  const [survivorshipRules, setSurvivorshipRules] = useState<SurvivorshipRule[]>(
    config.survivorship_rules || []
  );
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('matching');
  // A second click, or a click on the way out, sends nothing
  const busy = useRef(false);

  // Each open starts from the configuration as it is now: the page keeps this
  // editor mounted, so a cancelled edit (or another configuration) used to stay
  const session = useOpenSession(isOpen);
  const [loaded, setLoaded] = useState(session);
  if (loaded !== session) {
    setLoaded(session);
    setMatchingRules(config.matching_rules || []);
    setSurvivorshipRules(config.survivorship_rules || []);
    setActiveSection('matching');
  }

  const { t } = useTranslation(['mdm', 'common']);
  const { put } = useApi();
  const { toast } = useToast();

  const handleSave = async () => {
    if (busy.current || !isOpen) return;
    busy.current = true;
    setSaving(true);
    try {
      const response = await put(`/api/mdm/configs/${config.id}`, {
        matching_rules: matchingRules,
        survivorship_rules: survivorshipRules,
      });

      // useApi answers an error with an empty object, not a throw
      if (response.error) {
        toast({
          title: t('common:status.error'),
          description: response.error || t('mdm:editor.saveFailed'),
          variant: 'destructive',
        });
        return;
      }
      if (response.data) {
        toast({ title: t('common:status.success'), description: t('mdm:editor.saveSuccess') });
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      toast({
        title: t('common:status.error'),
        description: err.message || t('mdm:editor.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  // Escape and Cancel wait while the save is out
  const close = () => {
    if (busy.current) return;
    onClose();
  };

  const addMatchingRule = () => {
    setMatchingRules([
      ...matchingRules,
      {
        name: `rule_${matchingRules.length + 1}`,
        type: MatchRuleType.DETERMINISTIC,
        fields: [],
        weight: 1.0,
        threshold: 0.8,
      },
    ]);
  };

  const updateMatchingRule = (index: number, updates: Partial<MatchingRule>) => {
    setMatchingRules((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const removeMatchingRule = (index: number) => {
    setMatchingRules(matchingRules.filter((_, i) => i !== index));
  };

  const addSurvivorshipRule = () => {
    setSurvivorshipRules([
      ...survivorshipRules,
      {
        field: '',
        strategy: SurvivorshipStrategy.MOST_RECENT,
      },
    ]);
  };

  const updateSurvivorshipRule = (index: number, updates: Partial<SurvivorshipRule>) => {
    setSurvivorshipRules((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const removeSurvivorshipRule = (index: number) => {
    setSurvivorshipRules(survivorshipRules.filter((_, i) => i !== index));
  };

  const typeOptions = [
    { value: 'deterministic', label: t('mdm:editor.deterministic') },
    { value: 'probabilistic', label: t('mdm:editor.probabilistic') },
  ];
  const algorithmOptions = [
    { value: 'jaro_winkler', label: t('mdm:editor.algoJaroWinkler') },
    { value: 'levenshtein', label: t('mdm:editor.algoLevenshtein') },
    { value: 'token_sort', label: t('mdm:editor.algoTokenSort') },
  ];
  const strategyOptions = [
    { value: 'most_recent', label: t('mdm:editor.stratMostRecent') },
    { value: 'most_trusted', label: t('mdm:editor.stratMostTrusted') },
    { value: 'most_complete', label: t('mdm:editor.stratMostComplete') },
    { value: 'source_priority', label: t('mdm:editor.stratSourcePriority') },
  ];

  const removeButton = (onClick: () => void) => (
    <ActionIcon
      variant="subtle"
      className={classes.remove}
      onClick={onClick}
      aria-label={t('common:actions.remove')}
      title={t('common:actions.remove')}
    >
      <Trash2 size={14} />
    </ActionIcon>
  );

  return (
    <Dialog
      opened={isOpen}
      onClose={close}
      size="lg"
      height="80vh"
      title={t('mdm:configDetails.editRules')}
      description={t('mdm:editor.dialogDescription', { name: config.name })}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader size={12} color="currentColor" />
                {t('common:actions.saving')}
              </>
            ) : (
              <>
                <Save size={14} />
                {t('mdm:editor.saveButton')}
              </>
            )}
          </Button>
        </>
      }
    >
      {/* Section Tabs */}
      <Tabs
        value={activeSection}
        onChange={(next) => next && setActiveSection(next as Section)}
        className={classes.tabs}
      >
        <Tabs.List>
          <Tabs.Tab value="matching">
            {t('mdm:rulesTab.title')} ({matchingRules.length})
          </Tabs.Tab>
          <Tabs.Tab value="survivorship">
            {t('mdm:survivorship.title')} ({survivorshipRules.length})
          </Tabs.Tab>
        </Tabs.List>

        {/* Matching Rules Section */}
        <Tabs.Panel value="matching" className={classes.tabs}>
          <div className={classes.sectionHead}>
            <p>{t('mdm:editor.matchingHint')}</p>
            <Button size="sm" onClick={addMatchingRule}>
              <Plus size={14} />
              {t('mdm:editor.addRule')}
            </Button>
          </div>

          {matchingRules.length === 0 ? (
            <p className={classes.empty}>{t('mdm:editor.noMatchingRules')}</p>
          ) : (
            <div className={classes.rules}>
              {matchingRules.map((rule, idx) => (
                <div key={idx} className={classes.rule} data-rule="">
                  <div className={classes.ruleHead}>
                    <GripVertical size={14} className={classes.grip} aria-hidden />
                    <TextInput
                      className={classes.ruleName}
                      value={rule.name}
                      onChange={(e) => updateMatchingRule(idx, { name: e.currentTarget.value })}
                      placeholder={t('mdm:editor.ruleNamePlaceholder')}
                      aria-label={t('mdm:editor.ruleNamePlaceholder')}
                      title={rule.name}
                      classNames={MONO_FIELD}
                    />
                    <span className={classes.spacer} />
                    {removeButton(() => removeMatchingRule(idx))}
                  </div>

                  <div className={classes.ruleGrid}>
                    {/* No clearing: the Radix Selects these replace could not be cleared either */}
                    <Select
                      label={t('common:labels.type')}
                      data={typeOptions}
                      value={rule.type}
                      onChange={(value) => value && updateMatchingRule(idx, { type: value as any })}
                      allowDeselect={false}
                      classNames={SELECT_CLASSES}
                    />

                    <DraftInput
                      label={t('mdm:editor.fieldsLabel')}
                      placeholder={t('mdm:editor.fieldsPlaceholder')}
                      value={rule.fields}
                      format={(fields) => fields.join(', ')}
                      parse={splitList}
                      equals={sameList}
                      onValue={(fields) => updateMatchingRule(idx, { fields })}
                      classNames={MONO_FIELD}
                    />

                    <DraftInput
                      label={t('mdm:editor.weightLabel')}
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={rule.weight}
                      format={String}
                      parse={parseNumber(1.0)}
                      equals={Object.is}
                      onValue={(weight) => updateMatchingRule(idx, { weight })}
                      classNames={FIELD_CLASSES}
                    />

                    <DraftInput
                      label={t('mdm:editor.thresholdLabel')}
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={rule.threshold}
                      format={String}
                      parse={parseNumber(0.8)}
                      equals={Object.is}
                      onValue={(threshold) => updateMatchingRule(idx, { threshold })}
                      classNames={FIELD_CLASSES}
                    />

                    {rule.type === 'probabilistic' && (
                      <Select
                        className={classes.wide}
                        label={t('mdm:rulesTab.algorithm')}
                        data={algorithmOptions}
                        value={rule.algorithm || 'jaro_winkler'}
                        onChange={(value) => value && updateMatchingRule(idx, { algorithm: value })}
                        allowDeselect={false}
                        classNames={SELECT_CLASSES}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Panel>

        {/* Survivorship Rules Section */}
        <Tabs.Panel value="survivorship" className={classes.tabs}>
          <div className={classes.sectionHead}>
            <p>{t('mdm:editor.survivorshipHint')}</p>
            <Button size="sm" onClick={addSurvivorshipRule}>
              <Plus size={14} />
              {t('mdm:editor.addRule')}
            </Button>
          </div>

          {survivorshipRules.length === 0 ? (
            <p className={classes.empty}>{t('mdm:editor.noSurvivorshipRules')}</p>
          ) : (
            <div className={classes.rules}>
              {survivorshipRules.map((rule, idx) => (
                <div key={idx} className={classes.rule} data-rule="">
                  <div className={classes.ruleHead}>
                    <GripVertical size={14} className={classes.grip} aria-hidden />
                    {rule.field ? (
                      <span className={classes.fieldTag} title={rule.field}>{rule.field}</span>
                    ) : (
                      <span className={`${classes.fieldTag} ${classes.unnamed}`}>{t('mdm:editor.unnamedField')}</span>
                    )}
                    <span className={classes.spacer} />
                    {removeButton(() => removeSurvivorshipRule(idx))}
                  </div>

                  <div className={classes.ruleGrid}>
                    <TextInput
                      label={t('mdm:editor.fieldNameLabel')}
                      value={rule.field}
                      onChange={(e) => updateSurvivorshipRule(idx, { field: e.currentTarget.value })}
                      placeholder={t('mdm:editor.fieldNamePlaceholder')}
                      title={rule.field || undefined}
                      classNames={MONO_FIELD}
                    />

                    <Select
                      label={t('mdm:editor.strategyLabel')}
                      data={strategyOptions}
                      value={rule.strategy}
                      onChange={(value) => value && updateSurvivorshipRule(idx, { strategy: value as any })}
                      allowDeselect={false}
                      classNames={SELECT_CLASSES}
                    />

                    {rule.strategy === 'most_trusted' && (
                      <DraftInput
                        className={classes.wide}
                        label={t('mdm:editor.priorityLabel')}
                        placeholder={t('mdm:editor.priorityPlaceholder')}
                        value={rule.priority || []}
                        format={(priority) => priority.join(', ')}
                        parse={splitList}
                        equals={sameList}
                        onValue={(priority) => updateSurvivorshipRule(idx, { priority })}
                        classNames={FIELD_CLASSES}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </Dialog>
  );
}
