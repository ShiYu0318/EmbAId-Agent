import { SseParser } from "./sse";
import type { Citation, EmbedOptions, Feedback, WidgetConfig } from "./types";

export const DEFAULT_CONFIG: WidgetConfig = {
  primaryColor: "#4493f8",
  position: "bottom-right",
  greeting: "您好，有什麼可以協助您的嗎？",
  starterQuestions: [],
  botName: "AI 助理",
  botAvatarUrl: null,
  theme: "auto",
  locale: "zh-TW",
};

export interface StreamHandlers {
  onConversation?(conversationId: string, messageId: string): void;
  onToken?(text: string): void;
  onCitations?(citations: Citation[]): void;
  onDone?(answered: boolean): void;
  onError?(error: Error): void;
}

function normalizeConfig(raw: Record<string, unknown>): WidgetConfig {
  const config = { ...DEFAULT_CONFIG };
  if (typeof raw.primary_color === "string") config.primaryColor = raw.primary_color;
  if (typeof raw.position === "string") config.position = raw.position as WidgetConfig["position"];
  if (typeof raw.greeting === "string") config.greeting = raw.greeting;
  if (Array.isArray(raw.starter_questions)) {
    config.starterQuestions = raw.starter_questions.filter(
      (item): item is string => typeof item === "string",
    );
  }
  if (typeof raw.bot_name === "string") config.botName = raw.bot_name;
  if (typeof raw.bot_avatar_url === "string") config.botAvatarUrl = raw.bot_avatar_url;
  if (typeof raw.theme === "string") config.theme = raw.theme as WidgetConfig["theme"];
  if (typeof raw.locale === "string") config.locale = raw.locale as WidgetConfig["locale"];
  return config;
}

function parseCitations(payload: unknown): Citation[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [
      {
        chunkId: String(record.chunk_id ?? ""),
        documentId: String(record.document_id ?? ""),
        title: String(record.title ?? ""),
        url: typeof record.url === "string" ? record.url : null,
        snippet: String(record.snippet ?? ""),
      },
    ];
  });
}

export class ApiClient {
  constructor(private readonly options: EmbedOptions) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.options.apiKey,
    };
  }

  async loadConfig(): Promise<WidgetConfig> {
    try {
      const response = await fetch(`${this.options.apiUrl}/v1/widget-config`, {
        headers: this.headers(),
      });
      if (!response.ok) return { ...DEFAULT_CONFIG };
      return normalizeConfig((await response.json()) as Record<string, unknown>);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  async sendFeedback(messageId: string, value: Feedback): Promise<void> {
    await fetch(`${this.options.apiUrl}/v1/messages/${messageId}/feedback`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ value }),
    }).catch(() => undefined);
  }

  async stream(
    message: string,
    conversationId: string | null,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.options.apiUrl}/v1/chat`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ message, conversation_id: conversationId }),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      handlers.onError?.(error as Error);
      return;
    }

    if (!response.ok || !response.body) {
      handlers.onError?.(new Error(`request failed with status ${response.status}`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();

    const dispatch = (event: string, data: string): void => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }

      if (event === "conversation") {
        const record = payload as Record<string, string>;
        handlers.onConversation?.(record.conversation_id ?? "", record.message_id ?? "");
      } else if (event === "token") {
        handlers.onToken?.(String((payload as Record<string, unknown>).text ?? ""));
      } else if (event === "citations") {
        handlers.onCitations?.(parseCitations(payload));
      } else if (event === "done") {
        handlers.onDone?.(Boolean((payload as Record<string, unknown>).answered));
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          dispatch(frame.event, frame.data);
        }
      }
      for (const frame of parser.flush()) {
        dispatch(frame.event, frame.data);
      }
    } catch (error) {
      handlers.onError?.(error as Error);
    }
  }
}
