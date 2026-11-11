import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComboboxItem, ComboboxItemGroup, SelectProps } from '@mantine/core';
import type { SchemeOptionGroup } from '@/lib/scheme-select-options';
import form from '@/components/common/dialog-form.module.css';
import classes from './scheme-select-data.module.css';

/**
 * The grouped scheme options (buildSchemeOptionGroups) for a Mantine Select,
 * the counterpart of SchemeSelectItems for the Radix Select (wave 2 Task
 * 12a): one labelled group per scheme type, after any `leading` options (a
 * "None" sentinel), with the parent scheme shown as muted text after the
 * label instead of indentation. The closed field shows only the label. A
 * scheme listed twice is offered once: Mantine's Select throws on a repeated
 * value.
 */
const NONE: ComboboxItem[] = [];

export function useSchemeSelectData(groups: SchemeOptionGroup[], leading: ComboboxItem[] = NONE) {
  const { t } = useTranslation(['semantic-models']);

  return useMemo(() => {
    const heading = (type: string): string => {
      switch (type) {
        case 'glossary':
          return t('semantic-models:schemeSelect.groupGlossary', 'Glossaries');
        case 'taxonomy':
          return t('semantic-models:schemeSelect.groupTaxonomy', 'Taxonomies');
        case 'ontology':
          return t('semantic-models:schemeSelect.groupOntology', 'Ontologies');
        default:
          return type;
      }
    };
    const seen = new Set(leading.map((o) => o.value));
    const parentOf = new Map<string, string>();
    const grouped: ComboboxItemGroup<ComboboxItem>[] = [];
    for (const group of groups) {
      const items: ComboboxItem[] = [];
      for (const option of group.options) {
        if (seen.has(option.iri)) continue;
        seen.add(option.iri);
        items.push({ value: option.iri, label: option.label });
        if (option.parentLabel) parentOf.set(option.iri, option.parentLabel);
      }
      if (items.length) grouped.push({ group: heading(group.type), items });
    }

    const renderOption: SelectProps['renderOption'] = ({ option }) => {
      const parent = parentOf.get(option.value);
      return (
        <span className={`${form.option} ${classes.option}`}>
          <span>{option.label}</span>
          {parent && (
            <span className={classes.parent}>
              {t('semantic-models:schemeSelect.inParent', { defaultValue: 'in {{parent}}', parent })}
            </span>
          )}
        </span>
      );
    };

    return { data: [...leading, ...grouped], renderOption };
  }, [groups, leading, t]);
}
