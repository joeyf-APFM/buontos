export type CollapsedTrail<T> =
  | { collapsed: false; crumbs: T[] }
  | { collapsed: true; head: T; hidden: T[]; tail: T[] };

/** A trail of more than `max` crumbs shows its first, "…" for the middle ones, and the last `max - 2`. */
export function collapseTrail<T>(crumbs: T[], max = 6): CollapsedTrail<T> {
  if (crumbs.length <= max) return { collapsed: false, crumbs };
  const tailStart = crumbs.length - (max - 2);
  return { collapsed: true, head: crumbs[0], hidden: crumbs.slice(1, tailStart), tail: crumbs.slice(tailStart) };
}
