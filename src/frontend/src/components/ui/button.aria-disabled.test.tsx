/**
 * Ruling R65: a Button that is busy keeps its focus with `aria-disabled`
 * instead of `disabled` (Term Mapping's Apply auto, Generate review and
 * Undo, wave 2 Task 14). It looks unavailable as a disabled one does: half
 * opacity, the not-allowed cursor and no pointer events, while it stays in
 * the tab order. The computed style is checked in a real browser in
 * tests/e2e/concepts-enrich-mapping.spec.ts (ruling R10).
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import { Button } from './button';

const BUSY = ['aria-disabled:opacity-50', 'aria-disabled:cursor-not-allowed', 'aria-disabled:pointer-events-none'];

describe('Button aria-disabled', () => {
  it('styles an aria-disabled button as unavailable, and keeps it focusable', () => {
    renderWithMantine(<Button aria-disabled>Undo</Button>);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveClass(...BUSY);
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('tabindex', '-1');
    button.focus();
    expect(button).toHaveFocus();
  });

  it('keeps every variant on the same rule', () => {
    for (const variant of ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const) {
      const { unmount } = renderWithMantine(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(...BUSY);
      unmount();
    }
  });
});
