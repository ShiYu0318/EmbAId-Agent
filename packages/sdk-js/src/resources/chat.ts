import { decodeSSEStream } from "../sse";
import { EmbAIdStreamError } from "../errors";
import type { HttpClient } from "../http";
import type {
  ChatOptions,
  ChatResult,
  ChatStreamEvent,
  Citation,
  FeedbackResponse,
  FeedbackValue,
  RetrievalTrace,
} from "../types/chat";
import type { JsonObject } from "../types/common";

function toBody(options: ChatOptions): Record<string, unknown> {
  return {
    message: options.message,
    conversation_id: options.conversationId,
    visitor_id: options.visitorId,
    channel: options.channel,
    locale: options.locale,
    tags: options.tags,
    system_prompt: options.systemPrompt,
    include_trace: options.includeTrace,
  };
}

function parseEvent(name: string, data: string): ChatStreamEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return { type: "unknown", event: name, data };
  }
  const record = (payload ?? {}) as Record<string, unknown>;

  switch (name) {
    case "conversation":
      return {
        type: "conversation",
        conversationId: String(record.conversation_id ?? ""),
        messageId: String(record.message_id ?? ""),
      };
    case "token":
      return { type: "token", text: String(record.text ?? "") };
    case "citations":
      return { type: "citations", citations: (record.items as Citation[]) ?? [] };
    case "trace":
      return { type: "trace", trace: payload as RetrievalTrace };
    case "done":
      return {
        type: "done",
        refusalReason: (record.refusal_reason as string | null) ?? null,
        confidenceScore: (record.confidence_score as number | null) ?? null,
      };
    case "error":
      return {
        type: "error",
        code: String(record.code ?? "error"),
        message: String(record.message ?? "stream error"),
      };
    default:
      return { type: "unknown", event: name, data: payload as JsonObject };
  }
}

export class ChatResource {
  constructor(private readonly http: HttpClient) {}

  async *stream(options: ChatOptions): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const response = await this.http.raw({
      method: "POST",
      path: "/v1/chat",
      body: toBody(options),
      headers: { Accept: "text/event-stream", ...options.headers },
      signal: options.signal,
      maxRetries: options.maxRetries,
      timeout: options.timeout,
    });

    if (!response.body) {
      throw new EmbAIdStreamError("response has no body", { status: response.status });
    }

    for await (const event of decodeSSEStream(response.body)) {
      yield parseEvent(event.event, event.data);
    }
  }

  async send(options: ChatOptions): Promise<ChatResult> {
    let answer = "";
    const citations: Citation[] = [];
    let trace: RetrievalTrace | null = null;
    let conversationId = "";
    let messageId = "";
    let refusalReason: string | null = null;
    let confidenceScore: number | null = null;

    for await (const event of this.stream({ ...options, includeTrace: true })) {
      switch (event.type) {
        case "conversation":
          conversationId = event.conversationId;
          messageId = event.messageId;
          break;
        case "token":
          answer += event.text;
          break;
        case "citations":
          citations.push(...event.citations);
          break;
        case "trace":
          trace = event.trace;
          break;
        case "done":
          refusalReason = event.refusalReason;
          confidenceScore = event.confidenceScore;
          break;
        case "error":
          throw new EmbAIdStreamError(event.message, { status: 0 });
        default:
          break;
      }
    }

    return { answer, citations, trace, conversationId, messageId, refusalReason, confidenceScore };
  }

  feedback(
    messageId: string,
    value: FeedbackValue,
    options?: { signal?: AbortSignal },
  ): Promise<FeedbackResponse> {
    return this.http.post<FeedbackResponse>(
      `/v1/messages/${messageId}/feedback`,
      { value },
      options,
    );
  }

  trace(messageId: string, options?: { signal?: AbortSignal }): Promise<RetrievalTrace> {
    return this.http.get<RetrievalTrace>(`/v1/messages/${messageId}/trace`, undefined, options);
  }
}
