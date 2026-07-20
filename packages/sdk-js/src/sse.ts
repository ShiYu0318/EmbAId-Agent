export interface ServerSentEvent {
  event: string;
  data: string;
  id: string | undefined;
  retry: number | undefined;
}

interface Terminator {
  lineEnd: number;
  nextStart: number;
}

const BOM = 0xfeff;

function findTerminator(buffer: string, from: number, final: boolean): Terminator | null {
  for (let index = from; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char === "\n") {
      return { lineEnd: index, nextStart: index + 1 };
    }
    if (char === "\r") {
      if (index + 1 < buffer.length) {
        return buffer[index + 1] === "\n"
          ? { lineEnd: index, nextStart: index + 2 }
          : { lineEnd: index, nextStart: index + 1 };
      }
      return final ? { lineEnd: index, nextStart: index + 1 } : null;
    }
  }
  return null;
}

/**
 * Incremental parser for the `text/event-stream` wire format.
 *
 * A trailing `\r` is held back rather than treated as a line terminator, because
 * the next chunk may begin with the `\n` that completes a CRLF pair.
 */
export class SSEDecoder {
  #buffer = "";
  #data: string[] = [];
  #eventType = "";
  #lastEventId: string | undefined;
  #retry: number | undefined;
  #startOfStream = true;

  push(chunk: string): ServerSentEvent[] {
    if (chunk.length === 0) {
      return [];
    }

    let text = chunk;
    if (this.#startOfStream) {
      this.#startOfStream = false;
      if (text.charCodeAt(0) === BOM) {
        text = text.slice(1);
      }
    }

    this.#buffer += text;
    return this.#drain(false);
  }

  /**
   * Parses whatever is left once the transport signals end of stream. A frame
   * that was never terminated by a blank line is still dispatched, so servers
   * that close immediately after the last frame do not lose it.
   */
  flush(): ServerSentEvent[] {
    this.#startOfStream = false;
    const events = this.#drain(true);
    if (this.#buffer.length > 0) {
      const line = this.#buffer;
      this.#buffer = "";
      const event = this.#handleLine(line);
      if (event !== null) {
        events.push(event);
      }
    }
    const pending = this.#dispatch();
    if (pending !== null) {
      events.push(pending);
    }
    return events;
  }

  #drain(final: boolean): ServerSentEvent[] {
    const events: ServerSentEvent[] = [];
    let start = 0;

    for (;;) {
      const terminator = findTerminator(this.#buffer, start, final);
      if (terminator === null) {
        break;
      }
      const line = this.#buffer.slice(start, terminator.lineEnd);
      start = terminator.nextStart;
      const event = this.#handleLine(line);
      if (event !== null) {
        events.push(event);
      }
    }

    if (start > 0) {
      this.#buffer = this.#buffer.slice(start);
    }
    return events;
  }

  #handleLine(line: string): ServerSentEvent | null {
    if (line.length === 0) {
      return this.#dispatch();
    }

    if (line.startsWith(":")) {
      return null;
    }

    const colon = line.indexOf(":");
    let field: string;
    let value: string;

    if (colon === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
    }

    switch (field) {
      case "event":
        this.#eventType = value;
        break;
      case "data":
        this.#data.push(value);
        break;
      case "id":
        if (!value.includes("\0")) {
          this.#lastEventId = value;
        }
        break;
      case "retry":
        if (/^\d+$/.test(value)) {
          this.#retry = Number(value);
        }
        break;
      default:
        break;
    }

    return null;
  }

  #dispatch(): ServerSentEvent | null {
    if (this.#data.length === 0) {
      this.#eventType = "";
      return null;
    }

    const event: ServerSentEvent = {
      event: this.#eventType === "" ? "message" : this.#eventType,
      data: this.#data.join("\n"),
      id: this.#lastEventId,
      retry: this.#retry,
    };

    this.#data = [];
    this.#eventType = "";
    return event;
  }
}

export async function* decodeSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  const sse = new SSEDecoder();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const text = decoder.decode(value, { stream: true });
      for (const event of sse.push(text)) {
        yield event;
      }
    }

    const tail = decoder.decode();
    if (tail.length > 0) {
      for (const event of sse.push(tail)) {
        yield event;
      }
    }

    for (const event of sse.flush()) {
      yield event;
    }
  } finally {
    reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
