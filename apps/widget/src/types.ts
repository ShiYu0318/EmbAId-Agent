export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type ThemeMode = "light" | "dark" | "auto";

export type Locale = "zh-TW" | "en";

export interface WidgetConfig {
  primaryColor: string;
  position: Corner;
  greeting: string;
  starterQuestions: string[];
  botName: string;
  botAvatarUrl: string | null;
  theme: ThemeMode;
  locale: Locale;
}

export interface DoneInfo {
  answered: boolean;
  /** Best evidence score, 0–1, when the server reports it. */
  confidence: number | null;
  /** True when the question was logged as a knowledge gap. */
  flagged: boolean;
}

export interface StreamHandlers {
  onConversation?(conversationId: string, messageId: string): void;
  onStatus?(stage: string, detail: Record<string, unknown>): void;
  onToken?(text: string): void;
  onCitations?(citations: Citation[]): void;
  onQuickReplies?(items: string[]): void;
  onDone?(info: DoneInfo): void;
  onError?(error: Error): void;
}

/** Produces one reply. The default talks to /v1/chat; hosts can script it instead. */
export type Transport = (
  message: string,
  conversationId: string | null,
  handlers: StreamHandlers,
) => Promise<void>;

export interface EmbedOptions {
  apiKey: string;
  projectId: string;
  apiUrl: string;
  /** Settings layered over the server's widget config. */
  config?: Partial<WidgetConfig>;
  /** Fetch /v1/widget-config before mounting (default true). */
  fetchConfig?: boolean;
  /** "floating" (default): launcher plus popover. "inline": fills its container, always open. */
  mode?: "floating" | "inline";
  /** Replace the network call, e.g. for scripted demos and previews. */
  transport?: Transport;
  /** Keep the conversation id in sessionStorage (default true for floating). */
  persist?: boolean;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  title: string;
  url: string | null;
  snippet: string;
}

export type Feedback = "up" | "down";
