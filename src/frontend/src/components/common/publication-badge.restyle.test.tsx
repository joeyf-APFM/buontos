/**
 * Wave 2 Task 6: the publication badge (Data Contracts, Data Products,
 * Marketplace) keeps its props and look, with its tooltip on Mantine.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import PublicationBadge from './publication-badge';

describe('publication badge', () => {
  it('publication badge shows who published it in a Mantine tooltip', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <PublicationBadge publicationScope="external" publishedBy="rita@example.com" publishedAt="2026-11-02T15:30:00Z" />,
    );
    const badge = screen.getByText('External').closest('.mantine-Badge-root') as HTMLElement;
    // Not a Radix trigger any more
    expect(badge).not.toHaveAttribute('data-state');
    await user.hover(badge);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveClass('mantine-Tooltip-tooltip');
    expect(tip).toHaveTextContent('Published: External');
    expect(tip).toHaveTextContent('By: rita@example.com');
    expect(tip).toHaveTextContent(`On: ${new Date('2026-11-02T15:30:00Z').toLocaleDateString()}`);
  });

  it('publication badge renders nothing for an unpublished entity', () => {
    const { container } = renderWithMantine(<PublicationBadge publicationScope={null} />);
    expect(container.querySelector('.mantine-Badge-root')).toBeNull();
  });
});
