import { ApiClient, DEFAULT_CONFIG } from "./api";
import { createTranslator, format, resolveLocale, type MessageKey, type Translator } from "./i18n";
import { renderMarkdown } from "./markdown";
import { STYLES } from "./styles";
import type { Citation, DoneInfo, EmbedOptions, Transport, WidgetConfig } from "./types";

const CONVERSATION_STORAGE_KEY = "embaid-conversation-id";
// Each reported stage stays on screen at least this long, so fast pipelines still read as steps.
const MIN_STEP_MS = 320;
const TYPING_DELAY_MS = 250;

interface Stage {
  name: string;
  detail: Record<string, unknown>;
}

interface Turn {
  question: string;
  userRow: HTMLElement;
  startedAt: number;
  typing: HTMLElement | null;
  typingTimer: number;
  thought: HTMLDetailsElement | null;
  steps: HTMLElement | null;
  title: HTMLElement | null;
  lastStep: HTMLElement | null;
  abstained: boolean;
  queue: Stage[];
  stepping: boolean;
  container: HTMLElement | null;
  bubble: HTMLElement | null;
  received: string;
  shown: number;
  revealTimer: number;
  streamDone: boolean;
  finished: boolean;
  citations: Citation[];
  messageId: string | null;
  done: DoneInfo | null;
  quickReplies: string[];
}

type IconKind = "chat" | "close" | "up" | "down" | "send";

export class ChatWidget {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly api: ApiClient;
  private readonly doc: Document;
  private readonly options: EmbedOptions;
  private readonly inline: boolean;
  private persist = true;

  private config: WidgetConfig = { ...DEFAULT_CONFIG };
  private t: Translator = createTranslator(DEFAULT_CONFIG.locale);
  private conversationId: string | null = null;
  private open = false;
  private busy = false;
  private reduceMotion = false;

  private root!: HTMLElement;
  private panel!: HTMLElement;
  private launcher!: HTMLButtonElement;
  private log!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private status!: HTMLElement;
  private presence!: HTMLElement;
  /** Tappable suggestions above the composer: starter questions, then follow-up choices. */
  private tray!: HTMLElement;

  constructor(options: EmbedOptions, doc: Document = document) {
    this.doc = doc;
    this.options = options;
    this.inline = options.mode === "inline";
    this.api = new ApiClient(options);
    this.host = doc.createElement("div");
    this.host.setAttribute("data-embaid-widget", "");
    if (this.inline) this.host.style.cssText = "display:block;height:100%;";
    this.shadow = this.host.attachShadow({ mode: "closed" });
  }

  get element(): HTMLElement {
    return this.host;
  }

  async mount(target: HTMLElement): Promise<void> {
    const base = this.options.fetchConfig === false ? { ...DEFAULT_CONFIG } : await this.api.loadConfig();
    this.config = { ...base, ...this.options.config };
    this.persist = this.options.persist ?? !this.inline;
    this.conversationId = this.persist ? this.readStoredConversation() : null;
    this.reduceMotion = Boolean(
      this.doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    );
    this.render();
    target.appendChild(this.host);
  }

  /** Apply new settings in place (the conversation starts over). */
  update(config: Partial<WidgetConfig>): void {
    this.config = { ...this.config, ...config };
    this.render();
  }

  /** Clear the conversation and show the greeting again. */
  reset(): void {
    this.conversationId = null;
    if (this.persist) {
      try {
        this.doc.defaultView?.sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
      } catch {
        // storage unavailable: nothing to clear
      }
    }
    this.render();
  }

  destroy(): void {
    this.generation += 1;
    this.host.remove();
  }

