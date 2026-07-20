import { ChatWidget } from "./widget";
import type { EmbedOptions } from "./types";

const DEFAULT_API_URL = "https://api.proprai.chat";

function readOptions(): EmbedOptions | null {
  const script =
    document.currentScript ??
    document.querySelector<HTMLScriptElement>("script[data-key][data-project]");

  if (!script) return null;

  const apiKey = script.getAttribute("data-key");
  const projectId = script.getAttribute("data-project");
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    projectId,
    apiUrl: (script.getAttribute("data-api-url") ?? DEFAULT_API_URL).replace(/\/$/, ""),
  };
}

async function boot(): Promise<void> {
  const options = readOptions();
  if (!options) return;

  const widget = new ChatWidget(options, document);
  await widget.mount(document.body);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}

export { ChatWidget };
