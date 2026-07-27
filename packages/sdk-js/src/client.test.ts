import { describe, expect, it, vi } from "vitest";

import { EmbAId } from "./client";
import { EmbAIdNotFoundError, EmbAIdPermissionError, EmbAIdRateLimitError } from "./errors";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("EmbAId key detection", () => {
  it("detects key type from prefix", () => {
    expect(new EmbAId({ apiKey: "pub_abc", projectId: "proj_1" }).keyType).toBe("publishable");
    expect(new EmbAId({ apiKey: "sk_abc", projectId: "proj_1" }).keyType).toBe("secret");
    expect(new EmbAId({ apiKey: "sbx_abc", projectId: "proj_1" }).keyType).toBe("sandbox");
  });

  it("rejects an unrecognized key prefix", () => {
    expect(() => new EmbAId({ apiKey: "nope_abc", projectId: "proj_1" })).toThrow();
  });
});

describe("permission gating", () => {
  it("blocks management access with a publishable key", () => {
    const client = new EmbAId({ apiKey: "pub_abc", projectId: "proj_1" });
    expect(() => client.projects).toThrow(EmbAIdPermissionError);
    expect(() => client.webhooks).toThrow(EmbAIdPermissionError);
  });

  it("allows management access with a secret key", () => {
    const client = new EmbAId({ apiKey: "sk_abc", projectId: "proj_1" });
    expect(() => client.projects).not.toThrow();
  });
});

describe("chat.send", () => {
  it("assembles a full result from an SSE stream", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'event: conversation\ndata: {"conversation_id":"conv_1","message_id":"msg_1"}\n\n',
        'event: token\ndata: {"text":"hel"}\n\n',
        'event: token\ndata: {"text":"lo"}\n\n',
        'event: citations\ndata: {"items":[{"chunk_id":"c1","document_id":"d1","title":"T","url":null,"snippet":"s"}]}\n\n',
        'event: done\ndata: {"answered":true,"refusal_reason":null,"confidence_score":0.8}\n\n',
      ]),
    );
    const client = new EmbAId({ apiKey: "pub_abc", projectId: "proj_1", fetch: fetchMock });

    const result = await client.chat.send({ message: "hi" });

    expect(result.answer).toBe("hello");
    expect(result.conversationId).toBe("conv_1");
    expect(result.citations).toHaveLength(1);
    expect(result.confidenceScore).toBe(0.8);
  });
});

describe("retry behaviour", () => {
  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { detail: { message: "slow down" } }, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: "proj_1" }]));

    const client = new EmbAId({ apiKey: "sk_abc", projectId: "proj_1", fetch: fetchMock });
    const projects = await client.projects.list();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(projects).toHaveLength(1);
  });

  it("surfaces a rate limit error after exhausting retries", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(429, { detail: { message: "slow down" } }, { "retry-after": "0" }),
    );
    const client = new EmbAId({ apiKey: "sk_abc", projectId: "proj_1", fetch: fetchMock, maxRetries: 1 });

    await expect(client.projects.list()).rejects.toBeInstanceOf(EmbAIdRateLimitError);
  });

  it("maps 404 to the not-found error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, { detail: { message: "missing" } }));
    const client = new EmbAId({ apiKey: "sk_abc", projectId: "proj_1", fetch: fetchMock });

    await expect(client.projects.get("nope")).rejects.toBeInstanceOf(EmbAIdNotFoundError);
  });
});
