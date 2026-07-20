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

export interface EmbedOptions {
  apiKey: string;
  projectId: string;
  apiUrl: string;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  title: string;
  url: string | null;
  snippet: string;
}

export type Feedback = "up" | "down";
