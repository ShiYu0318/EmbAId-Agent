import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api";

const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function streamOf(body: string): Response {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 40));
      controller.enqueue(bytes.slice(40));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

describe("ApiClient.stream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports thinking stages before tokens, in order", async () => {
    const body =
      frame("conversation", { conversation_id: "c1", message_id: "m1" }) +
      frame("status", { stage: "understand" }) +
      frame("status", { stage: "search", query: "退貨期限" }) +
      frame("status", { stage: "compose", sources: 2 }) +
      frame("token", { text: "21 天" }) +
      frame("done", { answered: true });
    vi.stubGlobal("fetch", vi.fn(async () => streamOf(body)));

    const seen: string[] = [];
    const client = new ApiClient({ apiKey: "pub_x", projectId: "p", apiUrl: "http://api" });
    await client.stream("退貨要幾天?", null, {
      onStatus: (stage, detail) => seen.push(`status:${stage}:${String(detail.query ?? detail.sources ?? "")}`),
      onToken: (text) => seen.push(`token:${text}`),
      onDone: (info) => seen.push(`done:${info.answered}`),
    });

    expect(seen).toEqual([
      "status:understand:",
      "status:search:退貨期限",
      "status:compose:2",
      "token:21 天",
      "done:true",
    ]);
  });

  it("passes follow-up choices, confidence and the gap flag through", async () => {
    const body =
      frame("token", { text: "請問你是哪一種？" }) +
      frame("quick_replies", { items: ["一般會員", "企業客戶"] }) +
      frame("done", { answered: true, confidence: 0.82, flagged: false });
    vi.stubGlobal("fetch", vi.fn(async () => streamOf(body)));

    let choices: string[] = [];
    let done: unknown = null;
    const client = new ApiClient({ apiKey: "pub_x", projectId: "p", apiUrl: "http://api" });
    await client.stream("可以延長保固嗎?", null, {
      onQuickReplies: (items) => (choices = items),
      onDone: (info) => (done = info),
    });

    expect(choices).toEqual(["一般會員", "企業客戶"]);
    expect(done).toEqual({ answered: true, confidence: 0.82, flagged: false });
  });

  it("treats a missing confidence as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamOf(frame("done", { answered: false }))));
    let done: unknown = null;
    const client = new ApiClient({ apiKey: "pub_x", projectId: "p", apiUrl: "http://api" });
    await client.stream("?", null, { onDone: (info) => (done = info) });
    expect(done).toEqual({ answered: false, confidence: null, flagged: false });
  });
});
