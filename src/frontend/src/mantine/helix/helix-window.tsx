/**
 * Helix as a floating, non-modal window, on every page but the explorer
 * (R24). It drags by its header, resizes from its bottom-left corner, stays
 * inside the viewport, and keeps its place for the session.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { HelixContent } from './helix-panel';
import { useHelixStore, type WindowRect } from './helix-store';
import { clampRect, currentViewport, defaultRect, movedRect, resizedRect } from './helix-window-geometry';
import classes from './helix.module.css';

type Gesture = { kind: 'move' | 'resize'; pointerId: number; startX: number; startY: number; start: WindowRect };

/** Pointer-downs on these stay theirs (the close button sits in the header). */
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"]';

export function HelixWindow() {
  const titleId = useId();
  const stored = useHelixStore((s) => s.windowRect);
  const { close, setWindowRect } = useHelixStore((s) => s.actions);
  const rect = clampRect(stored ?? defaultRect(currentViewport()), currentViewport());
  const root = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  // Read at first render, before focus moves in (and once, under StrictMode's double effects)
  const [opener] = useState(() => document.activeElement);

  // Focus moves in; whatever had it gets it back when Helix closes
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const input = el.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
    (input ?? el).focus();
    return () => {
      if (!useHelixStore.getState().isOpen && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  // A smaller viewport pulls the window back inside
  useEffect(() => {
    const onResize = () => {
      const { windowRect } = useHelixStore.getState();
      const vp = currentViewport();
      setWindowRect(clampRect(windowRect ?? defaultRect(vp), vp));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setWindowRect]);

  // While dragging or resizing, follow the pointer anywhere on the page
  useEffect(() => {
    if (!gesture) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== gesture.pointerId) return;
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      const vp = currentViewport();
      setWindowRect(gesture.kind === 'move' ? movedRect(gesture.start, dx, dy, vp) : resizedRect(gesture.start, dx, dy, vp));
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
  }, [gesture, setWindowRect]);

  const begin = (kind: Gesture['kind'], e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (kind === 'move' && (e.target as Element).closest(INTERACTIVE))) return;
    e.preventDefault();
    setGesture({ kind, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, start: rect });
  };
  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLElement>) => begin('move', e);
  const onGripPointerDown = (e: ReactPointerEvent<HTMLElement>) => begin('resize', e);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.stopPropagation();
      close();
    }
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
      <HelixContent titleId={titleId} onHeaderPointerDown={onHeaderPointerDown} />
      <div className={classes.resize} data-testid="helix-resize" aria-hidden onPointerDown={onGripPointerDown} />
    </div>
  );
}
