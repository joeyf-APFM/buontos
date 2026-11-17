/** Heading anchors. Must stay identical to `slugify_heading` and
 * `_split_sections` in src/backend/src/help/article_loader.py. */
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

/**
 * Anchors of the `## ` sections of raw markdown, keyed by 1-based line number
 * (line breaks: \r\n, \r or \n, as in mdast). The implicit `overview`
 * section is not included. Mirrors the backend: fenced blocks are skipped,
 * heading text is the raw text after `## `.
 */
export function computeSectionAnchorsByLine(markdown: string): Map<number, string> {
  const next = createAnchorGenerator();
  const byLine = new Map<number, string>();
  let fence: string | null = null;
  markdown.split(/\r\n|\r|\n/).forEach((line, index) => {
    const head = line.trimStart().slice(0, 3);
    const marker = head === '```' || head === '~~~' ? head : null;
    if (fence === null) {
      if (marker) {
        fence = marker;
      } else if (line.startsWith('## ')) {
        byLine.set(index + 1, next(line.slice(3).trim()));
      }
    } else if (marker === fence) {
      fence = null;
    }
  });
  return byLine;
}

/** Anchors of the `## ` sections in document order. */
export function computeSectionAnchors(markdown: string): string[] {
  return [...computeSectionAnchorsByLine(markdown).values()];
}
