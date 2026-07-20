import { ApiError, NetworkError, parseError } from "./errors";
import type { Citation, FeedbackValue, RetrievalTrace } from "./types";

export interface ChatStreamHandlers {
  onConversation?: (data: { conversation_id: string; message_id: string }) => void;
  onToken?: (text: string) => void;
  onCitations?: (items: Citation[]) => void;
  onTrace?: (trace: RetrievalTrace) => void;
  onDone?: (data: { answered: boolean }) => void;
}

export interface ChatStreamRequest {
  baseUrl: string;
  apiKey: string;
  message: string;
  conversationId?: string | null;
  locale?: string;
  signal?: AbortSignal;
}

interface SseEvent {
  event: string;
  data: string;
}

function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];

  for (const block of blocks) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join("\n") });
    }
  }

  return { events, rest };
}

export async function streamChat(request: ChatStreamRequest, handlers: ChatStreamHandlers): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${request.baseUrl.replace(/\/$/, "")}/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": request.apiKey,
      },
      body: JSON.stringify({
        message: request.message,
        conversation_id: request.conversationId ?? undefined,
        locale: request.locale,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    throw new NetworkError(error instanceof Error ? error.message : "chat request failed");
  }

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw parseError(response.status, body);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      for (const item of events) {
        dispatch(item, handlers);
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    throw error;
  }

  const tail = parseSseChunk(`${buffer}\n\n`);
  for (const item of tail.events) {
    dispatch(item, handlers);
  }
}

function dispatch(item: SseEvent, handlers: ChatStreamHandlers): void {
  let payload: unknown;
  try {
    payload = JSON.parse(item.data);
  } catch {
    return;
  }

  switch (item.event) {
    case "conversation":
      handlers.onConversation?.(payload as { conversation_id: string; message_id: string });
      break;
    case "token":
      handlers.onToken?.((payload as { text: string }).text);
      break;
    case "citations":
      handlers.onCitations?.((payload as { items: Citation[] }).items);
      break;
    case "trace":
      handlers.onTrace?.(payload as RetrievalTrace);
      break;
    case "done":
      handlers.onDone?.(payload as { answered: boolean });
      break;
    default:
      break;
  }
}

export async function submitFeedback(
  baseUrl: string,
  apiKey: string,
  messageId: string,
  value: FeedbackValue,
): Promise<void> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages/${messageId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw parseError(response.status, body);
  }
}

export { ApiError };
