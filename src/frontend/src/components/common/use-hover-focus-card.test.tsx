/**
 * useHoverFocusCard's ArrowDown (wave 2 Task 11 housekeeping, from the Task
 * 10 re-review): it moves into the card only when the card has a control to
 * move to. On a card with none (MaturityInline), the key is left to the page,
 * so it still scrolls.
 */
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useHoverFocusCard } from './use-hover-focus-card';

function Card({ withControl }: { withControl: boolean }) {
  const card = useHoverFocusCard();
  return (
    <>
      <button type="button" {...card.target}>Target</button>
      {card.opened && (
        <div data-testid="card" {...card.dropdown}>
          {withControl ? <button type="button">Notify admin</button> : <span>Level 2 of 4</span>}
        </div>
      )}
    </>
  );
}

/** Lets the card's after-open look for its first control run its frames. */
const frames = () => act(() => new Promise((resolve) => setTimeout(resolve, 100)));

describe('useHoverFocusCard ArrowDown', () => {
  it('leaves ArrowDown to the page on a card with no control', async () => {
    render(<Card withControl={false} />);
    const target = screen.getByRole('button', { name: 'Target' });
    act(() => target.focus());
    expect(screen.getByTestId('card')).toBeInTheDocument();
    await frames();
    // Open: nothing to move to
    expect(fireEvent.keyDown(target, { key: 'ArrowDown' })).toBe(true);
    // Closed with Escape: ArrowDown doesn't open it, and the page still scrolls
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.queryByTestId('card')).toBeNull();
    expect(fireEvent.keyDown(target, { key: 'ArrowDown' })).toBe(true);
    await frames();
    expect(screen.queryByTestId('card')).toBeNull();
  });

  it('moves into a card with a control, opening it first if closed', async () => {
    render(<Card withControl />);
    const target = screen.getByRole('button', { name: 'Target' });
    act(() => target.focus());
    await frames();
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.queryByTestId('card')).toBeNull();
    let notPrevented = true;
    act(() => { notPrevented = fireEvent.keyDown(target, { key: 'ArrowDown' }); });
    expect(notPrevented).toBe(false);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notify admin' })).toHaveFocus());
  });

  it('learns a control that showed too late for its first look, once focus enters it', async () => {
    function SlowCard() {
      const card = useHoverFocusCard();
      const [ready, setReady] = useState(false);
      useEffect(() => {
        if (!card.opened) return undefined;
        const timer = setTimeout(() => setReady(true), 800);
        return () => clearTimeout(timer);
      }, [card.opened]);
      return (
        <>
          <button type="button" {...card.target}>Target</button>
          {card.opened && <div data-testid="card" {...card.dropdown}>{ready && <button type="button">Notify admin</button>}</div>}
        </>
      );
    }
    render(<SlowCard />);
    const target = screen.getByRole('button', { name: 'Target' });
    act(() => target.focus());
    const notify = await screen.findByRole('button', { name: 'Notify admin' }, { timeout: 2000 });
    // Tab into the card, back to the target, and close it there
    act(() => notify.focus());
    act(() => target.focus());
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.queryByTestId('card')).toBeNull();
    let notPrevented = true;
    act(() => { notPrevented = fireEvent.keyDown(target, { key: 'ArrowDown' }); });
    expect(notPrevented).toBe(false);
  });
});
