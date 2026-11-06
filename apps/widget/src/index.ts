import { ChatWidget } from "./widget";
import type { EmbedOptions } from "./types";

function scriptOrigin(script: Element): string {
  try {
    return new URL(script.getAttribute("src") ?? "", window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

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
    // Without data-api-url, talk to the server the script came from: a self-hosted API
    // serves /widget.js itself, so this never reaches a third party by default.
    apiUrl: (script.getAttribute("data-api-url") ?? scriptOrigin(script)).replace(/\/$/, ""),
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
