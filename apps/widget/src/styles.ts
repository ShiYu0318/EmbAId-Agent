export const STYLES = `
:host {
  --paw-primary: #4493f8;
  --paw-surface: #ffffff;
  --paw-surface-alt: #f6f8fa;
  --paw-text: #1f2328;
  --paw-muted: #59636d;
  --paw-border: #dde2e7;
  --paw-radius: 14px;
  --paw-shadow: 0 2px 8px -3px rgba(31, 20, 26, 0.12), 0 18px 46px -24px rgba(31, 35, 40, 0.28);
  all: initial;
  font-family: "Geist", system-ui, -apple-system, "Noto Sans TC", "PingFang TC", sans-serif;
  line-height: 1.6;
}

:host([data-theme="dark"]) {
  --paw-surface: #0f1013;
  --paw-surface-alt: #15161a;
  --paw-text: #ededf0;
  --paw-muted: #9a9aa4;
  --paw-border: rgba(255, 255, 255, 0.12);
  --paw-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.5), 0 24px 60px -30px rgba(0, 0, 0, 0.85);
}

* { box-sizing: border-box; }

.root {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
}

.root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
.root[data-position="bottom-left"] { left: 20px; bottom: 20px; align-items: flex-start; }
.root[data-position="top-right"] { right: 20px; top: 20px; flex-direction: column-reverse; }
.root[data-position="top-left"] { left: 20px; top: 20px; align-items: flex-start; flex-direction: column-reverse; }

.launcher {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  border: none;
  background: var(--paw-primary);
  color: #fff;
  cursor: pointer;
  box-shadow: var(--paw-shadow);
  display: grid;
  place-items: center;
  pointer-events: auto;
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.launcher:hover { transform: translateY(-2px); }
.launcher:active { transform: scale(0.92); }
.launcher:focus-visible { outline: 2px solid var(--paw-primary); outline-offset: 3px; }
.launcher svg { transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }

.panel {
  width: min(384px, calc(100vw - 32px));
  height: min(600px, calc(100vh - 120px));
  background: var(--paw-surface);
  color: var(--paw-text);
  border: 1px solid var(--paw-border);
  border-radius: var(--paw-radius);
  box-shadow: var(--paw-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  opacity: 0;
  transform: translateY(14px) scale(0.96);
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s linear 240ms;
}

.root[data-position="bottom-left"] .panel,
.root[data-position="top-left"] .panel { transform-origin: bottom left; }

.panel[data-open="true"] {
  opacity: 1;
  transform: translateY(0) scale(1);
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 260ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 380ms cubic-bezier(0.22, 1.2, 0.36, 1),
    visibility 0s;
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--paw-border);
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--paw-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
}

.avatar img { width: 100%; height: 100%; object-fit: cover; }

.title { font-weight: 600; font-size: 14px; flex: 1; }

.icon-button {
  background: none;
  border: none;
  color: var(--paw-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  line-height: 0;
}

.icon-button:hover { background: var(--paw-surface-alt); color: var(--paw-text); }

.log {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 88%;
  transform-origin: bottom left;
  animation: paw-message-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.message[data-role="user"] {
  align-self: flex-end;
  align-items: flex-end;
  transform-origin: bottom right;
}

@keyframes paw-message-in {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.bubble {
  padding: 10px 13px;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  background: var(--paw-surface-alt);
  border: 1px solid var(--paw-border);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.message[data-role="user"] .bubble {
  background: var(--paw-primary);
  border-color: transparent;
  color: #fff;
  border-radius: 12px;
  border-bottom-right-radius: 4px;
}
.bubble p { margin: 0 0 8px; }
.bubble p:last-child { margin-bottom: 0; }
.bubble ul, .bubble ol { margin: 0 0 8px; padding-inline-start: 20px; }
.bubble code {
  font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace;
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
.citations-label {
  color: var(--paw-muted);
  font-weight: 600;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.citation { color: var(--paw-muted); }
.citation a { color: var(--paw-primary); text-decoration: none; }
.citation a:hover { text-decoration: underline; }

.feedback { display: flex; gap: 6px; }
.feedback button {
  background: none;
  border: 1px solid var(--paw-border);
  border-radius: 7px;
  padding: 4px 7px;
  cursor: pointer;
  color: var(--paw-muted);
  line-height: 0;
}
.feedback button:hover { color: var(--paw-text); border-color: var(--paw-muted); }
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
  border-radius: 8px;
  padding: 9px 11px;
  font: inherit;
  font-size: 14px;
  background: var(--paw-surface);
  color: var(--paw-text);
  max-height: 120px;
}

textarea:focus {
  outline: none;
  border-color: var(--paw-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--paw-primary) 24%, transparent);
}

.send {
  flex: none;
  align-self: flex-end;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: var(--paw-primary);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 140ms ease;
}

.send:hover { transform: scale(1.06); }
.send:active { transform: scale(0.9); }
.send:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

.branding {
  padding: 9px 14px 12px;
  text-align: center;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--paw-muted);
  background: var(--paw-surface);
}

.branding strong { color: var(--paw-text); font-weight: 600; }

.status {
  font-size: 12px;
  color: var(--paw-muted);
  padding: 0 16px 8px;
  font-family: "Geist Mono", ui-monospace, monospace;
}

@media (prefers-reduced-motion: reduce) {
  .launcher, .send, .launcher svg { transition: none; }
  .panel {
    transition: opacity 1ms linear, visibility 0s;
    transform: none;
  }
  .panel[data-open="true"] { transform: none; }
  .message { animation: none; }
}
`;
