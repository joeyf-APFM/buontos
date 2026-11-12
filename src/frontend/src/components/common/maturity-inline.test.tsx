/**
 * The maturity level card is a hover card: it opens on hover and on keyboard
 * focus, closes on blur and on Escape, and doesn't announce itself as a
 * dialog (wave 2 Task 8a, from the Task 7 re-review).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import { MaturityInline } from './maturity-inline';

const REPORT = {
  achieved_level_name: 'Managed', achieved_level_order: 2, total_levels: 3, gates_passed: 3, gates_total: 4,
  evaluated_at: null,
  levels: [
    { level_order: 1, level_name: 'Initial', achieved: true, gates: [{ passed: true, required: true }] },
    { level_order: 2, level_name: 'Managed', achieved: true, gates: [{ passed: true, required: true }, { passed: true, required: true }] },
    { level_order: 3, level_name: 'Optimised', achieved: false, gates: [{ passed: false, required: true }] },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(REPORT), { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MaturityInline', () => {
  it.each([false, true])('opens its card on focus without a dialog role, and closes on Escape and blur (compact %s)', async (compact) => {
    renderWithMantine(<MaturityInline entityType="DataProduct" entityId="p-1" compact={compact} />);
    const target = (await screen.findAllByRole('button', { expanded: false }))[0];

    act(() => target.focus());
    expect(target).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Maturity: Managed')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(target).not.toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.keyDown(target, { key: 'Escape' });
    expect(target).toHaveAttribute('aria-expanded', 'false');

    // Focus again opens it; leaving the badge closes it
    fireEvent.blur(target);
    fireEvent.focus(target);
    expect(target).toHaveAttribute('aria-expanded', 'true');
    fireEvent.blur(target, { relatedTarget: document.body });
    expect(target).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens its card on hover, after a short delay', async () => {
    renderWithMantine(<MaturityInline entityType="DataProduct" entityId="p-1" />);
    const target = (await screen.findAllByRole('button', { expanded: false }))[0];
    vi.useFakeTimers();
    fireEvent.mouseEnter(target);
    expect(target).toHaveAttribute('aria-expanded', 'false');
    act(() => { vi.advanceTimersByTime(250); });
    expect(target).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
