/** Heading anchors. Must stay identical to `slugify_heading` and the duplicate
 * handling in src/backend/src/help/article_loader.py. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** One generator per article; repeats get `-2`, `-3`... (collision safe). */
export function createAnchorGenerator(): (text: string) => string {
  const used = new Set<string>(['overview']);
  return (text: string) => {
    const base = slugifyHeading(text) || 'section';
    let anchor = base;
    let n = 1;
    while (used.has(anchor)) {
      n += 1;
      anchor = `${base}-${n}`;
    }
    used.add(anchor);
    return anchor;
  };
}
