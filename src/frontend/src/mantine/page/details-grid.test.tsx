import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import panel from '@/components/common/panel.module.css';
import { DetailsGrid } from './details-grid';

const ROWS = [
  { label: 'Type', value: 'Table' },
  { label: 'Owner', value: <strong>Sales Analytics</strong> },
  { label: 'Location', value: 'main.sales.orders' },
];

describe('DetailsGrid', () => {
  it('wraps each label/value pair in a div of one dt then one dd, inside the dl', () => {
    const { container } = renderWithMantine(<DetailsGrid rows={ROWS} />);
    const dl = container.querySelector('dl')!;
    expect(dl).toHaveClass(panel.kv);
    const pairs = Array.from(dl.children);
    expect(pairs).toHaveLength(3);
    for (const pair of pairs) {
      expect(pair.tagName).toBe('DIV');
      expect(Array.from(pair.children).map((c) => c.tagName)).toEqual(['DT', 'DD']);
    }
    expect(pairs.map((p) => p.firstElementChild!.textContent)).toEqual(['Type', 'Owner', 'Location']);
    expect(pairs.map((p) => p.lastElementChild!.textContent)).toEqual(['Table', 'Sales Analytics', 'main.sales.orders']);
  });

  it('columns={1} marks the grid as one pair per row; the default is two', () => {
    const { container, rerender } = renderWithMantine(<DetailsGrid rows={ROWS} columns={1} />);
    expect(container.querySelector('dl')).toHaveAttribute('data-columns', '1');
    rerender(<DetailsGrid rows={ROWS} />);
    expect(container.querySelector('dl')).toHaveAttribute('data-columns', '2');
  });

  it('still exposes every label and value as terms and definitions', () => {
    renderWithMantine(<DetailsGrid rows={ROWS} />);
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Type', 'Owner', 'Location']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['Table', 'Sales Analytics', 'main.sales.orders']);
  });
});
