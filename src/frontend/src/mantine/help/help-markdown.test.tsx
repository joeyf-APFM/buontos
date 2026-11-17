import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithMantine, userEvent } from '@/test/utils';
import { HelpMarkdown } from './help-markdown';

describe('HelpMarkdown', () => {
  it('renders_headings_with_matching_ids', () => {
    const md = '# Setup\n\n### Setup\n\n## Setup\n\n#### Deep\n\n## [Docs](/x)\n\n## Setup\n';
    renderWithMantine(<HelpMarkdown text={md} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('id', 'overview');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.id)).toEqual(['setup', 'docsx', 'setup-2']);
    expect(screen.getByRole('heading', { level: 3 })).not.toHaveAttribute('id');
    expect(screen.getByRole('heading', { level: 4 })).not.toHaveAttribute('id');
  });

  it('does_not_render_raw_html', () => {
    const { container } = renderWithMantine(
      <HelpMarkdown text={'Hello\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('internal_link_navigates_without_new_tab', async () => {
    renderWithMantine(<HelpMarkdown text="[Go](/help/x)" />);
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toHaveAttribute('href', '/help/x');
    expect(link).not.toHaveAttribute('target');
    await userEvent.click(link);
    expect(window.location.pathname).toBe('/help/x');
  });

  it('hash_link_is_same_tab_anchor', () => {
    renderWithMantine(<HelpMarkdown text="[Jump](#setup)" />);
    const link = screen.getByRole('link', { name: 'Jump' });
    expect(link).toHaveAttribute('href', '#setup');
    expect(link).not.toHaveAttribute('target');
  });

  it('external_link_has_noopener_and_target_blank', () => {
    renderWithMantine(<HelpMarkdown text="[Docs](https://example.com/x)" />);
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    ['javascript', '[x](javascript:alert(1))'],
    ['data', '[x](data:text/html,<b>hi</b>)'],
    ['protocol-relative', '[x](//evil.com)'],
  ])('%s link renders as plain text', (_name, md) => {
    renderWithMantine(<HelpMarkdown text={md} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('images_render_alt_text_only', () => {
    const { container } = renderWithMantine(<HelpMarkdown text="![Architecture diagram](https://x.test/a.png)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Architecture diagram')).toBeInTheDocument();
  });
});
