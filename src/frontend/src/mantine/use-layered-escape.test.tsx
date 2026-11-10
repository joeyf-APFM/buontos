import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLayeredEscape } from './use-layered-escape';

function Harness({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  useLayeredEscape(opened, onClose);
  return <input aria-label="field" />;
}

describe('useLayeredEscape', () => {
  it('closes on Escape while open', () => {
    const onClose = vi.fn();
    render(<Harness opened onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing while closed, or after unmount', () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(<Harness opened={false} onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    rerender(<Harness opened onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves an Escape that a Radix layer above took (it prevents the default)', () => {
    const onClose = vi.fn();
    render(<Harness opened onClose={onClose} />);
    const take = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener('keydown', take, true);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), { key: 'Escape' });
    document.removeEventListener('keydown', take, true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves an Escape on a Mantine combobox with its list open', () => {
    const onClose = vi.fn();
    render(<Harness opened onClose={onClose} />);
    const field = screen.getByRole('textbox', { name: 'field' });
    field.setAttribute('data-mantine-stop-propagation', 'true');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves it when the combobox drops its mark before the key reaches the window, as a browser does', () => {
    // React commits the list's close in a microtask after its own handler,
    // before the event bubbles to the window: the mark is gone by then
    const onClose = vi.fn();
    render(<Harness opened onClose={onClose} />);
    const field = screen.getByRole('textbox', { name: 'field' });
    field.setAttribute('data-mantine-stop-propagation', 'true');
    field.addEventListener('keydown', () => field.removeAttribute('data-mantine-stop-propagation'));
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // The next Escape, with the list closed, closes
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
