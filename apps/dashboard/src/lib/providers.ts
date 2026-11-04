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

/** Which providers the API has keys and addresses for, from its public /health endpoint. */
export function useProviderStatus(): Record<string, boolean> | null {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl()}/health`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { providers?: Record<string, boolean> } | null) => {
        if (active && body?.providers) setStatus(body.providers);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return status;
}
