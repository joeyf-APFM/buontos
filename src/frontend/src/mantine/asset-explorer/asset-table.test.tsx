import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import { AssetTable } from './asset-table';
import { LEADS, LEAD_EVENTS } from './test-fixtures';

function renderTable(selectedId: string | null) {
  renderWithMantine(
    <AssetTable items={[LEADS, LEAD_EVENTS]} loading={false} error={null} onRetry={() => {}} selectedId={selectedId} onSelect={() => {}} />,
  );
  const rows = screen.getAllByRole('row').slice(1);
  return { selected: rows[0], other: rows[1] };
}

const cellStyles = (row: HTMLElement) =>
  [...row.querySelectorAll('td')].map((td) => {
    const s = getComputedStyle(td);
    return { font: s.fontFamily, color: s.color, weight: s.fontWeight, className: td.className };
  });

describe('AssetTable', () => {
  it('keeps a selected row’s cell formatting and only adds the highlight', () => {
    const { selected, other } = renderTable(LEADS.id);

    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('data-selected');
    expect(other).toHaveAttribute('aria-selected', 'false');

    // Every cell keeps the formatting it has in an unselected row
    expect(cellStyles(selected)).toEqual(cellStyles(other));
    expect(getComputedStyle(selected.querySelector('td')!).fontFamily).toMatch(/monospace/);
    const dot = (row: HTMLElement) => row.querySelector<HTMLElement>('[aria-hidden][style]')!.style.background;
    expect(dot(selected)).toBe('rgb(39, 113, 83)'); // active #277153
    expect(dot(other)).toBe('rgb(182, 127, 20)'); // draft #B67F14

    // The highlight: accent-subtle across the row, a 2px accent bar on its
    // left edge (jsdom reports the declared values; it doesn't resolve var())
    const [first, ...rest] = [...selected.querySelectorAll('td')];
    [first, ...rest].forEach((td) => expect(getComputedStyle(td).background).toBe('var(--aura-accent-subtle)'));
    expect(getComputedStyle(first).boxShadow).toBe('inset 2px 0 0 var(--aura-accent)');
    rest.forEach((td) => expect(getComputedStyle(td).boxShadow).toBe(''));
    other.querySelectorAll('td').forEach((td) => {
      expect(getComputedStyle(td).background).not.toBe('var(--aura-accent-subtle)');
      expect(getComputedStyle(td).boxShadow).toBe('');
    });
  });
});
