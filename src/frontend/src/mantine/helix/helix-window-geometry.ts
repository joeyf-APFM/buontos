/** Where the floating Helix window sits and how big it is, kept inside the viewport. */
import type { WindowRect } from './helix-store';

export const WINDOW_DEFAULT = { width: 380, height: 520 } as const;
export const WINDOW_MIN = { width: 320, height: 360 } as const;
/** The gap to the viewport's edges when the window first opens. */
export const WINDOW_MARGIN = 16;

export interface Viewport {
  width: number;
  height: number;
}

export const currentViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Bottom-right, at the default size. */
export function defaultRect(vp: Viewport): WindowRect {
  const { width, height } = WINDOW_DEFAULT;
  return clampRect({ x: vp.width - width - WINDOW_MARGIN, y: vp.height - height - WINDOW_MARGIN, width, height }, vp);
}

/** The rect, shrunk to fit the viewport if need be and moved fully inside it. */
export function clampRect(rect: WindowRect, vp: Viewport): WindowRect {
  const width = Math.min(Math.max(rect.width, WINDOW_MIN.width), vp.width);
  const height = Math.min(Math.max(rect.height, WINDOW_MIN.height), vp.height);
  return {
    width,
    height,
    x: clamp(rect.x, 0, vp.width - width),
    y: clamp(rect.y, 0, vp.height - height),
  };
}

/** The window moved by (dx, dy). */
export const movedRect = (start: WindowRect, dx: number, dy: number, vp: Viewport): WindowRect =>
  clampRect({ ...start, x: start.x + dx, y: start.y + dy }, vp);

/** The window resized from its bottom-left corner: the right and top edges stay put. */
export function resizedRect(start: WindowRect, dx: number, dy: number, vp: Viewport): WindowRect {
  const right = start.x + start.width;
  const width = clamp(start.width - dx, WINDOW_MIN.width, right);
  const height = clamp(start.height + dy, WINDOW_MIN.height, vp.height - start.y);
  return { x: right - width, y: start.y, width, height };
}
