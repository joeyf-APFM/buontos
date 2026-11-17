/**
 * Whether the body's first non-empty line is a `# ` heading. (A fence opener or
 * prose as the first line means no leading h1, so fenced `#` lines never count.)
 */
export function startsWithH1(body: string): boolean {
  const first = body.split(/\r?\n/).find((line) => line.trim() !== '');
  return first !== undefined && first.startsWith('# ');
}