  /** Send a question as if the visitor asked it; `typed` plays it into the input first. */
  async ask(question: string, { typed = false }: { typed?: boolean } = {}): Promise<void> {
    if (this.busy) return;
    if (typed && !this.reduceMotion) {
      const generation = this.generation;
      this.input.value = "";
      for (const ch of question) {
        if (generation !== this.generation) return;
        this.input.value += ch;
        this.syncComposer();
        await new Promise<void>((resolve) => this.later(resolve, 40 + Math.random() * 50));
      }
      await new Promise<void>((resolve) => this.later(resolve, 220));
      if (generation !== this.generation) return;
    }
    this.input.value = question;
    await this.submit();
  }

  get isBusy(): boolean {
    return this.busy;
  }

  // Bumped on every render so async work from an old layout stops touching the new one.
  private generation = 0;

  private render(): void {
    this.generation += 1;
    this.busy = false;
    this.t = createTranslator(resolveLocale(this.config.locale));
    this.shadow.replaceChildren();
    this.build();
    this.applyTheme();
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

  // ---------- layout ----------

  private build(): void {
    const style = this.doc.createElement("style");
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    this.root = this.el("div", "root");
    this.root.setAttribute("data-position", this.config.position);
    this.root.setAttribute("data-mode", this.inline ? "inline" : "floating");
    this.root.style.setProperty("--paw-primary", this.config.primaryColor);

    this.panel = this.el("div", "panel");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "false");
    this.panel.setAttribute("aria-label", this.t("panelLabel"));
    this.panel.setAttribute("data-open", String(this.inline || this.open));
    this.panel.addEventListener("keydown", (event) => {
      if (!this.inline && (event as KeyboardEvent).key === "Escape") {
        this.setOpen(false);
        this.launcher.focus();
      }
    });

    this.panel.appendChild(this.buildHeader());

    this.log = this.el("div", "log");
    this.log.setAttribute("role", "log");
    this.log.setAttribute("aria-live", "polite");
    this.log.setAttribute("aria-label", this.t("logLabel"));
    this.panel.appendChild(this.log);

    this.status = this.el("div", "status");
    this.status.setAttribute("aria-live", "polite");
    this.panel.appendChild(this.status);

    this.tray = this.el("div", "tray");
    this.panel.appendChild(this.tray);

    this.panel.appendChild(this.buildComposer());
    this.panel.appendChild(this.buildBranding());

    this.launcher = this.doc.createElement("button");
    this.launcher.className = "launcher";
    this.launcher.type = "button";
    this.launcher.setAttribute("aria-label", this.t("launcherOpen"));
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.append(this.icon("chat", 24, "icon-chat"), this.icon("close", 22, "icon-close"));
    this.launcher.addEventListener("click", () => this.setOpen(!this.open));

    this.root.appendChild(this.panel);
    if (!this.inline) this.root.appendChild(this.launcher);
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
      avatar.textContent = (this.config.botName || this.t("botNameDefault")).slice(0, 1);
    }
    avatar.appendChild(this.el("span", "dot"));

    const titleWrap = this.el("div", "title-wrap");
    const title = this.el("div", "title");
    title.textContent = this.config.botName || this.t("botNameDefault");
    this.presence = this.el("div", "presence");
    this.setPresence("presenceOnline");
    titleWrap.append(title, this.presence);

    const close = this.doc.createElement("button");
    close.className = "icon-button";
    close.type = "button";
    close.setAttribute("aria-label", this.t("close"));
    close.appendChild(this.icon("close", 18));
    close.addEventListener("click", () => this.setOpen(false));

