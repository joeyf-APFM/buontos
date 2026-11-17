import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithMantine, userEvent } from '@/test/utils';
import { HelpButton } from './help-button';

describe('HelpButton', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response),
    ) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders_button_with_accessible_label_and_question_mark', () => {
    renderWithMantine(<HelpButton />);
    const button = screen.getByRole('button', { name: 'Help' });
    expect(button).toHaveTextContent('?');
  });

  it('click_opens_drawer', async () => {
    renderWithMantine(<HelpButton />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search help')).toBeInTheDocument();
  });

  it('does_not_fetch_until_opened', async () => {
    renderWithMantine(<HelpButton />);
    expect(global.fetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    await screen.findByRole('dialog');
    expect(global.fetch).toHaveBeenCalledWith('/api/help/articles');
  });
});
