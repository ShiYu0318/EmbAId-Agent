export const STYLES = `
:host {
  --paw-primary: #2f6df6;
  --paw-surface: #ffffff;
  --paw-surface-alt: #f4f6fb;
  --paw-text: #12141a;
  --paw-muted: #5b6070;
  --paw-border: #dfe3ec;
  --paw-radius: 14px;
  --paw-shadow: 0 18px 48px rgba(18, 20, 26, 0.18);
  all: initial;
  font-family: system-ui, -apple-system, "Noto Sans TC", "PingFang TC", sans-serif;
  line-height: 1.6;
}

:host([data-theme="dark"]) {
  --paw-surface: #16181f;
  --paw-surface-alt: #1e212a;
  --paw-text: #eef0f5;
  --paw-muted: #a1a7b8;
  --paw-border: #2c303c;
  --paw-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; }

.root {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
.root[data-position="bottom-left"] { left: 20px; bottom: 20px; align-items: flex-start; }
.root[data-position="top-right"] { right: 20px; top: 20px; flex-direction: column-reverse; }
.root[data-position="top-left"] { left: 20px; top: 20px; align-items: flex-start; flex-direction: column-reverse; }

.launcher {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--paw-primary);
  color: #fff;
  cursor: pointer;
  box-shadow: var(--paw-shadow);
  display: grid;
  place-items: center;
  transition: transform 160ms ease;
}

.launcher:hover { transform: scale(1.05); }
.launcher:focus-visible { outline: 3px solid var(--paw-primary); outline-offset: 3px; }

.panel {
  width: min(384px, calc(100vw - 32px));
  height: min(600px, calc(100vh - 120px));
  background: var(--paw-surface);
  color: var(--paw-text);
  border: 1px solid var(--paw-border);
  border-radius: var(--paw-radius);
  box-shadow: var(--paw-shadow);
  display: none;
  flex-direction: column;
  overflow: hidden;
}

.panel[data-open="true"] { display: flex; }

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--paw-border);
  background: var(--paw-surface-alt);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--paw-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
}

.avatar img { width: 100%; height: 100%; object-fit: cover; }

.title { font-weight: 600; font-size: 15px; flex: 1; }

.icon-button {
  background: none;
  border: none;
  color: var(--paw-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  line-height: 0;
}

.icon-button:hover { background: var(--paw-border); }

.log {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message { display: flex; flex-direction: column; gap: 6px; max-width: 88%; }
.message[data-role="user"] { align-self: flex-end; align-items: flex-end; }

.bubble {
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--paw-surface-alt);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.message[data-role="user"] .bubble { background: var(--paw-primary); color: #fff; }
.bubble p { margin: 0 0 8px; }
.bubble p:last-child { margin-bottom: 0; }
.bubble ul, .bubble ol { margin: 0 0 8px; padding-inline-start: 20px; }
.bubble code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  background: rgba(127, 127, 127, 0.16);
  padding: 1px 4px;
  border-radius: 4px;
}
.bubble pre {
  margin: 0 0 8px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.14);
  overflow-x: auto;
}
.bubble pre code { background: none; padding: 0; }
.bubble a { color: inherit; text-decoration: underline; }

.citations { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.citations-label { color: var(--paw-muted); font-weight: 600; }
.citation { color: var(--paw-muted); }
.citation a { color: var(--paw-primary); text-decoration: none; }
.citation a:hover { text-decoration: underline; }

.feedback { display: flex; gap: 4px; }
.feedback button {
  background: none;
  border: 1px solid var(--paw-border);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--paw-muted);
}
.feedback button[aria-pressed="true"] {
  border-color: var(--paw-primary);
  color: var(--paw-primary);
}

.starters { display: flex; flex-wrap: wrap; gap: 6px; }
.starter {
  border: 1px solid var(--paw-border);
  background: var(--paw-surface);
  color: var(--paw-text);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.starter:hover { border-color: var(--paw-primary); color: var(--paw-primary); }

.composer {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--paw-border);
  background: var(--paw-surface);
}

textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--paw-border);
  border-radius: 10px;
  padding: 9px 11px;
  font: inherit;
  font-size: 14px;
  background: var(--paw-surface);
  color: var(--paw-text);
  max-height: 120px;
}

textarea:focus { outline: 2px solid var(--paw-primary); outline-offset: -1px; }

.send {
  border: none;
  border-radius: 10px;
  background: var(--paw-primary);
  color: #fff;
  padding: 0 16px;
  font-size: 14px;
  cursor: pointer;
}

.send:disabled { opacity: 0.5; cursor: not-allowed; }

.status { font-size: 12px; color: var(--paw-muted); padding: 0 16px 8px; }

@media (prefers-reduced-motion: reduce) {
  .launcher { transition: none; }
}
`;
