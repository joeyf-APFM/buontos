import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import { HelpMarkdown } from './help-markdown';

describe('HelpMarkdown', () => {
  it('renders_headings_with_matching_ids', () => {
    renderWithMantine(<HelpMarkdown text={'# Guide\n\n## Setup\n\n### Setup\n\n#### Deep Dive\n'} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guide' })).toHaveAttribute('id', 'guide');
    const setups = screen.getAllByRole('heading', { name: 'Setup' });
    expect(setups.map((h) => h.id)).toEqual(['setup', 'setup-2']);
    expect(screen.getByRole('heading', { level: 4 })).toHaveAttribute('id', 'deep-dive');
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
    renderWithMantine(<HelpMarkdown text="[Domains](/domains)" />);
    const link = screen.getByRole('link', { name: 'Domains' });
    expect(link).toHaveAttribute('href', '/domains');
    expect(link).not.toHaveAttribute('target');
  });

  it('external_link_has_noopener_and_target_blank', () => {
    renderWithMantine(<HelpMarkdown text="[Docs](https://example.com/x)" />);
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('images_render_alt_text_only', () => {
    const { container } = renderWithMantine(<HelpMarkdown text="![Architecture diagram](https://x.test/a.png)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Architecture diagram')).toBeInTheDocument();
  });
});
