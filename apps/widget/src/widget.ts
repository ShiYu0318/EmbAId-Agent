import { ApiClient, DEFAULT_CONFIG } from "./api";
import { createTranslator, resolveLocale, type Translator } from "./i18n";
import { renderMarkdown } from "./markdown";
import { STYLES } from "./styles";
import type { Citation, EmbedOptions, WidgetConfig } from "./types";

const CONVERSATION_STORAGE_KEY = "proprai-conversation-id";

interface PendingAnswer {
  bubble: HTMLElement;
  container: HTMLElement;
  text: string;
  messageId: string | null;
}

export class ChatWidget {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly api: ApiClient;
  private readonly doc: Document;

  private config: WidgetConfig = { ...DEFAULT_CONFIG };
  private t: Translator = createTranslator(DEFAULT_CONFIG.locale);
  private conversationId: string | null = null;
  private open = false;
  private busy = false;
  private pending: PendingAnswer | null = null;

  private root!: HTMLElement;
  private panel!: HTMLElement;
  private launcher!: HTMLButtonElement;
  private log!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private status!: HTMLElement;
  private startersRow: HTMLElement | null = null;

  constructor(options: EmbedOptions, doc: Document = document) {
    this.doc = doc;
    this.api = new ApiClient(options);
    this.host = doc.createElement("div");
    this.host.setAttribute("data-proprai-widget", "");
    this.shadow = this.host.attachShadow({ mode: "closed" });
  }

  get element(): HTMLElement {
    return this.host;
  }

  async mount(target: HTMLElement): Promise<void> {
    this.config = await this.api.loadConfig();
    this.t = createTranslator(resolveLocale(this.config.locale));
    this.conversationId = this.readStoredConversation();

    this.build();
    this.applyTheme();
    target.appendChild(this.host);
  }

  private readStoredConversation(): string | null {
    try {
      return this.doc.defaultView?.sessionStorage.getItem(CONVERSATION_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private storeConversation(id: string): void {
    this.conversationId = id;
    try {
      this.doc.defaultView?.sessionStorage.setItem(CONVERSATION_STORAGE_KEY, id);
    } catch {
      return;
    }
  }

  private build(): void {
    const style = this.doc.createElement("style");
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    this.root = this.el("div", "root");
    this.root.setAttribute("data-position", this.config.position);
    this.root.style.setProperty("--paw-primary", this.config.primaryColor);

    this.panel = this.el("div", "panel");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "false");
    this.panel.setAttribute("aria-label", this.t("panelLabel"));
    this.panel.setAttribute("data-open", "false");

    this.panel.appendChild(this.buildHeader());

    this.log = this.el("div", "log");
    this.log.setAttribute("role", "log");
    this.log.setAttribute("aria-live", "polite");
    this.log.setAttribute("aria-label", this.t("logLabel"));
    this.panel.appendChild(this.log);

    this.status = this.el("div", "status");
    this.panel.appendChild(this.status);

    this.panel.appendChild(this.buildComposer());

    this.launcher = this.doc.createElement("button");
    this.launcher.className = "launcher";
    this.launcher.type = "button";
    this.launcher.setAttribute("aria-label", this.t("launcherOpen"));
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.appendChild(this.icon("chat"));
    this.launcher.addEventListener("click", () => this.toggle());

    this.root.appendChild(this.panel);
    this.root.appendChild(this.launcher);
    this.shadow.appendChild(this.root);

    this.renderGreeting();
  }

  private buildHeader(): HTMLElement {
    const header = this.el("div", "header");

    const avatar = this.el("div", "avatar");
    if (this.config.botAvatarUrl) {
      const image = this.doc.createElement("img");
      image.setAttribute("src", this.config.botAvatarUrl);
      image.setAttribute("alt", "");
      avatar.appendChild(image);
    } else {
      avatar.textContent = this.config.botName.slice(0, 1);
    }

    const title = this.el("div", "title");
    title.textContent = this.config.botName || this.t("botNameDefault");

    const close = this.doc.createElement("button");
    close.className = "icon-button";
    close.type = "button";
    close.setAttribute("aria-label", this.t("close"));
    close.appendChild(this.icon("close"));
    close.addEventListener("click", () => this.setOpen(false));

    header.append(avatar, title, close);
    return header;
  }

  private buildComposer(): HTMLElement {
    const composer = this.el("div", "composer");

    this.input = this.doc.createElement("textarea");
    this.input.rows = 1;
    this.input.setAttribute("aria-label", this.t("inputLabel"));
    this.input.placeholder = this.t("inputPlaceholder");
    this.input.addEventListener("keydown", (event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === "Enter" && !keyboard.shiftKey) {
        keyboard.preventDefault();
        void this.submit();
      }
    });

    this.sendButton = this.doc.createElement("button");
    this.sendButton.className = "send";
    this.sendButton.type = "button";
    this.sendButton.textContent = this.t("send");
    this.sendButton.addEventListener("click", () => void this.submit());

    composer.append(this.input, this.sendButton);
    return composer;
  }

  private renderGreeting(): void {
    const greeting = this.config.greeting || this.t("greetingDefault");
    this.appendAssistant(greeting);

    if (this.config.starterQuestions.length === 0) return;

    const row = this.el("div", "starters");
    row.setAttribute("aria-label", this.t("startersLabel"));
    for (const question of this.config.starterQuestions) {
      const chip = this.doc.createElement("button");
      chip.className = "starter";
      chip.type = "button";
      chip.textContent = question;
      chip.addEventListener("click", () => {
        this.input.value = question;
        void this.submit();
      });
      row.appendChild(chip);
    }
    this.startersRow = row;
    this.log.appendChild(row);
  }

  private toggle(): void {
    this.setOpen(!this.open);
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.panel.setAttribute("data-open", String(open));
    this.launcher.setAttribute("aria-expanded", String(open));
    this.launcher.setAttribute("aria-label", this.t(open ? "launcherClose" : "launcherOpen"));
    if (open) this.input.focus();
  }

  private applyTheme(): void {
    const view = this.doc.defaultView;
    const prefersDark =
      this.config.theme === "dark" ||
      (this.config.theme === "auto" &&
        Boolean(view?.matchMedia?.("(prefers-color-scheme: dark)").matches));
    this.host.setAttribute("data-theme", prefersDark ? "dark" : "light");
  }

  private el(tag: string, className: string): HTMLElement {
    const element = this.doc.createElement(tag);
    element.className = className;
    return element;
  }

  private icon(kind: "chat" | "close"): SVGElement {
    const svg = this.doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("aria-hidden", "true");

    const path = this.doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      kind === "chat" ? "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" : "M6 6l12 12M18 6 6 18",
    );
    svg.appendChild(path);
    return svg;
  }

