export interface SseFrame {
  event: string;
  data: string;
  id: string | null;
}

const DEFAULT_EVENT = "message";

export class SseParser {
  private buffer = "";
  private event = "";
  private data: string[] = [];
  private lastId: string | null = null;

  push(chunk: string): SseFrame[] {
    this.buffer += chunk.replace(/\r\n?/g, "\n");
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";

    const frames: SseFrame[] = [];
    for (const line of parts) {
      const frame = this.consume(line);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  flush(): SseFrame[] {
    const frames: SseFrame[] = [];
    if (this.buffer.length > 0) {
      const frame = this.consume(this.buffer);
      this.buffer = "";
      if (frame) frames.push(frame);
    }
    const pending = this.dispatch();
    if (pending) frames.push(pending);
    return frames;
  }

  private consume(line: string): SseFrame | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "event":
        this.event = value;
        break;
      case "data":
        this.data.push(value);
        break;
      case "id":
        this.lastId = value;
        break;
      default:
        break;
    }
    return null;
  }

  private dispatch(): SseFrame | null {
    if (this.event === "" && this.data.length === 0) return null;
    const frame: SseFrame = {
      event: this.event || DEFAULT_EVENT,
      data: this.data.join("\n"),
      id: this.lastId,
    };
    this.event = "";
    this.data = [];
    return frame;
  }
}
