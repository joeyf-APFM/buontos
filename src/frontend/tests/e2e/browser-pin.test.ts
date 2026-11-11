import { describe, expect, it } from 'vitest';
import { PIN_COMMENTS, checkPin, finishPin, readPin, writePin } from './browser-pin';

const PIN = ['156.0.8078.81', '# a comment', '# another', ''].join('\n');

describe('readPin', () => {
  it('reads the first line that is not a comment', () => {
    expect(readPin(PIN)).toBe('156.0.8078.81');
    expect(readPin('# first\n\n  156.0.1  \n# after\n')).toBe('156.0.1');
  });

  it('treats a missing file or a file with no version line as nothing recorded', () => {
    expect(readPin(null)).toBeNull();
    expect(readPin('')).toBeNull();
    expect(readPin('# only comments\n# here\n')).toBeNull();
  });
});

describe('writePin', () => {
  it('replaces the version line and keeps the comments', () => {
    expect(writePin(PIN, '157.0.1.2')).toBe(['157.0.1.2', '# a comment', '# another', ''].join('\n'));
  });

  it('puts the version on its own line when the file has only comments', () => {
    const text = writePin('# only comments\n', '157.0.1.2');
    expect(text).toBe('157.0.1.2\n# only comments\n');
    expect(readPin(text)).toBe('157.0.1.2');
  });

  it('writes the standard comments for a missing or empty file', () => {
    for (const before of [null, '']) {
      const text = writePin(before, '157.0.1.2');
      expect(text).toBe(['157.0.1.2', ...PIN_COMMENTS, ''].join('\n'));
      expect(readPin(text)).toBe('157.0.1.2');
    }
  });
});

describe('checkPin', () => {
  it('passes when the running browser is the recorded one', () => {
    expect(checkPin('156.0.8078.81', '156.0.8078.81', false)).toEqual({ kind: 'ok' });
    expect(checkPin('156.0.8078.81', '156.0.8078.81', true)).toEqual({ kind: 'ok' });
  });

  it('fails a changed browser outside --update-snapshots=all', () => {
    expect(checkPin('155.0.0.0', '156.0.8078.81', false)).toEqual({
      kind: 'fail',
      message: 're-baseline: browser changed from 155.0.0.0 to 156.0.8078.81',
    });
  });

  it('fails a missing pin with what to run, outside --update-snapshots=all', () => {
    const result = checkPin(null, '156.0.8078.81', false);
    expect(result.kind).toBe('fail');
    expect(result.kind === 'fail' && result.message).toBe(
      're-baseline: no browser recorded in BROWSER.txt (running 156.0.8078.81); '
        + 'run the whole restyle check with --update-snapshots=all',
    );
  });

  it('defers the record to the end of an --update-snapshots=all run', () => {
    expect(checkPin('155.0.0.0', '156.0.8078.81', true)).toEqual({ kind: 'record' });
    expect(checkPin(null, '156.0.8078.81', true)).toEqual({ kind: 'record' });
  });
});

describe('finishPin', () => {
  it('does nothing when no page asked to record', () => {
    expect(finishPin({ wantsRecord: false, ranEveryPage: false, recorded: null, running: '1' })).toEqual({ kind: 'ok' });
  });

  it('writes the pin after an unfiltered run that re-recorded every page', () => {
    expect(finishPin({ wantsRecord: true, ranEveryPage: true, recorded: '155.0.0.0', running: '156.0.8078.81' }))
      .toEqual({ kind: 'write' });
  });

  it('refuses to record after a filtered run, and says to re-baseline the whole suite', () => {
    const result = finishPin({ wantsRecord: true, ranEveryPage: false, recorded: '155.0.0.0', running: '156.0.8078.81' });
    expect(result).toEqual({
      kind: 'fail',
      message: 're-baseline the whole suite: browser changed from 155.0.0.0 to 156.0.8078.81, but this '
        + '--update-snapshots=all run did not cover every page (a -g, file or project filter, or a failure '
        + 'that restarted the worker), so BROWSER.txt was not updated. Run the restyle check unfiltered '
        + 'with --update-snapshots=all.',
    });
  });

  it('names a missing pin in the filtered-run refusal', () => {
    const result = finishPin({ wantsRecord: true, ranEveryPage: false, recorded: null, running: '156.0.8078.81' });
    expect(result.kind === 'fail' && result.message).toMatch(/^re-baseline the whole suite: no browser recorded, running 156\.0\.8078\.81,/);
  });
});
