import { afterEach, describe, expect, it, vi } from 'vitest';
import { askHelix, type HelixEvent } from './helix-stream';
import { sseResponse } from './test-fixtures';

async function collect(gen: AsyncGenerator<HelixEvent>) {
  const out: HelixEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const ask = () => collect(askHelix({ question: 'How many?' }, new AbortController().signal));

describe('askHelix', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the question and parses frames split across chunks', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'event: conversation\ndata: {"conversation_id"',
        ': "c1"}\n\nevent: te',
        'xt\r\ndata: {"text": "Hello"}\r\n\r\n',
        'event: done\ndata: {}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await ask()).toEqual([
      { kind: 'conversation', data: { conversation_id: 'c1' } },
      { kind: 'text', data: { text: 'Hello' } },
      { kind: 'done', data: {} },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/helix/ask');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ question: 'How many?' });
  });

  it('ignores comment lines and unknown events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse([': keep-alive\n\n', 'event: text\n: a comment\ndata: {"text": "Hi"}\n\n', 'event: ping\ndata: {}\n\n', 'event: done\ndata: {}\n\n']),
    ));

    expect(await ask()).toEqual([
      { kind: 'text', data: { text: 'Hi' } },
      { kind: 'done', data: {} },
    ]);
  });

  it('turns a non-2xx answer into one error event with the server’s detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'Helix needs your Databricks sign-in.' }), { status: 403 }),
    ));

    expect(await ask()).toEqual([{ kind: 'error', data: { message: 'Helix needs your Databricks sign-in.' } }]);
  });

  it('ends with an error when the stream stops before done', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['event: text\ndata: {"text": "Part"}\n\n'])));

    const events = await ask();
    expect(events).toHaveLength(2);
    expect(events[1].kind).toBe('error');
  });
});
