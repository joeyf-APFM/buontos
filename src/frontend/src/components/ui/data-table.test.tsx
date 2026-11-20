import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// Swap Radix Select (page-size picker) for a native <select>: driving Radix's
// pointer/portal machinery through jsdom hung the CI runner.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectTrigger = () => null;
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const SelectItem = ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  );
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => {
    const options: React.ReactNode[] = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      if ((child as React.ReactElement).type !== SelectTrigger) options.push(child);
    });
    return (
      <select aria-label="page size" value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        {options}
      </select>
    );
  };
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

import { DataTable } from './data-table';

interface Item {
  id: string;
  name: string;
  size: number;
}

const items: Item[] = Array.from({ length: 25 }, (_, i) => ({
  id: `i${i}`,
  name: `Item ${String(i).padStart(2, '0')}`,
  size: (i * 7) % 25,
}));

const columns: ColumnDef<Item>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>Name</button>
    ),
  },
  {
    accessorKey: 'size',
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>Size</button>
    ),
  },
];

const names = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('tbody tr')).map(
    (tr) => tr.querySelectorAll('td')[1]?.textContent,
  );

beforeEach(() => localStorage.clear());

describe('DataTable', () => {
  describe('defaults (no new props)', () => {
    it('sorts by the name column, persists sorting via storageKey, and renders no footer', () => {
      const { container } = render(
        <DataTable columns={columns} data={items} storageKey="dt-test-sort" />,
      );
      expect(names(container)[0]).toBe('Item 00');
      expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
      expect(container.querySelector('tfoot')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Name' }));
      expect(names(container)[0]).toBe('Item 24');
      expect(JSON.parse(localStorage.getItem('dt-test-sort') ?? '[]')).toEqual([
        { id: 'name', desc: true },
      ]);
    });

    it('keeps page size internal', () => {
      const { container } = render(<DataTable columns={columns} data={items} />);
      fireEvent.change(screen.getByLabelText('page size'), { target: { value: '20' } });
      expect(container.querySelectorAll('tbody tr')).toHaveLength(20);
    });
  });

  describe('controlled sorting', () => {
    it('renders the given sorting and reports changes without touching storageKey', () => {
      const onSortingChange = vi.fn();
      const { container, rerender } = render(
        <DataTable
          columns={columns}
          data={items}
          storageKey="dt-test-controlled"
          sorting={[{ id: 'size', desc: true }]}
          onSortingChange={onSortingChange}
        />,
      );
      // size 24 is the largest
      expect(container.querySelectorAll('tbody tr')[0].querySelectorAll('td')[2].textContent).toBe('24');
      fireEvent.click(screen.getByRole('button', { name: 'Name' }));
      expect(onSortingChange).toHaveBeenCalledWith([{ id: 'name', desc: false }]);
      // Still controlled: order only changes when the parent passes new state.
      expect(container.querySelectorAll('tbody tr')[0].querySelectorAll('td')[2].textContent).toBe('24');
      expect(localStorage.getItem('dt-test-controlled')).toBeNull();

      rerender(
        <DataTable
          columns={columns}
          data={items}
          storageKey="dt-test-controlled"
          sorting={[{ id: 'name', desc: false }]}
          onSortingChange={onSortingChange}
        />,
      );
      expect(names(container)[0]).toBe('Item 00');
      expect(localStorage.getItem('dt-test-controlled')).toBeNull();
    });

    it('ignores a stored storageKey sort when sorting is controlled', () => {
      localStorage.setItem('dt-test-ignored', JSON.stringify([{ id: 'name', desc: true }]));
      const { container } = render(
        <DataTable
          columns={columns}
          data={items}
          storageKey="dt-test-ignored"
          sorting={[{ id: 'name', desc: false }]}
        />,
      );
      expect(names(container)[0]).toBe('Item 00');
    });
  });

  describe('controlled page size', () => {
    it('uses the given page size and reports changes', () => {
      const onPageSizeChange = vi.fn();
      const { container, rerender } = render(
        <DataTable columns={columns} data={items} pageSize={20} onPageSizeChange={onPageSizeChange} />,
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(20);
      expect(screen.getByLabelText('page size')).toHaveValue('20');

      fireEvent.change(screen.getByLabelText('page size'), { target: { value: '10' } });
      expect(onPageSizeChange).toHaveBeenCalledWith(10);
      // Controlled: unchanged until the parent passes the new size.
      expect(container.querySelectorAll('tbody tr')).toHaveLength(20);

      rerender(
        <DataTable columns={columns} data={items} pageSize={10} onPageSizeChange={onPageSizeChange} />,
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    });

    it('still pages through the data', () => {
      const { container } = render(<DataTable columns={columns} data={items} pageSize={10} />);
      fireEvent.click(screen.getByRole('button', { name: 'pagination.goToNextPage' }));
      expect(names(container)[0]).toBe('Item 10');
    });

    it('returns to the first page when the controlled search changes', () => {
      const { container, rerender } = render(
        <DataTable columns={columns} data={items} pageSize={10} searchValue="" onSearchChange={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'pagination.goToNextPage' }));
      expect(names(container)[0]).toBe('Item 10');
      rerender(
        <DataTable
          columns={columns}
          data={items.slice(0, 3)}
          pageSize={10}
          searchValue="x"
          onSearchChange={() => {}}
        />,
      );
      expect(names(container)).toEqual(['Item 00', 'Item 01', 'Item 02']);
    });
  });

  describe('footer', () => {
    it('renders a ReactNode footer inside the same table', () => {
      const { container } = render(
        <DataTable
          columns={columns}
          data={items}
          footer={
            <tr>
              <td />
              <td>Total</td>
              <td>300</td>
            </tr>
          }
        />,
      );
      const tfoot = container.querySelector('table tfoot');
      expect(tfoot).not.toBeNull();
      expect(tfoot?.closest('table')).toBe(container.querySelector('tbody')?.closest('table'));
      expect(tfoot?.textContent).toBe('Total300');
    });

    it('passes the table instance to a function footer', () => {
      const { container } = render(
        <DataTable
          columns={columns}
          data={items}
          footer={(table) => (
            <tr>
              {table.getVisibleLeafColumns().map((c) => (
                <td key={c.id}>{c.id}</td>
              ))}
            </tr>
          )}
        />,
      );
      const cells = Array.from(container.querySelectorAll('tfoot td')).map((c) => c.textContent);
      expect(cells).toEqual(['select', 'name', 'size']);
    });
  });

  describe('dense and fixedLayout', () => {
    const sized: ColumnDef<Item>[] = [
      { ...columns[0] },
      { ...columns[1], size: 90 },
    ];

    it('keeps the default layout and padding when the props are absent', () => {
      const { container } = render(<DataTable columns={sized} data={items} />);
      const table = container.querySelector('table') as HTMLTableElement;
      expect(table).not.toHaveClass('table-fixed');
      expect(table.style.minWidth).toBe('');
      expect(getComputedStyle(container.querySelector('thead th') as HTMLElement).paddingLeft).toBe('10px');
      expect(getComputedStyle(container.querySelector('tbody td') as HTMLElement).paddingLeft).toBe('10px');
      // No width is set on any header
      container.querySelectorAll('thead th').forEach((th) => expect((th as HTMLElement).style.width).toBe(''));
    });

    it('dense uses compact header and cell padding', () => {
      const { container } = render(<DataTable columns={sized} data={items} dense />);
      expect(getComputedStyle(container.querySelector('thead th') as HTMLElement).paddingLeft).toBe('8px');
      expect(getComputedStyle(container.querySelector('tbody td') as HTMLElement).paddingLeft).toBe('8px');
    });

    it('fixedLayout fixes only the widths a column declares and keeps a minimum table width', () => {
      const { container } = render(<DataTable columns={sized} data={items} fixedLayout selectable={false} />);
      const table = container.querySelector('table') as HTMLTableElement;
      expect(table).toHaveClass('table-fixed');
      const ths = Array.from(container.querySelectorAll('thead th')) as HTMLElement[];
      // name has no declared size -> flexible (TanStack's default 150 must not be applied)
      expect(ths[0].style.width).toBe('');
      expect(ths[1].style.width).toBe('90px');
      // 90 declared + 130 for the one flexible column
      expect(table.style.minWidth).toBe('220px');
    });
  });

  describe('explorer grid', () => {
    const rowOf = (container: HTMLElement, name: string) =>
      Array.from(container.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(name)) as HTMLElement;

    it('renders 28px rows and the explorer header style', () => {
      const { container } = render(<DataTable columns={columns} data={items} />);
      const th = getComputedStyle(container.querySelector('thead th') as HTMLElement);
      expect(th.height).toBe('28px');
      // jsdom keeps var() unresolved, so the tokens are compared by name
      expect(th.background).toBe('var(--aura-surface-strong)');
      expect(th.fontSize).toBe('11px');
      const td = getComputedStyle(container.querySelector('tbody td') as HTMLElement);
      expect(td.height).toBe('28px');
      expect(td.borderBottomColor).toBe('var(--aura-border-subtle)');
      expect(td.borderBottomWidth).toBe('1px');
      // No card shadow around the grid: a 1px pane border instead
      expect(container.querySelector('.shadow, .shadow-sm')).toBeNull();
    });

    it('highlights a selected row with the accent and keeps its cell formatting', () => {
      const { container } = render(
        <DataTable
          columns={[{ ...columns[0], cell: ({ row }) => <strong>{row.original.name}</strong> }, columns[1]]}
          data={items}
        />,
      );
      const row = rowOf(container, 'Item 00');
      fireEvent.click(within(row).getByRole('checkbox', { name: 'common:dataTable.selectRow' }));
      const cells = Array.from(row.querySelectorAll('td')) as HTMLElement[];
      expect(row).toHaveAttribute('data-state', 'selected');
      cells.forEach((c) => expect(getComputedStyle(c).background).toBe('var(--aura-accent-subtle)'));
      expect(getComputedStyle(cells[0]).boxShadow).toBe('');
      expect(getComputedStyle(cells[1]).boxShadow).toBe('');
      expect(within(row).getByText('Item 00').tagName).toBe('STRONG');
      // The selected row keeps the body text style
      expect(getComputedStyle(cells[1]).fontWeight).not.toBe('600');
    });

    it('keyboard sort and select-all still work', async () => {
      const user = userEvent.setup();
      const { container } = render(<DataTable columns={columns} data={items} />);
      expect(names(container)[0]).toBe('Item 00');
      const nameHeader = screen.getByRole('button', { name: 'Name' });
      for (let i = 0; i < 10 && document.activeElement !== nameHeader; i++) await user.tab();
      expect(nameHeader).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(names(container)[0]).toBe('Item 24');
      await user.keyboard(' ');
      expect(names(container)[0]).toBe('Item 00');

      const selectAll = screen.getByRole('checkbox', { name: 'common:dataTable.selectAll' });
      selectAll.focus();
      await user.keyboard(' ');
      const rowBoxes = screen.getAllByRole('checkbox', { name: 'common:dataTable.selectRow' });
      expect(rowBoxes).toHaveLength(10);
      rowBoxes.forEach((b) => expect(b).toBeChecked());
      expect(screen.getByText(/10 of 25 rowsSelected/)).toBeInTheDocument();
    });

    it('bulk actions appear with a selection', () => {
      const bulk = vi.fn((rows: Item[]) => <button>Delete {rows.length}</button>);
      const { container } = render(<DataTable columns={columns} data={items} bulkActions={bulk} />);
      expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
      fireEvent.click(within(rowOf(container, 'Item 00')).getByRole('checkbox'));
      fireEvent.click(within(rowOf(container, 'Item 01')).getByRole('checkbox'));
      expect(screen.getByRole('button', { name: 'Delete 2' })).toBeInTheDocument();
      expect(screen.getByText(/2\s+selected/)).toBeInTheDocument();
    });

    it('global filter narrows rows', async () => {
      const user = userEvent.setup();
      const { container } = render(<DataTable columns={columns} data={items} searchColumn="name" />);
      const filter = screen.getByPlaceholderText('filter names...');
      await user.type(filter, 'Item 1');
      expect(names(container)).toEqual(Array.from({ length: 10 }, (_, i) => `Item 1${i}`));
      await user.clear(filter);
      await user.type(filter, 'nothing');
      expect(screen.getByText('noResults')).toBeInTheDocument();
    });

    it('keeps the pagination controls and their names', () => {
      const { container } = render(<DataTable columns={columns} data={items} />);
      // First and last show from the lg breakpoint, which jsdom never matches, so
      // they are hidden here and found by their label
      const first = container.querySelector('button[aria-label="pagination.goToFirstPage"]') as HTMLButtonElement;
      const prev = screen.getByRole('button', { name: 'pagination.goToPreviousPage' });
      const next = screen.getByRole('button', { name: 'pagination.goToNextPage' });
      const last = container.querySelector('button[aria-label="pagination.goToLastPage"]') as HTMLButtonElement;
      expect(first).toBeDisabled();
      expect(prev).toBeDisabled();
      // No page-number buttons are added
      expect(screen.queryByRole('button', { name: '2' })).toBeNull();
      fireEvent.click(last);
      expect(names(container)[0]).toBe('Item 20');
      expect(next).toBeDisabled();
      expect(screen.getByText(/pagination.page 3 of 3/)).toBeInTheDocument();
      fireEvent.click(prev);
      expect(names(container)[0]).toBe('Item 10');
      fireEvent.click(first);
      expect(names(container)[0]).toBe('Item 00');
      expect(screen.getByRole('button', { name: 'columns' })).toBeInTheDocument();
    });

    it('opens a row on click but not when its checkbox is clicked', () => {
      const onRowClick = vi.fn();
      const { container } = render(<DataTable columns={columns} data={items} onRowClick={onRowClick} />);
      const row = rowOf(container, 'Item 03');
      fireEvent.click(within(row).getByRole('checkbox'));
      expect(onRowClick).not.toHaveBeenCalled();
      fireEvent.click(within(row).getByText('Item 03'));
      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick.mock.calls[0][0].original.id).toBe('i3');
    });

    it('shows a loader while loading and a message when empty', () => {
      const { container, rerender } = render(<DataTable columns={columns} data={[]} isLoading />);
      expect(container.querySelector('tbody')?.textContent).not.toContain('noResults');
      expect(container.querySelector('tbody [data-loading]')).not.toBeNull();
      const roomy = (td: HTMLElement) => {
        const cs = getComputedStyle(td);
        expect(cs.paddingTop).toBe('30px');
        expect(cs.paddingBottom).toBe('30px');
        // A table cell's height is its minimum height
        expect(cs.height).toBe('96px');
      };
      roomy(container.querySelector('tbody td') as HTMLElement);
      rerender(<DataTable columns={columns} data={[]} />);
      expect(screen.getByText('noResults')).toBeInTheDocument();
      roomy(screen.getByText('noResults').closest('td') as HTMLElement);
    });
  });
});
