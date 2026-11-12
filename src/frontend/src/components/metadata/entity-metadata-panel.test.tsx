/**
 * Wave 2 Task 11c fix round 1 (R45): the metadata panel's add, attach, edit
 * and delete are for a user who may write on the host page and on
 * data-domains (the metadata routes' feature). The host says so with
 * `canEdit`; without it the panel is read-only. Its icon buttons have no
 * names of their own, so the tests find them by their icons.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import EntityMetadataPanel from './entity-metadata-panel';

const STAMP = '2026-11-01T00:00:00Z';
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/rich-texts')) return json([{ id: 'n1', title: 'Read me', content_markdown: '# hi', level: 10, created_at: STAMP }]);
    if (url.includes('/links')) return json([{ id: 'l1', title: 'Wiki', url: 'https://example.com', level: 20, created_at: STAMP }]);
    if (url.includes('/documents')) return json([{ id: 'd1', title: 'Spec', original_filename: 'spec.pdf', level: 30, created_at: STAMP }]);
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** The buttons whose icon is one of the named lucide icons. */
const withIcon = (scope: HTMLElement, icon: RegExp) =>
  within(scope).queryAllByRole('button').filter((b) =>
    [...b.querySelectorAll('svg')].some((svg) => [...svg.classList].some((c) => icon.test(c))));

const WRITE_ICON = /^lucide-(plus|share-?2|pencil|trash-?2)$/;

async function loaded() {
  const panel = await screen.findByRole('region', { name: 'Metadata' });
  await within(panel).findByText('Read me');
  await within(panel).findByText('Wiki');
  await within(panel).findByText('Spec');
  return panel;
}

describe('entity metadata panel permission', () => {
  it('entity metadata panel: canEdit shows add, attach, edit and delete', async () => {
    renderWithMantine(<EntityMetadataPanel entityId="p1" entityType="data_product" flush canEdit />);
    const panel = await loaded();
    // Notes, links, documents: add and attach each (6); notes and links: edit and delete (4); documents: delete (1)
    expect(withIcon(panel, /^lucide-plus$/)).toHaveLength(3);
    expect(withIcon(panel, /^lucide-share-?2$/)).toHaveLength(3);
    expect(withIcon(panel, /^lucide-pencil$/)).toHaveLength(2);
    expect(withIcon(panel, /^lucide-trash-?2$/)).toHaveLength(3);
  });

  it('entity metadata panel: canEdit false hides every write control and keeps reading', async () => {
    renderWithMantine(<EntityMetadataPanel entityId="p1" entityType="data_product" flush canEdit={false} />);
    const panel = await loaded();
    expect(withIcon(panel, WRITE_ICON)).toHaveLength(0);
    // The preview, open and refresh buttons stay: page preview, 3 refreshes, a preview or open per row
    expect(withIcon(panel, /^lucide-refresh-?ccw$/)).toHaveLength(3);
    expect(withIcon(panel, /^lucide-eye$/)).toHaveLength(4);
  });

  it('entity metadata panel: without canEdit it is read-only', async () => {
    renderWithMantine(<EntityMetadataPanel entityId="p1" entityType="data_product" />);
    const panel = await loaded();
    expect(withIcon(panel, WRITE_ICON)).toHaveLength(0);
  });
});
