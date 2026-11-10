import { describe, expect, it } from 'vitest';
import { MONO_FONT, cssVariablesResolver, theme } from './theme';

// The owner's stack for all text (Task 16b), verbatim
const STACK = "Optima, Candara, 'Segoe UI', sans-serif";

describe('theme fonts', () => {
  it('uses the Optima stack for body text and headings', () => {
    expect(theme.fontFamily).toBe(STACK);
    expect(theme.headings?.fontFamily).toBe(STACK);
  });

  it('uses the shared mono token for code', () => {
    expect(MONO_FONT).toBe('ui-monospace, Menlo, monospace');
    expect(theme.fontFamilyMonospace).toBe(MONO_FONT);
  });

  it('exposes the fonts as Aura CSS variables', () => {
    const { variables } = cssVariablesResolver({} as never);
    expect(variables['--aura-font-display']).toBe(STACK);
    expect(variables['--aura-font-mono']).toBe(MONO_FONT);
  });
});
