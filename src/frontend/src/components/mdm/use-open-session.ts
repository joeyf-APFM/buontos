import { useState } from 'react';

/**
 * A number that changes each time `isOpen` turns true: the key of a dialog's
 * form, so its fields (and its loads) start afresh on every open. Worked out
 * while rendering, so the old form never shows for a frame on reopen.
 */
export function useOpenSession(isOpen: boolean): number {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSession((s) => s + 1);
  }
  return session;
}
