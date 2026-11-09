import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import { HelixMarkdown } from './helix-markdown';

const HOST = 'https://dbc-1.cloud.databricks.com';

describe('HelixMarkdown', () => {
  it('renders markdown but no raw HTML', () => {
    const { container } = renderWithMantine(
      <HelixMarkdown text={'There were **12** rows.\n\n<img src="x" onerror="alert(1)">\n\n<b>raw</b>'} workspaceHost={HOST} />,
    );

    expect(screen.getByText('12').tagName).toBe('STRONG');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('keeps links to the workspace host only', () => {
    renderWithMantine(
      <HelixMarkdown
        text={'See [the table](https://dbc-1.cloud.databricks.com/explore/data/x) or [this](https://evil.example/steal).'}
        workspaceHost={HOST}
      />,
    );

    const link = screen.getByRole('link', { name: 'the table' });
    expect(link).toHaveAttribute('href', 'https://dbc-1.cloud.databricks.com/explore/data/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'this' })).toBeNull();
    expect(screen.getByText('this')).toBeInTheDocument();
  });

  it('accepts a workspace host given without a scheme, and drops markdown images', () => {
    const { container } = renderWithMantine(
      <HelixMarkdown text={'[ok](https://dbc-1.cloud.databricks.com/a) ![pixel](https://evil.example/p.png)'} workspaceHost="dbc-1.cloud.databricks.com" />,
    );

    expect(screen.getByRole('link', { name: 'ok' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
