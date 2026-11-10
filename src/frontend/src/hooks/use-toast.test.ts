import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifications } from '@mantine/notifications';
import { useToast, toast } from './use-toast';

afterEach(() => vi.restoreAllMocks());

describe('useToast', () => {
  it('exposes toast and dismiss', () => {
    const t = useToast();
    expect(typeof t.toast).toBe('function');
    expect(typeof t.dismiss).toBe('function');
  });

  it('returns id, dismiss and update', () => {
    const r = toast({ title: 'x' });
    expect(r.id).toBeDefined();
    expect(typeof r.dismiss).toBe('function');
    expect(typeof r.update).toBe('function');
    r.dismiss();
  });

  it('maps destructive to a red alert and the default to a status', () => {
    const show = vi.spyOn(notifications, 'show');
    toast({ title: 'a' });
    toast({ title: 'b', variant: 'destructive' });
    expect(show.mock.calls[0][0]).toMatchObject({ role: 'status', color: undefined, autoClose: 5000 });
    expect(show.mock.calls[1][0]).toMatchObject({ role: 'alert', color: 'red' });
    notifications.clean();
  });

  it('passes duration through, and Infinity stays open', () => {
    const show = vi.spyOn(notifications, 'show');
    toast({ title: 'a', duration: 1200 });
    toast({ title: 'b', duration: Infinity });
    expect(show.mock.calls[0][0]).toMatchObject({ autoClose: 1200 });
    expect(show.mock.calls[1][0]).toMatchObject({ autoClose: false });
    notifications.clean();
  });

  it('dismiss(id) hides one; dismiss() cleans all', () => {
    const hide = vi.spyOn(notifications, 'hide');
    const clean = vi.spyOn(notifications, 'clean');
    useToast().dismiss('7');
    expect(hide).toHaveBeenCalledWith('7');
    useToast().dismiss();
    expect(clean).toHaveBeenCalled();
  });
});
