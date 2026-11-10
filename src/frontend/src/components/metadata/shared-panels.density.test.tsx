/**
 * Wave 2 Task 3: the shared detail panels' `flush` mode, for a page-kit Pane.
 * With `flush` a panel keeps its head (title and actions) and its body, but
 * has no card, border or padding of its own; without it, each looks as before.
 * The pixel values (28px rows, 12px labels, no frame) are measured in a real
 * browser in tests/e2e/shared-panels.spec.ts (ruling R10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import { OwnershipPanel } from '@/components/common/ownership-panel';
import EntityMetadataPanel from './entity-metadata-panel';
import EntityTagsPanel from './entity-tags-panel';
import { RatingPanel } from '@/components/ratings';
import EntityQualityPanel from '@/components/quality/entity-quality-panel';

const STAMP = '2026-11-01T00:00:00Z';

const ANSWERS: [string, unknown][] = [
  ['/api/business-owners/by-object/', [
    { id: 'o1', object_type: 'data_product', object_id: 'p1', user_email: 'a@example.com', user_name: 'Alice Doe', role_id: 'r1', role_name: 'Data Owner', is_active: true, assigned_at: STAMP, created_at: STAMP, updated_at: STAMP },
  ]],
  ['/rich-texts', [{ id: 'n1', title: 'Read me', short_description: 'About', content_markdown: '# hi', level: 10, created_at: STAMP }]],
  ['/links', [{ id: 'l1', title: 'Wiki', url: 'https://example.com', level: 20, created_at: STAMP }]],
  ['/tags', [{ tag_id: 't1', tag_name: 'pii', namespace_name: 'governance', fully_qualified_name: 'governance/pii', assigned_value: null }]],
  ['/ratings', { average_rating: 4, total_ratings: 2, distribution: { 4: 2 } }],
  ['/quality-items/summary', { overall_score_percent: 80, items_count: 1, by_dimension: { completeness: 80 }, measured_at: STAMP }],
  ['/quality-items', [{ id: 'q1', title: 'Nulls', dimension: 'completeness', source: 'manual', score_percent: 80, measured_at: STAMP }]],
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = ANSWERS.find(([part]) => url.includes(part));
    return json(hit ? hit[1] : []);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A flush panel: no card, frame or density utilities of its own, and not a Pane itself. */
function expectFlush(panel: HTMLElement) {
  expect(panel).toHaveAttribute('data-flush');
  expect(panel).not.toHaveClass(kit.pane);
  expect(panel.closest('.mantine-Paper-root')).toBeNull();
  expect(panel.querySelector('.mantine-Paper-root')).toBeNull();
  // shadcn's card density: p-6 padding, CardHeader's pb-3, Card titles' text-base / text-xl
  const owned = [panel, ...panel.querySelectorAll<HTMLElement>('*')]
    .filter((el) => !el.closest('table'))
    .flatMap((el) => [...el.classList]);
  for (const utility of ['p-6', 'pb-3', 'space-y-4', 'space-y-3', 'text-base', 'text-xl', 'text-sm']) {
    expect(owned, utility).not.toContain(utility);
  }
}

describe('shared panels flush', () => {
  it('shared panels with flush render no card chrome', async () => {
    renderWithMantine(
      <>
        <OwnershipPanel objectType="data_product" objectId="p1" canAssign flush />
        <EntityMetadataPanel entityId="p1" entityType="data_product" flush />
        <EntityTagsPanel entityId="main.sales.orders" entityType="catalog-object" flush />
        <RatingPanel entityType="data_product" entityId="p1" flush />
        <EntityQualityPanel entityId="p1" entityType="data_product" flush />
      </>,
    );

    const owners = await screen.findByRole('region', { name: 'Owners' });
    await within(owners).findByText('Alice Doe');
    expectFlush(owners);
    expect(within(owners).getByRole('button', { name: 'Assign Owner' })).toBeInTheDocument();

    const metadata = screen.getByRole('region', { name: 'Metadata' });
    await within(metadata).findByText('Read me');
    expectFlush(metadata);
    for (const name of ['Additional Notes', 'Related Links', 'Attached Documents']) {
      expect(within(metadata).getByRole('region', { name })).toBeInTheDocument();
    }

    const tags = screen.getByRole('region', { name: 'Tags' });
    await within(tags).findByText(/pii/);
    expectFlush(tags);
    expect(within(tags).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();

    const ratings = screen.getByRole('region', { name: 'Ratings' });
    expectFlush(ratings);

    const quality = screen.getByRole('region', { name: 'Data Quality' });
    await within(quality).findByText('Nulls');
    expectFlush(quality);
    expect(within(quality).getByRole('button', { name: /Add measurement/i })).toBeInTheDocument();
  });

  it('shared panels without flush keep their own frame', async () => {
    renderWithMantine(
      <>
        <OwnershipPanel objectType="data_product" objectId="p1" canAssign />
        <EntityTagsPanel entityId="main.sales.orders" entityType="catalog-object" />
        <RatingPanel entityType="data_product" entityId="p1" pane />
        <EntityQualityPanel entityId="p1" entityType="data_product" />
      </>,
    );
    // The ownership panel is its own bordered pane; the tags and quality
    // panels stay Cards; the rating panel's opt-in pane mode is the kit Pane
    const owners = await screen.findByRole('region', { name: 'Owners' });
    expect(owners).not.toHaveAttribute('data-flush');
    const tagsTitle = await screen.findByText('Tags');
    expect(tagsTitle.closest('.mantine-Paper-root')).not.toBeNull();
    expect(await screen.findByRole('region', { name: 'Ratings' })).toHaveClass(kit.pane);
    expect((await screen.findByText('Data Quality')).closest('.mantine-Paper-root')).not.toBeNull();
  });

  it('the dialogs they open are the kit Dialog: removing an owner asks in an alertdialog', async () => {
    const user = userEvent.setup();
    renderWithMantine(<OwnershipPanel objectType="data_product" objectId="p1" canAssign flush />);
    const owners = await screen.findByRole('region', { name: 'Owners' });
    const row = (await within(owners).findByText('Alice Doe')).closest('dd') as HTMLElement;
    await user.click(within(row).getByRole('button'));

    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Owner?' });
    await user.type(within(confirm).getByLabelText(/reason/i), 'Left the team');
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/business-owners/o1/remove', expect.objectContaining({ method: 'POST' })),
    );
    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/o1/remove'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ removal_reason: 'Left the team' });
  });

  it('the quality measurement dialog picks its dimension from a Mantine Select', async () => {
    const user = userEvent.setup();
    renderWithMantine(<EntityQualityPanel entityId="p1" entityType="data_product" flush />);
    const quality = await screen.findByRole('region', { name: 'Data Quality' });
    await user.click(within(quality).getByRole('button', { name: /Add measurement/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Add measurement' });
    await user.click(within(dialog).getByRole('textbox', { name: /Dimension/ }));
    // (jsdom runs no transitions, so the list counts as hidden while it opens)
    await user.click(await screen.findByRole('option', { name: 'accuracy', hidden: true }));
    expect(within(dialog).getByRole('textbox', { name: /Dimension/ })).toHaveValue('accuracy');
    await user.type(within(dialog).getByLabelText(/Score/), '91');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/entities/data_product/p1/quality-items', expect.objectContaining({ method: 'POST' })),
    );
    const call = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url).endsWith('/quality-items') && (init as RequestInit)?.method === 'POST')!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ dimension: 'accuracy', score_percent: 91 });
  });
});
