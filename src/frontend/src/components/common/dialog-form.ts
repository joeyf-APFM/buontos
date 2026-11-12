/**
 * The Mantine field settings shared by the dialogs on the kit Dialog (wave 2
 * Task 8a), with dialog-form.module.css: 12px labels, hints under their
 * field, and options that wrap.
 */
import classes from './dialog-form.module.css';

type WrapperPart = 'label' | 'input' | 'description' | 'error';

/** A field's hint sits under it, as in the Radix dialogs. */
export const HINT_BELOW: WrapperPart[] = ['label', 'input', 'description', 'error'];

export const FIELD_CLASSES = { label: classes.label, description: classes.hint, error: classes.error };

export const SELECT_CLASSES = { ...FIELD_CLASSES, option: classes.option };

/** One option per value, the first kept: Mantine's Select throws on a repeated value. */
export const uniqueOptions = <T extends { value: string }>(options: T[]): T[] =>
  options.filter((o, i) => options.findIndex((p) => p.value === o.value) === i);
