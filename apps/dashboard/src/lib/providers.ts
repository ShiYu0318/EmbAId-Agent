import { useEffect, useState } from "react";

import { apiBaseUrl } from "@/lib/api/config";
import type { ChatProvider, EmbeddingProvider } from "@/lib/api/types";

interface ProviderOption<T> {
  id: T;
  /** Brand name; null means use the translated "other OpenAI-compatible service" label. */
  label: string | null;
  /** A model name to show as a placeholder. */
  example: string;
}

// Mirrors CHAT_PROVIDERS / EMBEDDING_PROVIDERS in apps/api/src/providers/registry.py.
export const CHAT_PROVIDER_OPTIONS: ProviderOption<ChatProvider>[] = [
  { id: "anthropic", label: "Anthropic", example: "claude-sonnet-5" },
  { id: "openai", label: "OpenAI", example: "gpt-5-mini" },
  { id: "ollama", label: "Ollama", example: "llama3" },
  { id: "openrouter", label: "OpenRouter", example: "anthropic/claude-sonnet-5" },
  { id: "groq", label: "Groq", example: "llama-3.3-70b-versatile" },
  { id: "gemini", label: "Google Gemini", example: "gemini-3.8-flash" },
  { id: "deepseek", label: "DeepSeek", example: "deepseek-flash" },
  { id: "openai_compatible", label: null, example: "my-model" },
];

export const EMBEDDING_PROVIDER_OPTIONS: ProviderOption<EmbeddingProvider>[] = [
  { id: "openai", label: "OpenAI", example: "text-embedding-3-small" },
  { id: "ollama", label: "Ollama", example: "nomic-embed-text" },
  { id: "gemini", label: "Google Gemini", example: "gemini-embedding-001" },
  { id: "openai_compatible", label: null, example: "my-embedding-model" },
];

export interface ApiHealth {
  search_backend?: string;
  /** Which providers have the keys and addresses they need. */
  providers?: Record<string, boolean>;
  /** Startup check of EMBEDDING_DIMENSIONS against the real embedding model. */
  embeddings?: {
    status: "pending" | "ok" | "mismatch" | "unavailable";
    configured_dimensions?: number;
    actual_dimensions?: number;
    model?: string;
  };
}

/** The API's public /health report, or null while loading or unreachable. */
export function useApiHealth(): ApiHealth | null {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl()}/health`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ApiHealth | null) => {
        if (active && body) setHealth(body);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return health;
}
