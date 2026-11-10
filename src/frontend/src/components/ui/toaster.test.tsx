import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifications } from '@mantine/notifications';
import { Toaster } from './toaster';
import { ToastAction } from './toast';
import { toast, useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';

afterEach(() => { act(() => { notifications.clean(); notifications.cleanQueue(); }); });

describe('Toaster', () => {
  it('toast shows title and description', async () => {
    render(<Toaster />);
    act(() => { toast({ title: 'Saved', description: 'All changes stored' }); });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('All changes stored')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('destructive toast renders with the critical colour and an action', async () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast({
        variant: 'destructive',
        title: 'Failed',
        description: 'Try again',
        action: <ToastAction altText="Retry" onClick={onClick}>Retry</ToastAction>,
      });
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed');
    expect(alert.getAttribute('style') ?? '').toContain('--notification-color: var(--mantine-color-red');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('dismiss removes it', async () => {
    render(<Toaster />);
    let t!: ReturnType<typeof toast>;
    act(() => { t = toast({ title: 'Going away' }); });
    await screen.findByText('Going away');
    act(() => { t.dismiss(); });
    await waitFor(() => expect(screen.queryByText('Going away')).toBeNull());
  });

  it('update changes its text', async () => {
    render(<Toaster />);
    let t!: ReturnType<typeof toast>;
    act(() => { t = toast({ title: 'Working', description: 'Please wait' }); });
    await screen.findByText('Working');
    act(() => { t.update({ title: 'Done', description: 'Finished' }); });
    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.queryByText('Working')).toBeNull();
  });

  it('does not swallow Escape: the open dialog still closes', async () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Body</DialogDescription>
          </DialogContent>
        </Dialog>
        <Toaster />
      </>
    );
    act(() => { toast({ title: 'Saved' }); });
    await screen.findByText('Saved');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('a new toast replaces the last one at once', async () => {
    render(<Toaster />);
    act(() => { toast({ title: 'First' }); });
    await screen.findByText('First');
    act(() => { toast({ variant: 'destructive', title: 'Second' }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Second');
    await waitFor(() => expect(screen.queryByText('First')).toBeNull());
    expect(screen.getAllByText(/First|Second/)).toHaveLength(1);
  });

  it('closes itself after its duration', async () => {
    render(<Toaster />);
    act(() => { toast({ title: 'Brief', duration: 100 }); });
    await screen.findByText('Brief');
    await waitFor(() => expect(screen.queryByText('Brief')).toBeNull(), { timeout: 3000 });
  });

  it('dismiss() with no id clears the toast', async () => {
    render(<Toaster />);
    act(() => { toast({ title: 'Clear me' }); });
    await screen.findByText('Clear me');
    act(() => { useToast().dismiss(); });
    await waitFor(() => expect(screen.queryByText('Clear me')).toBeNull());
  });

  it('update to destructive changes the role and colour', async () => {
    render(<Toaster />);
    let t!: ReturnType<typeof toast>;
    act(() => { t = toast({ title: 'Working' }); });
    const status = await screen.findByRole('status');
    expect(status.getAttribute('style') ?? '').not.toContain('red');
    act(() => { t.update({ variant: 'destructive', title: 'Failed' }); });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed');
    expect(alert.getAttribute('style') ?? '').toContain('--mantine-color-red');
  });

  it('keeps toasts clickable (pointer-events: auto) over a modal that disables the body', async () => {
    render(<Toaster />);
    act(() => { toast({ title: 'Clickable' }); });
    const item = (await screen.findByText('Clickable')).closest('[role="status"]') as HTMLElement;
    expect(item.parentElement!.closest('[data-position]')).toHaveStyle({ pointerEvents: 'auto' });
  });

  it('Escape with focus inside the toast closes only the toast, not the dialog', async () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Body</DialogDescription>
          </DialogContent>
        </Dialog>
        <Toaster />
      </>
    );
    act(() => { toast({ title: 'Heads up' }); });
    const close = (await screen.findByText('Heads up')).closest('[role="status"]')!.querySelector('button')!;
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Heads up')).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
