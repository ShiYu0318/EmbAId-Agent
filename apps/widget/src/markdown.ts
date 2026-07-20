const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u0020\\u00a0\\u1680\\u2000-\\u200f\\u2028-\\u202f\\u205f-\\u2064\\u3000\\ufeff]", "g");

export function isSafeUrl(raw: string): boolean {
  const cleaned = raw.replace(CONTROL_CHARACTERS, "");
  if (cleaned.startsWith("/") || cleaned.startsWith("#")) return true;

  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (!match || !match[1]) return true;

  return ALLOWED_SCHEMES.has(match[1].toLowerCase());
}

interface InlineToken {
  type: "text" | "code" | "bold" | "italic" | "link";
  value: string;
  href?: string;
}

const INLINE_PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]*\]\([^)\s]*\))/;

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = INLINE_PATTERN.exec(rest);
    if (!match) {
      tokens.push({ type: "text", value: rest });
      break;
    }

    if (match.index > 0) {
      tokens.push({ type: "text", value: rest.slice(0, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith("`")) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("**")) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*") || raw.startsWith("_")) {
      tokens.push({ type: "italic", value: raw.slice(1, -1) });
    } else {
      const split = raw.indexOf("](");
      tokens.push({
        type: "link",
        value: raw.slice(1, split),
        href: raw.slice(split + 2, -1),
      });
    }

    rest = rest.slice(match.index + raw.length);
  }

  return tokens;
}

function renderInline(doc: Document, text: string): DocumentFragment {
  const fragment = doc.createDocumentFragment();

  for (const token of tokenizeInline(text)) {
    if (token.type === "text") {
      fragment.appendChild(doc.createTextNode(token.value));
      continue;
    }

    if (token.type === "link") {
      const href = token.href ?? "";
      if (!isSafeUrl(href)) {
        fragment.appendChild(doc.createTextNode(token.value));
        continue;
      }
      const anchor = doc.createElement("a");
      anchor.setAttribute("href", href);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      anchor.textContent = token.value;
      fragment.appendChild(anchor);
      continue;
    }

    const tag = token.type === "code" ? "code" : token.type === "bold" ? "strong" : "em";
    const element = doc.createElement(tag);
    element.textContent = token.value;
    fragment.appendChild(element);
  }

  return fragment;
}

export function renderMarkdown(markdown: string, doc: Document): DocumentFragment {
  const root = doc.createDocumentFragment();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;

      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      if (language) code.setAttribute("data-language", language);
      code.textContent = body.join("\n");
      pre.appendChild(code);
      root.appendChild(pre);
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const list = doc.createElement(ordered ? "ol" : "ul");

      while (index < lines.length) {
        const itemMatch = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(lines[index] ?? "");
        if (!itemMatch) break;
        const item = doc.createElement("li");
        item.appendChild(renderInline(doc, itemMatch[2] ?? ""));
        list.appendChild(item);
        index += 1;
      }

      root.appendChild(list);
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim() === "") break;
      if (/^\s*```/.test(current) || /^\s*([-*+]|\d+\.)\s+/.test(current)) break;
      paragraph.push(current);
      index += 1;
    }

    const element = doc.createElement("p");
    element.appendChild(renderInline(doc, paragraph.join(" ")));
    root.appendChild(element);
  }

  return root;
}
