import type { Locale } from "./types";

export const DEFAULT_LOCALE: Locale = "zh-TW";

const zhTW = {
  launcherOpen: "開啟客服對話",
  launcherClose: "收合對話視窗",
  panelLabel: "客服對話視窗",
  logLabel: "對話紀錄",
  botNameDefault: "智能助理",
  greetingDefault: "嗨，有什麼可以幫你的嗎？",
  startersLabel: "你可以這樣問",
  inputLabel: "輸入你的問題",
  inputPlaceholder: "輸入訊息…",
  send: "送出",
  poweredBy: "Powered by",
  close: "關閉",
  thinking: "正在查詢資料…",
  citationsLabel: "參考資料",
  citationSnippet: "查看原文",
  feedbackUp: "這則回答有幫助",
  feedbackDown: "這則回答沒幫助",
  feedbackThanks: "感謝你的回饋",
  errorGeneric: "系統忙線中，請稍後再試。",
  errorNetwork: "連線發生問題，請確認網路後再試一次。",
  roleYou: "你",
} as const;

export type MessageKey = keyof typeof zhTW;

const en: Partial<Record<MessageKey, string>> = {
  launcherOpen: "Open chat",
  launcherClose: "Collapse chat",
  panelLabel: "Chat window",
  logLabel: "Conversation history",
  botNameDefault: "Assistant",
  greetingDefault: "Hi, how can I help you today?",
  startersLabel: "You could ask",
  inputLabel: "Type your question",
  inputPlaceholder: "Type a message…",
  send: "Send",
  close: "Close",
  thinking: "Looking that up…",
  citationsLabel: "Sources",
  citationSnippet: "View excerpt",
  feedbackUp: "This answer was helpful",
  feedbackDown: "This answer was not helpful",
  feedbackThanks: "Thanks for the feedback",
  errorGeneric: "Something went wrong. Please try again shortly.",
  errorNetwork: "Connection problem. Check your network and try again.",
  roleYou: "You",
};

const DICTIONARIES: Record<Locale, Partial<Record<MessageKey, string>>> = {
  "zh-TW": zhTW,
  en,
};

export function isSupportedLocale(value: string): value is Locale {
  return value in DICTIONARIES;
}

export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  if (isSupportedLocale(value)) return value;
  const base = value.split("-")[0]?.toLowerCase();
  if (base && isSupportedLocale(base)) return base;
  if (base === "zh") return "zh-TW";
  return DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: MessageKey): string {
  return DICTIONARIES[locale]?.[key] ?? zhTW[key];
}

export function createTranslator(locale: Locale): (key: MessageKey) => string {
  return (key) => translate(locale, key);
}

export type Translator = ReturnType<typeof createTranslator>;
