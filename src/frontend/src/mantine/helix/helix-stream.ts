/**
 * The browser side of `POST /api/helix/ask`: a server-sent event stream read
 * with fetch (EventSource can't POST). Every answer ends with exactly one
 * `done` or `error` event, including when the request fails or the stream is
 * cut short. Aborting the signal ends the generator quietly.
 */
import i18n from '@/i18n/config';

export type HelixEventKind = 'conversation' | 'text' | 'sql' | 'result' | 'done' | 'error';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HelixEvent = { kind: HelixEventKind; data: any };

export interface HelixAskBody {
  question: string;
  context?: string;
  conversation_id?: string;
}

const KINDS = new Set<string>(['conversation', 'text', 'sql', 'result', 'done', 'error']);

const errorEvent = (message: string): HelixEvent => ({ kind: 'error', data: { message } });

/** One SSE frame (the text between blank lines) as an event, or null to skip it. */
function parseFrame(frame: string): HelixEvent | null {
  let kind = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue; // comments, e.g. keep-alives
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') kind = value;
    else if (field === 'data') data.push(value);
  }
  if (!KINDS.has(kind) || data.length === 0) return null;
  try {
    const parsed = JSON.parse(data.join('\n'));
    return parsed && typeof parsed === 'object' ? { kind: kind as HelixEventKind, data: parsed } : null;
  } catch {
    return null;
  }
}

/** The error a non-2xx answer carries: the server's `detail` when it is text. */
async function failureMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.detail === 'string' && body.detail) return body.detail;
  return i18n.t('helix:errors.http', { status: response.status });
}

export async function* askHelix(body: HelixAskBody, signal: AbortSignal): AsyncGenerator<HelixEvent> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch('/api/helix/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      yield errorEvent(await failureMessage(response));
      return;
    }
    if (!response.body) {
      yield errorEvent(i18n.t('helix:errors.cutShort'));
      return;
    }
    reader = response.body.getReader();
    // Stop reading even if the transport ignores the signal
    const stopReading = () => void reader?.cancel().catch(() => undefined);
    signal.addEventListener('abort', stopReading, { once: true });
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Normalise line ends; a trailing \r may be the first half of \r\n
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n|\r(?!$)/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = parseFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (!event) continue;
        yield event;
        if (event.kind === 'done' || event.kind === 'error') return;
      }
    }
    if (signal.aborted) return;
    yield errorEvent(i18n.t('helix:errors.cutShort'));
  } catch {
    if (signal.aborted) return;
    yield errorEvent(i18n.t('helix:errors.network'));
  } finally {
    reader?.cancel().catch(() => undefined);
  }
}
