/**
 * Wave 2 Task 11: ConceptSelectDialog (Radix, R38) has no DialogTrigger, so
 * Radix gives focus back to nothing once it closes. `returnFocusTo` names the
 * element that should get it (BusinessConceptsDisplay's Add button), used
 * only while that element is still in the page. The kit's own focus return
 * (R41) covers kit Dialogs only, so the prop stays.
 */
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConceptSelectDialog from './concept-select-dialog';

vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({ get: vi.fn(async () => ({ data: [] })), post: vi.fn() }),
}));

function Opener({ keepOpener = true }: { keepOpener?: boolean }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      {(keepOpener || !used) && <button ref={button} type="button" onClick={() => { setOpen(true); setUsed(true); }}>Add Concept</button>}
      <ConceptSelectDialog isOpen={open} onOpenChange={setOpen} onSelect={vi.fn()} returnFocusTo={button} />
    </>
  );
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 300)));

describe('ConceptSelectDialog returnFocusTo', () => {
  it('gives focus back to returnFocusTo once it has closed', async () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Add Concept' });
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    opener.blur();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Concept' })).toHaveFocus());
  });

  it('falls back to Radix when that element is gone', async () => {
    render(<Opener keepOpener={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Concept' }));
    const dialog = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // The opener unmounted for good while the picker was open
    expect(screen.queryByRole('button', { name: 'Add Concept' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle();
    // Radix's own close ran: focus is on the body, and nothing threw
    expect(document.activeElement).toBe(document.body);
  });
});
