import { describe, expect, it } from "vitest";

import { SseParser } from "./sse";

describe("SseParser", () => {
  it("parses a complete frame", () => {
    const parser = new SseParser();
    const frames = parser.push("event: token\ndata: {\"text\":\"hi\"}\n\n");

    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe("token");
    expect(frames[0]!.data).toBe('{"text":"hi"}');
  });

  it("joins a frame split across chunks", () => {
    const parser = new SseParser();

    expect(parser.push("event: tok")).toHaveLength(0);
    expect(parser.push("en\ndata: {\"text\":")).toHaveLength(0);

    const frames = parser.push('"hi"}\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe('{"text":"hi"}');
  });

  it("splits a chunk containing several frames", () => {
    const parser = new SseParser();
    const frames = parser.push("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n");

    expect(frames.map((frame) => frame.event)).toEqual(["a", "b"]);
  });

  it("handles crlf line endings", () => {
    const parser = new SseParser();
    const frames = parser.push("event: token\r\ndata: hello\r\n\r\n");

    expect(frames[0]!.event).toBe("token");
    expect(frames[0]!.data).toBe("hello");
  });

  it("joins multi-line data fields with newlines", () => {
    const parser = new SseParser();
    const frames = parser.push("event: token\ndata: one\ndata: two\n\n");

    expect(frames[0]!.data).toBe("one\ntwo");
  });

  it("ignores comment and heartbeat lines", () => {
    const parser = new SseParser();
    const frames = parser.push(": keep-alive\n\nevent: token\ndata: hi\n\n");

    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe("token");
  });

  it("defaults the event name when omitted", () => {
    const parser = new SseParser();
    const frames = parser.push("data: bare\n\n");

    expect(frames[0]!.event).toBe("message");
  });

  it("emits a trailing frame on flush", () => {
    const parser = new SseParser();
    parser.push("event: done\ndata: {}\n");

    const frames = parser.flush();
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe("done");
  });

  it("delivers one character at a time", () => {
    const parser = new SseParser();
    const payload = "event: token\ndata: 你好\n\n";
    const frames = [...payload].flatMap((character) => parser.push(character));

    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe("你好");
  });
});
