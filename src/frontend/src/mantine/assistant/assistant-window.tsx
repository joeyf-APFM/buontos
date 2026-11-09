/**
 * The floating window both assistants (Helix, Ask Ontos) live in (R24–R26):
 * non-modal, dragged by its header, resized from its bottom-left corner, kept
 * inside the viewport, Esc to close with focus given back, and focus taken
 * only when the user just opened it. Each assistant keeps its own rect.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CloseButton } from '@mantine/core';
import { clampRect, currentViewport, defaultRect, movedRect, resizedRect, type WindowRect } from './window-geometry';
import classes from './assistant-window.module.css';

type Gesture = { kind: 'move' | 'resize'; pointerId: number; startX: number; startY: number; start: WindowRect };

/** Pointer-downs on these stay theirs (the header holds buttons). */
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"]';

export interface AssistantWindowProps {
  /** The header title; the dialog is labelled by it. */
  title: ReactNode;
  icon: ReactNode;
  /** Controls between the title and the close button. */
  headerExtras?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** Whether the assistant is still open (a StrictMode re-mount isn't a close). */
  isOpen: () => boolean;
  /** Where the user last put the window, or null for its default place. */
  rect: WindowRect | null;
  onRectChange: (rect: WindowRect) => void;
  /** The user just opened it, so it may take focus. */
  focusRequested: boolean;
  /** Consumes the focus request; true when it was pending. */
  takeFocusRequest: () => boolean;
  children: ReactNode;
}

export function AssistantWindow({
  title, icon, headerExtras, closeLabel, onClose, isOpen, rect: stored, onRectChange,
  focusRequested, takeFocusRequest, children,
}: AssistantWindowProps) {
  const titleId = useId();
  const rect = clampRect(stored ?? defaultRect(currentViewport()), currentViewport());
  const root = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [, setViewportTick] = useState(0);
  // Read at first render, before focus moves in (and once, under StrictMode's double effects)
  const [opener] = useState(() => document.activeElement);
  // The latest props, for listeners that outlive a render
  const latest = useRef({ stored, onRectChange, isOpen });
  useEffect(() => {
    latest.current = { stored, onRectChange, isOpen };
  });

  // Only a user's open moves focus in
  useEffect(() => {
    if (!focusRequested || !takeFocusRequest()) return;
    const el = root.current;
    if (!el) return;
    (el.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)') ?? el).focus();
  }, [focusRequested, takeFocusRequest]);

  // Whatever had focus when the window appeared gets it back when it closes
  useEffect(
    () => () => {
      if (!latest.current.isOpen() && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    },
    [opener],
  );

  // A smaller viewport pulls a placed window back inside; one never moved
  // keeps following its bottom-right default
  useEffect(() => {
    const onResize = () => {
      const { stored: current, onRectChange: change } = latest.current;
      if (current) {
        const clamped = clampRect(current, currentViewport());
        const changed = (Object.keys(clamped) as (keyof WindowRect)[]).some((k) => clamped[k] !== current[k]);
        if (changed) change(clamped);
      }
      setViewportTick((n) => n + 1);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // While dragging or resizing, follow the pointer anywhere on the page
  useEffect(() => {
    if (!gesture) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== gesture.pointerId) return;
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      const vp = currentViewport();
      latest.current.onRectChange(
        gesture.kind === 'move' ? movedRect(gesture.start, dx, dy, vp) : resizedRect(gesture.start, dx, dy, vp),
      );
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId === gesture.pointerId) setGesture(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [gesture]);

  const begin = (kind: Gesture['kind'], e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (kind === 'move' && (e.target as Element).closest(INTERACTIVE))) return;
    e.preventDefault();
    setGesture({ kind, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, start: rect });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys in portalled menus and dialogs bubble here through React; they aren't ours
    if (e.key !== 'Escape' || e.nativeEvent.isComposing || !e.currentTarget.contains(e.target as Node)) return;
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      ref={root}
      className={classes.window}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
      onKeyDown={onKeyDown}
    >
      <div className={classes.head} onPointerDown={(e) => begin('move', e)}>
        <span className={classes.icon}>{icon}</span>
        <h2 id={titleId} className={classes.title}>
          {title}
        </h2>
        <div className={classes.extras}>
          {headerExtras}
          <CloseButton aria-label={closeLabel} onClick={onClose} />
        </div>
      </div>
      {children}
      <div className={classes.resize} data-testid="assistant-resize" aria-hidden onPointerDown={(e) => begin('resize', e)} />
    </div>
  );
}
