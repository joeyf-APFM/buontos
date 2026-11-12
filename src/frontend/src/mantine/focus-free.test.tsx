import { afterEach, describe, expect, it } from 'vitest';
import { focusIsFree } from './focus-free';

function modal(id: string) {
  const content = document.createElement('section');
  content.setAttribute('data-modal-content', '');
  content.id = id;
  const button = document.createElement('button');
  content.appendChild(button);
  document.body.appendChild(content);
  return { content, button };
}

describe('focusIsFree', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('is free with focus on the body', () => {
    (document.activeElement as HTMLElement | null)?.blur();
    expect(focusIsFree(null)).toBe(true);
  });

  it('is free with focus still in the Modal that closed', () => {
    const closed = modal('closed');
    closed.button.focus();
    expect(focusIsFree(closed.content)).toBe(true);
  });

  it('is not free with focus in another, open Modal: the user moved it there', () => {
    const closed = modal('closed');
    const other = modal('other');
    other.button.focus();
    expect(focusIsFree(closed.content)).toBe(false);
    expect(focusIsFree(null)).toBe(false);
  });

  it('is not free with focus on a page control', () => {
    const search = document.createElement('input');
    document.body.appendChild(search);
    search.focus();
    expect(focusIsFree(modal('closed').content)).toBe(false);
  });

  // Wave 2 Task 11 fix round 1 (R41): a trapFocus Popover or Menu inside the
  // Modal holds focus in its portal, outside the content
  it('is free with focus in a floating dropdown whose target was in the Modal that closed', () => {
    const closed = modal('closed');
    closed.button.setAttribute('aria-controls', 'menu-1');
    const dropdown = document.createElement('div');
    dropdown.id = 'menu-1';
    dropdown.className = 'mantine-Popover-dropdown';
    const item = document.createElement('button');
    dropdown.appendChild(item);
    document.body.appendChild(dropdown);
    item.focus();
    expect(focusIsFree(closed.content)).toBe(true);
    // A dropdown of a control elsewhere is not the closed Modal's
    const other = modal('other');
    closed.button.removeAttribute('aria-controls');
    other.button.setAttribute('aria-controls', 'menu-1');
    expect(focusIsFree(closed.content)).toBe(false);
  });
});
