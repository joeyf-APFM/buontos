/**
 * Task 8: the shared panels, skeletons and badges on Mantine and CSS modules,
 * laid out like the explorer's details panel. The pixel values (the 86px
 * label column, 12px text, rows about 23px apart with no rules, R12) are
 * measured in a real browser in tests/e2e/shared-panels.spec.ts (ruling R10);
 * these tests check the structure and that the controls still work.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';

const api = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  loading: false,
};
vi.mock('@/hooks/use-api', () => ({ useApi: () => api }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/stores/project-store', () => ({
  useProjectContext: () => ({ currentProject: { id: 'p1', name: 'Sales' }, availableProjects: [] }),
}));
vi.mock('@/hooks/use-entity-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-entity-metadata')>()),
  useSharedAssets: () => ({ richTexts: [], links: [], documents: [], loading: false }),
}));

import { OwnershipPanel } from './ownership-panel';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import CommentSidebar from '@/components/comments/comment-sidebar';
import CertificationBadge from './certification-badge';
import PublicationBadge from './publication-badge';
import { MaturityBadge } from './maturity-badge';
import { QualityBadge } from '@/components/quality/quality-badge';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { AURA_STATUS, contrastRatio, hoverFill, toneForColour } from './aura-status';

// The seeded level tables: certification_levels_repository.py and maturity_repository.py
const SEEDED_CERTIFICATION = [
  { id: 'a', level_order: 1, name: 'Bronze', description: null, icon: 'shield', color: 'amber' },
  { id: 'b', level_order: 2, name: 'Silver', description: null, icon: 'shield-check', color: 'slate' },
  { id: 'c', level_order: 3, name: 'Gold', description: null, icon: 'shield-check', color: 'yellow' },
];
const SEEDED_MATURITY: [string, string][] = [
  ['Level 1', 'blue'], ['Level 2', 'cyan'], ['Level 3', 'green'], ['Level 4', 'amber'], ['Level 5', 'purple'],
];
// The colour options of the certification- and maturity-level settings
const ALL_LEVEL_COLOURS = ['amber', 'slate', 'yellow', 'green', 'blue', 'purple', 'red', 'emerald', 'cyan'];

const owner = (over: Record<string, unknown>) => ({
  object_type: 'data_product',
  object_id: 'p1',
  user_email: 'x@example.com',
  role_id: 'r1',
  is_active: true,
  assigned_at: '2026-11-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  api.delete.mockReset();
});

describe('shared panels restyle', () => {
  it('ownership panel lists owners in the details-panel grid', async () => {
    api.get.mockResolvedValue({
      data: [
        owner({ id: 'o1', user_name: 'Alice Doe', role_name: 'Data Owner' }),
        owner({ id: 'o2', user_name: 'Bob Roe', role_name: 'Steward' }),
      ],
    });
    renderWithProviders(<OwnershipPanel objectType="data_product" objectId="p1" canAssign />);

    const panel = await screen.findByRole('region', { name: 'Owners' });
    await within(panel).findByText('Alice Doe');
    // One label/value row per owner: the role in the label column
    // (jsdom's ARIA tables give dt and dd no roles, so they are found by tag)
    const terms = [...panel.querySelectorAll('dl > div > dt')].map((t) => t.textContent);
    expect(terms).toEqual(['Data Owner', 'Steward']);
    const values = [...panel.querySelectorAll<HTMLElement>('dl > div > dd')];
    expect(values[0]).toHaveTextContent('Alice Doe');
    expect(values[1]).toHaveTextContent('Bob Roe');
    // The remove control stays on each row, and Assign Owner in the header
    expect(within(values[0]).getByRole('button', { name: 'Remove Alice Doe' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Assign Owner' })).toBeInTheDocument();
    // A pane, not a Card: no Mantine Paper
    expect(panel.closest('.mantine-Paper-root')).toBeNull();
  });

  it('metadata panel uses no nested cards', async () => {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    global.fetch = vi.fn((url: string) => {
      if (url.includes('rich-texts')) {
        return json([{ id: 'n1', title: 'Read me', short_description: 'About', content_markdown: '# hi', level: 10 }]);
      }
      if (url.includes('/links')) return json([{ id: 'l1', title: 'Wiki', url: 'https://example.com', level: 20 }]);
      return json([]);
    }) as unknown as typeof fetch;

    renderWithProviders(<EntityMetadataPanel entityId="e1" entityType="data_product" canEdit />);

    const panel = await screen.findByRole('region', { name: 'Metadata' });
    await within(panel).findByText('Read me');
    // Notes, links and documents are sections of the one pane, divided by
    // rules rather than separators, with no card inside the panel
    for (const name of ['Additional Notes', 'Related Links', 'Attached Documents']) {
      expect(within(panel).getByRole('region', { name })).toBeInTheDocument();
    }
    expect(within(panel).queryAllByRole('separator')).toHaveLength(0);
    expect(panel.closest('.mantine-Paper-root')).toBeNull();
    expect(panel.querySelector('.mantine-Paper-root')).toBeNull();
    // The section toolbars keep their add / attach / refresh buttons
    const notes = within(panel).getByRole('region', { name: 'Additional Notes' });
    expect(within(notes).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  });

  it('comments thread keeps add, edit and delete controls', async () => {
    const timeline = {
      timeline: [
        {
          id: 'c1', type: 'comment', entity_type: 'data_product', entity_id: 'p1',
          title: 'First', content: 'Looks good', username: 'alice', timestamp: '2026-11-08T10:00:00Z',
          audience: [],
        },
        {
          id: 'h1', type: 'change', entity_type: 'data_product', entity_id: 'p1',
          content: 'Status changed', username: 'bob', timestamp: '2026-11-07T10:00:00Z',
        },
      ],
      total_count: 2,
      filter_type: 'all',
    };
    api.get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('timeline') ? timeline : [] }),
    );
    api.delete.mockResolvedValue({ data: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(
      <CommentSidebar entityType="data_product" entityId="p1" isOpen onToggle={() => {}} fetchCountOnMount={false} />,
    );

    const thread = await screen.findByRole('list', { name: 'Activity Timeline' });
    const items = await within(thread).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    // The comment has edit and delete; the change has neither
    expect(within(items[0]).getAllByRole('button')).toHaveLength(2);
    expect(within(items[1]).queryAllByRole('button')).toHaveLength(0);

    // The scroll viewport is still Radix's: opening the composer scrolls it to the top
    const viewport = document.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    expect(viewport).not.toBeNull();
    const scrollTo = vi.fn();
    viewport!.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];

    // Add opens the composer
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    expect(await screen.findByLabelText('Comment')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));

    // Edit opens the composer on the comment (it fills the title; the timeline
    // entry has no `comment` field for the body, as before)
    // (TimelineItem is defined in the render, so each render remounts the items)
    const entry = () => within(screen.getByRole('list', { name: 'Activity Timeline' })).getAllByRole('listitem')[0];
    fireEvent.click(within(entry()).getAllByRole('button')[0]);
    expect(await screen.findByDisplayValue('First')).toBeInTheDocument();

    // Delete calls the API
    fireEvent.click(within(entry()).getAllByRole('button')[1]);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/comments/c1'));
  });

  it('each seeded certification and maturity level renders its own tone', () => {
    const look = (el: HTMLElement) =>
      [el.dataset.tone, el.style.getPropertyValue('--badge-bg'), el.style.getPropertyValue('--badge-bd')].join(' ');
    const badge = (name: string) => screen.getByText(name).closest('.mantine-Badge-root') as HTMLElement;

    const { rerender } = renderWithProviders(<></>);
    const certification = SEEDED_CERTIFICATION.map((level) => {
      rerender(<CertificationBadge certificationLevel={level.level_order} levels={SEEDED_CERTIFICATION} />);
      return look(badge(level.name));
    });
    expect(new Set(certification).size).toBe(SEEDED_CERTIFICATION.length);

    const maturity = SEEDED_MATURITY.map(([name, color]) => {
      rerender(<MaturityBadge levelName={name} levelColor={color} />);
      return look(badge(name));
    });
    expect(new Set(maturity).size).toBe(SEEDED_MATURITY.length);

    // Every colour the level settings offer has its own tone, readable on its fill
    const tones = ALL_LEVEL_COLOURS.map((c) => toneForColour(c, 'neutral'));
    expect(new Set(tones).size).toBe(ALL_LEVEL_COLOURS.length);
    for (const tone of tones) {
      expect(contrastRatio(AURA_STATUS[tone].fg, AURA_STATUS[tone].bg), tone).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('badges use the Aura status colours', async () => {
    // The seeded levels (certification_levels_repository.py), plus a custom red one
    const levels = [...SEEDED_CERTIFICATION, { id: 'd', level_order: 4, name: 'Revoked', description: null, icon: null, color: 'red' }];
    const vars = (el: HTMLElement) => ({
      color: el.style.getPropertyValue('--badge-color'),
      bg: el.style.getPropertyValue('--badge-bg'),
    });

    const { rerender } = renderWithProviders(<CertificationBadge certificationLevel={3} levels={levels} />);
    expect(vars(screen.getByText('Gold').closest('.mantine-Badge-root') as HTMLElement)).toEqual({
      color: AURA_STATUS.gold.fg, bg: AURA_STATUS.gold.bg,
    });
    rerender(<CertificationBadge certificationLevel={1} levels={levels} />);
    expect(vars(screen.getByText('Bronze').closest('.mantine-Badge-root') as HTMLElement)).toEqual({
      color: AURA_STATUS.warning.fg, bg: AURA_STATUS.warning.bg,
    });
    rerender(<CertificationBadge certificationLevel={4} levels={levels} />);
    expect(vars(screen.getByText('Revoked').closest('.mantine-Badge-root') as HTMLElement)).toEqual({
      color: AURA_STATUS.critical.fg, bg: AURA_STATUS.critical.bg,
    });

    rerender(<MaturityBadge levelName="Managed" levelColor="blue" />);
    expect(vars(screen.getByText('Managed').closest('.mantine-Badge-root') as HTMLElement).color).toBe(AURA_STATUS.info.fg);

    rerender(<PublicationBadge publicationScope="organization" />);
    expect(vars(screen.getByText('Organization').closest('.mantine-Badge-root') as HTMLElement).bg).toBe(AURA_STATUS.good.bg);

    // The palette verbatim, and every badge's text readable on its fill
    expect(AURA_STATUS.good).toMatchObject({ mark: '#277153', bg: '#DDEBE4' });
    expect(AURA_STATUS.warning).toMatchObject({ mark: '#B67F14', bg: '#FFF6E9' });
    expect(AURA_STATUS.critical.mark).toBe('#D41C16');
    expect(AURA_STATUS.info.mark).toBe('#1E7CA1');
    for (const tone of Object.values(AURA_STATUS)) {
      expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
    }

    // Quality and rating chips: the score band's tone
    api.get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes('quality')
          ? { overall_score_percent: 75, items_count: 2, measured_at: null }
          : { average_rating: 4.2, total_ratings: 3 },
      }),
    );
    rerender(
      <>
        <QualityBadge entityType="data_product" entityId="p1" />
        <RatingBadge entityType="data_product" entityId="p1" />
      </>,
    );
    const quality = await screen.findByText('75%');
    expect(quality).toHaveStyle({ color: AURA_STATUS.warning.fg });
    const chipBg = (el: Element | null) => (el as HTMLElement).style.getPropertyValue('--chip-bg');
    expect(chipBg(quality.closest('[title^="Data Quality"]'))).toBe(AURA_STATUS.warning.bg);
    const rating = await screen.findByText('4.2');
    expect(chipBg(rating.closest('[title*="out of 5 stars"]'))).toBe(AURA_STATUS.warning.bg);
    // Clickable chips tint on hover, and the text stays readable on the tint
    for (const tone of ['good', 'warning', 'critical'] as const) {
      expect(hoverFill(tone)).not.toBe(AURA_STATUS[tone].bg);
      expect(contrastRatio(AURA_STATUS[tone].fg, hoverFill(tone)), tone).toBeGreaterThanOrEqual(4.5);
    }
  });
});