    header.append(avatar, titleWrap);
    if (!this.inline) header.append(close);
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
      if (keyboard.key === "Enter" && !keyboard.shiftKey && !keyboard.isComposing) {
        keyboard.preventDefault();
        void this.submit();
      }
    });
    this.input.addEventListener("input", () => this.syncComposer());

    this.sendButton = this.doc.createElement("button");
    this.sendButton.className = "send";
    this.sendButton.type = "button";
    this.sendButton.setAttribute("aria-label", this.t("send"));
    this.sendButton.appendChild(this.icon("send", 17));
    this.sendButton.addEventListener("click", () => void this.submit());

    composer.append(this.input, this.sendButton);
    this.syncComposer();
    return composer;
  }

  private syncComposer(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
    this.sendButton.disabled = this.busy || this.input.value.trim() === "";
  }

  private buildBranding(): HTMLElement {
    const branding = this.el("div", "branding");
    branding.append(this.doc.createTextNode(`${this.t("poweredBy")} `));
    const brand = this.doc.createElement("strong");
    brand.textContent = "EmbAId";
    branding.appendChild(brand);
    return branding;
  }

  private renderGreeting(): void {
    const greeting = this.config.greeting || this.t("greetingDefault");
    const row = this.messageRow("assistant");
    const bubble = this.el("div", "bubble");
    bubble.appendChild(renderMarkdown(greeting, this.doc));
    row.appendChild(bubble);
    this.log.appendChild(row);

    this.showSuggestions(this.config.starterQuestions, "startersLabel");
  }

  private showSuggestions(items: string[], label: MessageKey): void {
    this.tray.replaceChildren();
    this.tray.removeAttribute("aria-label");
    if (items.length === 0) return;
    this.tray.setAttribute("aria-label", this.t(label));
    items.forEach((text, index) => {
      const chip = this.doc.createElement("button");
      chip.className = "starter";
      chip.type = "button";
      chip.style.setProperty("--i", String(index));
      chip.textContent = text;
      chip.addEventListener("click", () => {
        if (this.busy) return;
        this.input.value = text;
        void this.submit();
      });
      this.tray.appendChild(chip);
    });
  }

  private setOpen(open: boolean): void {
    if (this.inline) return;
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

  private setPresence(key: MessageKey): void {
    this.presence.textContent = this.t(key);
    this.presence.setAttribute("data-busy", String(key !== "presenceOnline"));
  }

  // ---------- primitives ----------

  private el(tag: string, className: string): HTMLElement {
    const element = this.doc.createElement(tag);
    element.className = className;
    return element;
  }

  private messageRow(role: "user" | "assistant"): HTMLElement {
    const row = this.el("div", "message");
    row.setAttribute("data-role", role);
    return row;
  }

  private icon(kind: IconKind, size = 22, className = ""): SVGElement {
    const svg = this.doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", kind === "up" || kind === "down" ? "1.7" : "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);

    const paths: Record<IconKind, string> = {
      chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
      close: "M6 6l12 12M18 6 6 18",
      up: "M7 10v12 M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
      down: "M17 14V2 M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3 3.88Z",
      send: "M12 19V5 M5 12l7-7 7 7",
    };
    const path = this.doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths[kind]);
    svg.appendChild(path);
    return svg;
  }

  private scroll(): void {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private later(fn: () => void, ms: number): number {
    return this.doc.defaultView?.setTimeout(fn, ms) ?? 0;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.status.textContent = busy ? this.t("thinking") : "";
    this.syncComposer();
  }

  // ---------- thinking ----------

  private quote(text: string): string {
    return resolveLocale(this.config.locale) === "zh-TW" ? `「${text}」` : `“${text}”`;
  }

  private stageText(stage: Stage): { label: string; note: string; warn: boolean } {
    const d = stage.detail;
    // A host (e.g. a scripted demo) may word a step itself.
    if (typeof d.label === "string" && d.label) {
      return { label: d.label, note: typeof d.note === "string" ? d.note : "", warn: Boolean(d.warn) };
    }
    const n = (key: string): number => Number(d[key] ?? 0);
    switch (stage.name) {
      case "understand":
        return { label: this.t("stageUnderstand"), note: "", warn: false };
      case "cache_hit":
        return {
          label: this.t("stageCacheHit"),
          note: format(this.t(n("sources") === 1 ? "sourceCountOne" : "sourceCount"), { n: n("sources") }),
          warn: false,
        };
      case "search":
        return {
          label: this.t("stageSearch"),
          note: typeof d.query === "string" && d.query ? this.quote(d.query) : "",
          warn: false,
        };
      case "rerank":
        return { label: format(this.t(n("candidates") === 1 ? "stageRerankOne" : "stageRerank"), { n: n("candidates") }), note: "", warn: false };
      case "compose":
        return { label: format(this.t(n("sources") === 1 ? "stageComposeOne" : "stageCompose"), { n: n("sources") }), note: "", warn: false };
      case "abstain":
        return {
          label: this.t("stageAbstain"),
          note: format(this.t("stageAbstainDetail"), {
            c: n("confidence").toFixed(2),
            t: n("threshold").toFixed(2),
          }),
          warn: true,
        };
      default:
        return { label: this.t("stageWorking"), note: "", warn: false };
    }
  }

  private ensureThought(turn: Turn): void {
    if (turn.thought) return;
    this.clearTyping(turn);

    const details = this.doc.createElement("details");
    details.className = "thought";
    details.open = true;
    details.setAttribute("data-state", "active");

    const summary = this.doc.createElement("summary");
    summary.append(this.el("span", "orb"));
    const title = this.el("span", "thought-title");
    title.textContent = this.t("thoughtActive");
    summary.append(title, this.el("span", "chev"));

    const steps = this.el("ol", "steps");
    details.append(summary, steps);
    this.log.appendChild(details);

    turn.thought = details;
    turn.steps = steps;
    turn.title = title;
    this.setPresence("presenceThinking");
    this.scroll();
  }

  private pushStage(turn: Turn, stage: Stage): void {
    turn.queue.push(stage);
    if (!turn.stepping) void this.drainStages(turn);
  }

  private async drainStages(turn: Turn): Promise<void> {
    turn.stepping = true;
    while (turn.queue.length > 0) {
      const stage = turn.queue.shift() as Stage;
      this.ensureThought(turn);
      if (turn.lastStep) turn.lastStep.setAttribute("data-state", "done");

      const { label, note, warn } = this.stageText(stage);
      const step = this.el("li", "step");
      step.setAttribute("data-state", "active");
      step.appendChild(this.el("span", "tick"));
      const body = this.doc.createElement("div");
      body.textContent = label;
      if (note) {
        const small = this.doc.createElement("small");
        small.textContent = note;
        body.appendChild(small);
      }
      step.appendChild(body);
      turn.steps?.appendChild(step);
      turn.lastStep = step;
      if (warn) turn.abstained = true;
      this.scroll();

      if (!this.reduceMotion) {
        await new Promise<void>((resolve) => this.later(resolve, MIN_STEP_MS));
      }
    }
    turn.stepping = false;
    this.reveal(turn);
  }

  private settleThought(turn: Turn): void {
    if (!turn.thought || turn.thought.getAttribute("data-state") !== "active") return;
    const seconds = ((performance.now() - turn.startedAt) / 1000).toFixed(1);
    turn.lastStep?.setAttribute("data-state", turn.abstained ? "warn" : "done");
    turn.thought.setAttribute("data-state", turn.abstained ? "warn" : "done");
    if (turn.title) {
      turn.title.textContent = format(this.t(turn.abstained ? "thoughtWarn" : "thoughtDone"), {
        s: seconds,
        n: turn.steps?.children.length ?? 0,
      });
    }
    turn.thought.open = false;
  }

  private clearTyping(turn: Turn): void {
    this.doc.defaultView?.clearTimeout(turn.typingTimer);
    turn.typing?.remove();
    turn.typing = null;
  }

  // ---------- answer reveal ----------

  private ensureAnswer(turn: Turn): void {
    if (turn.container) return;
    this.clearTyping(turn);
    this.settleThought(turn);
    const row = this.messageRow("assistant");
    const bubble = this.el("div", "bubble");
    row.appendChild(bubble);
    this.log.appendChild(row);
    turn.container = row;
    turn.bubble = bubble;
    this.setPresence("presenceTyping");
  }

  private paint(turn: Turn, withCaret: boolean): void {
    if (!turn.bubble) return;
    const fragment = renderMarkdown(turn.received.slice(0, turn.shown), this.doc);
    turn.bubble.replaceChildren(fragment);
    if (withCaret) {
      const caret = this.el("span", "caret");
      const last = turn.bubble.lastElementChild ?? turn.bubble;
      last.appendChild(caret);
    }
    this.scroll();
  }

  private reveal(turn: Turn): void {
    if (turn.stepping || turn.revealTimer || turn.finished) return;
    if (turn.received.length === 0) {
      if (turn.streamDone) this.finish(turn);
      return;
    }
    this.ensureAnswer(turn);

    if (this.reduceMotion) {
      turn.shown = turn.received.length;
      this.paint(turn, !turn.streamDone);
      if (turn.streamDone) this.finish(turn);
      return;
    }

    const tick = (): void => {
      turn.revealTimer = 0;
      const backlog = turn.received.length - turn.shown;
      if (backlog <= 0) {
        if (turn.streamDone) this.finish(turn);
        return;
      }
      const step = backlog > 200 ? Math.ceil(backlog / 8) : backlog > 60 ? 4 : backlog > 20 ? 2 : 1;
      turn.shown += step;
      this.paint(turn, true);
      const last = turn.received[turn.shown - 1] ?? "";
      const pause = /[，。、！？：；,.!?:;\n]/.test(last) && backlog < 80;
      turn.revealTimer = this.later(tick, pause ? 110 + Math.random() * 90 : 18 + Math.random() * 16);
    };
    tick();
  }

  private finish(turn: Turn): void {
    if (turn.finished) return;
    turn.finished = true;
    this.clearTyping(turn);
    this.settleThought(turn);
    if (turn.container && turn.bubble) {
      this.paint(turn, false);
      this.renderCitations(turn.container, turn.citations);
      if (turn.done) this.renderConfidence(turn.container, turn.done);
      if (turn.messageId) this.renderFeedback(turn.container, turn.messageId);
    }
    if (turn.quickReplies.length > 0) this.showSuggestions(turn.quickReplies, "quickRepliesLabel");
    this.setPresence("presenceOnline");
    this.setBusy(false);
    this.scroll();
  }

  private fail(turn: Turn): void {
    turn.finished = true;
    this.doc.defaultView?.clearTimeout(turn.revealTimer);
    this.clearTyping(turn);
    this.settleThought(turn);
    const row = turn.container ?? this.messageRow("assistant");
    const bubble = turn.bubble ?? this.el("div", "bubble");
    bubble.textContent = this.t("errorNetwork");
    if (!turn.container) {
      row.appendChild(bubble);
      this.log.appendChild(row);
    }
    const retry = this.doc.createElement("button");
    retry.className = "retry";
    retry.type = "button";
    retry.textContent = this.t("retry");
    retry.addEventListener("click", () => {
      row.remove();
      turn.thought?.remove();
      turn.userRow.remove();
      this.input.value = turn.question;
      void this.submit();
    });
    row.appendChild(retry);
    this.setPresence("presenceOnline");
    this.setBusy(false);
    this.scroll();
  }

  private renderCitations(target: HTMLElement, citations: Citation[]): void {
    if (citations.length === 0) return;

    const block = this.el("div", "citations");
    block.setAttribute("aria-label", this.t("citationsLabel"));

    citations.forEach((citation, index) => {
      const chip = citation.url ? this.doc.createElement("a") : this.doc.createElement("span");
      chip.className = "citation";
      chip.style.animationDelay = `${index * 60}ms`;
      if (citation.url) {
        chip.setAttribute("href", citation.url);
        chip.setAttribute("target", "_blank");
        chip.setAttribute("rel", "noopener noreferrer");
      }
      chip.title = citation.snippet;
      const number = this.el("span", "n");
      number.textContent = String(index + 1);
      const label = this.doc.createElement("span");
      label.textContent = citation.title || citation.url || "";
      chip.append(number, label);
      block.appendChild(chip);
    });

    target.appendChild(block);
  }

  private renderConfidence(target: HTMLElement, done: DoneInfo): void {
    if (done.confidence !== null) {
      const row = this.el("div", "confidence");
      row.setAttribute("data-low", String(!done.answered));
      const label = this.el("span", "confidence-label");
      label.textContent = this.t("confidence");
      const bar = this.el("i", "confidence-bar");
      bar.style.setProperty("--w", `${Math.round(Math.max(0, Math.min(1, done.confidence)) * 100)}%`);
      const value = this.el("span", "confidence-value");
      value.textContent = done.confidence.toFixed(2);
      row.append(label, bar, value);
      target.appendChild(row);
    }
    if (done.flagged) {
      const note = this.el("div", "gap-note");
      note.textContent = this.t("gapLogged");
      target.appendChild(note);
    }
  }

  private renderFeedback(target: HTMLElement, messageId: string): void {
    const meta = this.el("div", "meta-row");
    const row = this.el("div", "feedback");

    for (const value of ["up", "down"] as const) {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.appendChild(this.icon(value, 15));
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

    meta.appendChild(row);
    target.appendChild(meta);
  }

  // ---------- send ----------

  async submit(): Promise<void> {
    const message = this.input.value.trim();
    if (!message || this.busy) return;

    this.input.value = "";
    this.showSuggestions([], "startersLabel");
    const generation = this.generation;

    const userRow = this.messageRow("user");
    const bubble = this.el("div", "bubble");
    bubble.textContent = message;
    userRow.appendChild(bubble);
    this.log.appendChild(userRow);
    this.setBusy(true);
    this.scroll();

    const turn: Turn = {
      question: message,
      userRow,
      startedAt: performance.now(),
      typing: null,
      typingTimer: 0,
      thought: null,
      steps: null,
      title: null,
      lastStep: null,
      abstained: false,
      queue: [],
      stepping: false,
      container: null,
      bubble: null,
      received: "",
      shown: 0,
      revealTimer: 0,
      streamDone: false,
      finished: false,
      citations: [],
      messageId: null,
      done: null,
      quickReplies: [],
    };

    turn.typingTimer = this.later(() => {
      if (turn.thought || turn.container || turn.finished) return;
      const typing = this.el("div", "typing");
      typing.setAttribute("aria-hidden", "true");
      typing.append(this.el("i", ""), this.el("i", ""), this.el("i", ""));
      this.log.appendChild(typing);
      turn.typing = typing;
      this.setPresence("presenceThinking");
      this.scroll();
    }, TYPING_DELAY_MS);

    const transport: Transport =
      this.options.transport ?? ((text, id, handlers) => this.api.stream(text, id, handlers));
    // Ignore a reply that finishes after the widget was re-rendered or reset.
    const live = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A): void => {
      if (generation === this.generation) fn(...args);
    };
    await transport(message, this.conversationId, {
      onConversation: live((conversationId, messageId) => {
        if (this.persist) this.storeConversation(conversationId);
        else this.conversationId = conversationId;
        turn.messageId = messageId;
        const receipt = this.el("div", "receipt");
        receipt.textContent = this.t("received");
        userRow.appendChild(receipt);
      }),
      onStatus: live((stage, detail) => {
        if (stage) this.pushStage(turn, { name: stage, detail });
      }),
      onToken: live((text) => {
        turn.received += text;
        this.reveal(turn);
      }),
      onCitations: live((citations) => {
        turn.citations = citations;
      }),
      onQuickReplies: live((items) => {
        turn.quickReplies = items;
      }),
      onDone: live((info) => {
        turn.done = info;
        turn.streamDone = true;
        this.reveal(turn);
      }),
      onError: live(() => this.fail(turn)),
    });

    if (generation !== this.generation) return;
    if (!turn.streamDone && !turn.finished) {
      turn.streamDone = true;
      this.reveal(turn);
    }
  }
}
