export const STYLES = `
:host {
  --paw-primary: #0033ff;
  --paw-on-primary: #ffffff;
  --paw-surface: #ffffff;
  --paw-surface-alt: #f4f4f7;
  --paw-surface-raised: #ffffff;
  --paw-text: #1d1c22;
  --paw-muted: #63626d;
  --paw-faint: #8c8b96;
  --paw-border: rgba(29, 28, 34, 0.09);
  --paw-border-strong: rgba(29, 28, 34, 0.15);
  --paw-good: #12a26a;
  --paw-warn: #c58a12;
  --paw-radius: 20px;
  --paw-sheen: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --paw-shadow: 0 1px 2px rgba(20, 20, 40, 0.06), 0 24px 60px -24px rgba(20, 24, 60, 0.32);
  --paw-ease: cubic-bezier(0.23, 1, 0.32, 1);
  all: initial;
  font-family: "General Sans", system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

:host([data-theme="dark"]) {
  --paw-surface: #0d0c10;
  --paw-surface-alt: #141318;
  --paw-surface-raised: #18171d;
  --paw-text: #f4f4f6;
  --paw-muted: #a3a2ad;
  --paw-faint: #74737e;
  --paw-border: rgba(255, 255, 255, 0.075);
  --paw-border-strong: rgba(255, 255, 255, 0.13);
  --paw-good: #3ccf8e;
  --paw-warn: #f0b443;
  --paw-sheen: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --paw-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 30px 80px -30px rgba(0, 0, 0, 0.9);
}

* { box-sizing: border-box; }

.root {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
  pointer-events: none;
}
.root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
.root[data-position="bottom-left"] { left: 20px; bottom: 20px; align-items: flex-start; }
.root[data-position="top-right"] { right: 20px; top: 20px; flex-direction: column-reverse; }
.root[data-position="top-left"] { left: 20px; top: 20px; align-items: flex-start; flex-direction: column-reverse; }

/* ---------- launcher ---------- */

.launcher {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  border: none;
  background: var(--paw-primary);
  color: var(--paw-on-primary);
  cursor: pointer;
  display: grid;
  place-items: center;
  pointer-events: auto;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 12px 32px -10px color-mix(in srgb, var(--paw-primary) 75%, transparent);
  transition: transform 180ms var(--paw-ease), box-shadow 240ms ease;
}
.launcher:active { transform: scale(0.94); }
.launcher:focus-visible { outline: 2px solid var(--paw-primary); outline-offset: 3px; }
.launcher svg {
  position: absolute;
  transition: transform 300ms var(--paw-ease), opacity 200ms ease;
}
.launcher .icon-close { opacity: 0; transform: rotate(-90deg) scale(0.6); }
.launcher[aria-expanded="true"] .icon-chat { opacity: 0; transform: rotate(90deg) scale(0.6); }
.launcher[aria-expanded="true"] .icon-close { opacity: 1; transform: none; }
@media (hover: hover) and (pointer: fine) {
  .launcher:hover {
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 16px 40px -10px color-mix(in srgb, var(--paw-primary) 85%, transparent);
  }
}

/* ---------- panel ---------- */

.panel {
  width: min(400px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 120px));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 120px),
    var(--paw-surface);
  color: var(--paw-text);
  border: 1px solid var(--paw-border);
  border-radius: var(--paw-radius);
  box-shadow: var(--paw-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  opacity: 0;
  transform: translateY(12px) scale(0.96);
  filter: blur(4px);
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 160ms ease,
    transform 180ms var(--paw-ease),
    filter 180ms ease,
    visibility 0s linear 180ms;
}
.root[data-position="bottom-left"] .panel { transform-origin: bottom left; }
.root[data-position="top-right"] .panel { transform-origin: top right; }
.root[data-position="top-left"] .panel { transform-origin: top left; }
.panel[data-open="true"] {
  opacity: 1;
  transform: none;
  filter: none;
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 220ms ease,
    transform 320ms var(--paw-ease),
    filter 220ms ease,
    visibility 0s;
}

/* ---------- header ---------- */

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 14px 16px;
  border-bottom: 1px solid var(--paw-border);
}
.avatar {
  position: relative;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--paw-primary) 70%, #fff), var(--paw-primary) 60%, color-mix(in srgb, var(--paw-primary) 70%, #000));
  color: var(--paw-on-primary);
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.avatar .dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--paw-good);
  border: 2px solid var(--paw-surface);
}
.title-wrap { flex: 1; min-width: 0; }
.title {
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.presence {
  font-size: 12px;
  color: var(--paw-faint);
  transition: color 200ms ease;
}
.presence[data-busy="true"] { color: color-mix(in srgb, var(--paw-primary) 55%, var(--paw-text)); }

.icon-button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--paw-muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background-color 150ms ease, color 150ms ease;
}
.icon-button:focus-visible { outline: 2px solid var(--paw-primary); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .icon-button:hover { background: var(--paw-surface-alt); color: var(--paw-text); }
}

/* ---------- log ---------- */

.log {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--paw-border-strong) transparent;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 88%;
  animation: paw-in 360ms var(--paw-ease) both;
}
.message[data-role="user"] { align-self: flex-end; align-items: flex-end; transform-origin: bottom right; }
.message[data-role="assistant"] { align-self: flex-start; transform-origin: bottom left; }
@keyframes paw-in {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
}

.bubble {
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
}
.message[data-role="user"] .bubble {
  background: var(--paw-primary);
  color: var(--paw-on-primary);
  border-bottom-right-radius: 6px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  white-space: pre-wrap;
}
.message[data-role="assistant"] .bubble {
  background: var(--paw-surface-alt);
  border: 1px solid var(--paw-border);
  border-bottom-left-radius: 6px;
  box-shadow: var(--paw-sheen);
}
.bubble:empty { display: none; }
.bubble p { margin: 0 0 8px; }
.bubble p:last-child { margin-bottom: 0; }
.bubble ul, .bubble ol { margin: 4px 0 8px; padding-left: 20px; }
.bubble a { color: color-mix(in srgb, var(--paw-primary) 70%, var(--paw-text)); }
.bubble code {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 12.5px;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--paw-border);
}
.bubble pre {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--paw-surface);
  border: 1px solid var(--paw-border);
  overflow-x: auto;
}
.bubble pre code { padding: 0; background: none; }

.caret {
  display: inline-block;
  width: 6px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--paw-primary);
  animation: paw-caret 1s steps(2) infinite;
}
@keyframes paw-caret { 50% { opacity: 0; } }

.receipt {
  font-size: 11px;
  color: var(--paw-faint);
  animation: paw-fade 300ms ease both;
}
@keyframes paw-fade { from { opacity: 0; } }

/* typing dots (before the first status arrives) */
.typing {
  align-self: flex-start;
  display: inline-flex;
  gap: 4px;
  padding: 13px 15px;
  border-radius: 18px;
  border-bottom-left-radius: 6px;
  background: var(--paw-surface-alt);
  border: 1px solid var(--paw-border);
  animation: paw-in 300ms var(--paw-ease) both;
}
.typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--paw-faint);
  animation: paw-bounce 1.2s var(--paw-ease) infinite;
}
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes paw-bounce {
  0%, 60%, 100% { transform: none; opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* ---------- thinking ---------- */

.thought {
  align-self: flex-start;
  width: min(100%, 320px);
  border: 1px solid var(--paw-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--paw-surface-alt) 55%, transparent);
  font-size: 12.5px;
  color: var(--paw-muted);
  animation: paw-in 320ms var(--paw-ease) both;
  overflow: hidden;
  /* overflow: hidden drops the flex min-height to 0, so without this a long
     conversation squeezes the open steps out of view instead of scrolling */
  flex-shrink: 0;
}
.thought summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.thought summary::-webkit-details-marker { display: none; }
.thought summary:focus-visible { outline: 2px solid var(--paw-primary); outline-offset: -2px; border-radius: 14px; }
.thought .chev {
  margin-left: auto;
  width: 7px;
  height: 7px;
  border: solid var(--paw-faint);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) translateY(-2px);
  transition: transform 200ms var(--paw-ease);
}
.thought[open] .chev { transform: rotate(-135deg) translateY(-1px); }
.orb {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--paw-primary), color-mix(in srgb, var(--paw-primary) 40%, #fff), transparent 70%, var(--paw-primary));
  -webkit-mask: radial-gradient(circle, transparent 3.5px, #000 4px);
  mask: radial-gradient(circle, transparent 3.5px, #000 4px);
  animation: paw-spin 0.9s linear infinite;
}
.thought[data-state="done"] .orb {
  animation: none;
  background: var(--paw-good);
  -webkit-mask: none;
  mask: none;
  transform: scale(0.55);
}
.thought[data-state="warn"] .orb {
  animation: none;
  background: var(--paw-warn);
  -webkit-mask: none;
  mask: none;
  transform: scale(0.55);
}
@keyframes paw-spin { to { transform: rotate(360deg); } }
.thought[data-state="active"] .thought-title {
  background: linear-gradient(90deg, var(--paw-faint) 0%, var(--paw-text) 45%, var(--paw-faint) 90%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: paw-shimmer 1.6s linear infinite;
}
@keyframes paw-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.steps {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0 12px 10px;
  list-style: none;
}
.step {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 8px;
  padding: 3px 0;
  animation: paw-step 280ms var(--paw-ease) both;
}
@keyframes paw-step { from { opacity: 0; transform: translateY(-3px); } }
.step small {
  display: block;
  color: var(--paw-faint);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tick {
  position: relative;
  width: 13px;
  height: 13px;
  margin-top: 3px;
  border-radius: 50%;
  border: 1.5px solid var(--paw-border-strong);
}
.step[data-state="active"] .tick {
  border-color: var(--paw-primary);
  border-right-color: transparent;
  animation: paw-spin 0.8s linear infinite;
}
.step[data-state="done"] .tick { border-color: var(--paw-good); background: var(--paw-good); }
.step[data-state="done"] .tick::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 0.5px;
  width: 3px;
  height: 6px;
  border: solid var(--paw-surface);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
.step[data-state="warn"] .tick { border-color: var(--paw-warn); background: var(--paw-warn); }

/* ---------- citations & feedback ---------- */

.citations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.citation {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px 4px 6px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--paw-primary) 10%, transparent);
  color: color-mix(in srgb, var(--paw-primary) 65%, var(--paw-text));
  font-size: 12px;
  text-decoration: none;
  animation: paw-chip 320ms var(--paw-ease) both;
  transition: background-color 150ms ease;
}
.citation span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.citation .n {
  flex: none;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--paw-primary) 18%, transparent);
  font-size: 10.5px;
  font-weight: 600;
}
@media (hover: hover) and (pointer: fine) {
  a.citation:hover { background: color-mix(in srgb, var(--paw-primary) 18%, transparent); }
}
@keyframes paw-chip { from { opacity: 0; transform: scale(0.92); } }

.meta-row {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  animation: paw-fade 300ms ease 120ms both;
}
.feedback { display: flex; gap: 2px; }
.feedback button {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--paw-faint);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: color 150ms ease, background-color 150ms ease, transform 150ms var(--paw-ease);
}
.feedback button:active { transform: scale(0.9); }
.feedback button[aria-pressed="true"] { color: var(--paw-primary); background: color-mix(in srgb, var(--paw-primary) 12%, transparent); }
@media (hover: hover) and (pointer: fine) {
  .feedback button:hover { color: var(--paw-text); background: var(--paw-surface-alt); }
}

.retry {
  align-self: flex-start;
  margin-top: 2px;
  padding: 5px 12px;
  border-radius: 9px;
  border: 1px solid var(--paw-border-strong);
  background: transparent;
  color: var(--paw-text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

/* ---------- starters ---------- */

.starters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}
.starter {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--paw-primary) 35%, var(--paw-border));
  background: transparent;
  color: color-mix(in srgb, var(--paw-primary) 60%, var(--paw-text));
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  animation: paw-chip 320ms var(--paw-ease) both;
  animation-delay: calc(var(--i, 0) * 60ms + 120ms);
  transition: background-color 150ms ease, color 150ms ease, transform 150ms var(--paw-ease);
}
.starter:active { transform: scale(0.97); }
.starter:focus-visible { outline: 2px solid var(--paw-primary); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .starter:hover { background: var(--paw-primary); color: var(--paw-on-primary); border-color: var(--paw-primary); }
}

/* ---------- composer ---------- */

.status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--paw-border-strong);
  border-radius: 16px;
  background: var(--paw-surface-alt);
  transition: border-color 150ms ease, box-shadow 200ms ease;
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--paw-primary) 60%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--paw-primary) 14%, transparent);
}
.composer textarea {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  padding: 7px 0;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--paw-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
}
.composer textarea::placeholder { color: var(--paw-faint); }
.send {
  flex: none;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 11px;
  background: var(--paw-primary);
  color: var(--paw-on-primary);
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition: opacity 150ms ease, transform 150ms var(--paw-ease);
}
.send:active { transform: scale(0.92); }
.send:disabled { opacity: 0.35; cursor: default; transform: none; }
.send:focus-visible { outline: 2px solid var(--paw-primary); outline-offset: 2px; }

.branding {
  padding: 8px 0 10px;
  text-align: center;
  font-size: 11px;
  color: var(--paw-faint);
}
.branding strong { color: var(--paw-muted); font-weight: 600; }

@media (max-width: 480px) {
  .root[data-position] { right: 12px; left: auto; bottom: 12px; }
  .panel { width: calc(100vw - 24px); height: calc(100dvh - 96px); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
  }
  .panel, .panel[data-open="true"] { transform: none; filter: none; transition: opacity 150ms ease, visibility 0s; }
  .orb, .tick { animation: none !important; }
}
`;
