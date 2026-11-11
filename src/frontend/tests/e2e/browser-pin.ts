/**
 * The restyle check's browser pin (__screenshots__/BROWSER.txt): the Chrome
 * version the baselines were recorded with, on the first line that isn't a
 * # comment. Pure text logic, so it is unit-tested (browser-pin.test.ts)
 * without running the check; restyle-check.spec.ts does the file I/O.
 */

/** The comments a new BROWSER.txt gets under its version line. */
export const PIN_COMMENTS = [
  "# The Google Chrome (Playwright channel 'chrome') that recorded restyle/.",
  '# restyle-check.spec.ts fails every page when the running Chrome differs:',
  '# re-record every page, unfiltered, with --update-snapshots=all, which also',
  '# updates the line above.',
  '# macOS only: the Optima font exists only on macOS. Other systems fall back to',
  '# Candara or Segoe UI, and every glyph would differ from these baselines.',
];

const isVersionLine = (line: string) => line.trim() !== '' && !line.trim().startsWith('#');

/** The recorded version, or null when the file is missing (null) or has no version line. */
export function readPin(text: string | null): string | null {
  const line = text?.split('\n').find(isVersionLine);
  return line ? line.trim() : null;
}

/** The file with `version` as its first line, followed by the old file's comments (or the standard ones). */
export function writePin(text: string | null, version: string): string {
  const rest = (text ?? '').split('\n').filter((line) => !isVersionLine(line));
  const comments = rest.some((line) => line.trim() !== '') ? rest : [...PIN_COMMENTS, ''];
  return [version, ...comments].join('\n');
}

export type PinCheck = { kind: 'ok' } | { kind: 'record' } | { kind: 'fail'; message: string };

/**
 * Per page, before any capture. Outside --update-snapshots=all a different or
 * missing pin fails the page. In `all` mode it asks for a record, which
 * finishPin makes only once every page has been re-recorded.
 */
export function checkPin(recorded: string | null, running: string, updateAll: boolean): PinCheck {
  if (recorded === running) return { kind: 'ok' };
  if (updateAll) return { kind: 'record' };
  if (recorded === null) {
    return {
      kind: 'fail',
      message: `re-baseline: no browser recorded in BROWSER.txt (running ${running}); `
        + 'run the whole restyle check with --update-snapshots=all',
    };
  }
  return { kind: 'fail', message: `re-baseline: browser changed from ${recorded} to ${running}` };
}

export type PinFinish = { kind: 'ok' } | { kind: 'write' } | { kind: 'fail'; message: string };

/** At the end of the run: write the pin only if a page asked to and every page ran. */
export function finishPin(opts: {
  wantsRecord: boolean;
  ranEveryPage: boolean;
  recorded: string | null;
  running: string;
}): PinFinish {
  const { wantsRecord, ranEveryPage, recorded, running } = opts;
  if (!wantsRecord) return { kind: 'ok' };
  if (ranEveryPage) return { kind: 'write' };
  const change = recorded === null
    ? `no browser recorded, running ${running}`
    : `browser changed from ${recorded} to ${running}`;
  return {
    kind: 'fail',
    message: `re-baseline the whole suite: ${change}, but this --update-snapshots=all run did not `
      + 'cover every page (a -g, file or project filter, or a failure that restarted the worker), so '
      + 'BROWSER.txt was not updated. Run the restyle check unfiltered with --update-snapshots=all.',
  };
}