  private appendUser(text: string): void {
    const wrapper = this.el("div", "message");
    wrapper.setAttribute("data-role", "user");
    const bubble = this.el("div", "bubble");
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    this.log.appendChild(wrapper);
    this.scroll();
  }

  private appendAssistant(text: string): PendingAnswer {
    const wrapper = this.el("div", "message");
    wrapper.setAttribute("data-role", "assistant");
    const bubble = this.el("div", "bubble");
    bubble.appendChild(renderMarkdown(text, this.doc));
    wrapper.appendChild(bubble);
    this.log.appendChild(wrapper);
    this.scroll();
    return { bubble, container: wrapper, text, messageId: null };
  }

  private renderCitations(target: HTMLElement, citations: Citation[]): void {
    if (citations.length === 0) return;

    const block = this.el("div", "citations");
    const label = this.el("div", "citations-label");
    label.textContent = this.t("citationsLabel");
    block.appendChild(label);

    citations.forEach((citation, index) => {
      const row = this.el("div", "citation");
      const prefix = this.doc.createTextNode(`${index + 1}. `);
      row.appendChild(prefix);

      if (citation.url) {
        const anchor = this.doc.createElement("a");
        anchor.setAttribute("href", citation.url);
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
        anchor.textContent = citation.title || citation.url;
        anchor.title = citation.snippet;
        row.appendChild(anchor);
      } else {
        const span = this.doc.createElement("span");
        span.textContent = citation.title;
        span.title = citation.snippet;
        row.appendChild(span);
      }

      block.appendChild(row);
    });

    target.appendChild(block);
  }

  private renderFeedback(target: HTMLElement, messageId: string): void {
    const row = this.el("div", "feedback");

    for (const value of ["up", "down"] as const) {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.textContent = value === "up" ? "👍" : "👎";
      button.setAttribute("aria-label", this.t(value === "up" ? "feedbackUp" : "feedbackDown"));
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        for (const sibling of Array.from(row.children)) {
          sibling.setAttribute("aria-pressed", "false");
        }
        button.setAttribute("aria-pressed", "true");
        this.status.textContent = this.t("feedbackThanks");
        void this.api.sendFeedback(messageId, value);
      });
      row.appendChild(button);
    }

    target.appendChild(row);
  }

  private scroll(): void {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendButton.disabled = busy;
    this.status.textContent = busy ? this.t("thinking") : "";
  }

  async submit(): Promise<void> {
    const message = this.input.value.trim();
    if (!message || this.busy) return;

    this.input.value = "";
    this.startersRow?.remove();
    this.startersRow = null;

    this.appendUser(message);
    this.setBusy(true);

    const pending = this.appendAssistant("");
    this.pending = pending;

    await this.api.stream(message, this.conversationId, {
      onConversation: (conversationId, messageId) => {
        this.storeConversation(conversationId);
        pending.messageId = messageId;
      },
      onToken: (text) => {
        pending.text += text;
        pending.bubble.replaceChildren(renderMarkdown(pending.text, this.doc));
        this.scroll();
      },
      onCitations: (citations) => this.renderCitations(pending.container, citations),
      onDone: () => {
        if (pending.messageId) this.renderFeedback(pending.container, pending.messageId);
        this.setBusy(false);
        this.scroll();
      },
      onError: () => {
        pending.bubble.textContent = this.t("errorNetwork");
        this.setBusy(false);
      },
    });
  }
}
