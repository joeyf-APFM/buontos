/** Fake Helix answers for the tests. */

/** One server-sent event frame, as the backend writes it. */
export const frame = (kind: string, data: unknown) => `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;

/** A streamed `text/event-stream` response made of these chunks. */
export function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** A streamed response the test writes to, and closes, as it goes. */
export function openStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send: (kind: string, data: unknown) => controller.enqueue(encoder.encode(frame(kind, data))),
    close: () => controller.close(),
  };
}
