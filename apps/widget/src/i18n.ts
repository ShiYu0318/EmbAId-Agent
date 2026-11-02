import type { Locale } from "./types";

export const DEFAULT_LOCALE: Locale = "zh-TW";

const zhTW = {
  launcherOpen: "開啟客服對話",
  launcherClose: "收合對話視窗",
  panelLabel: "客服對話視窗",
  logLabel: "對話紀錄",
  botNameDefault: "AI 助理",
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
  presenceOnline: "線上立即回覆",
  presenceThinking: "正在思考…",
  presenceTyping: "正在輸入…",
  received: "已讀",
  thoughtActive: "思考中…",
  thoughtDone: "已思考 {s} 秒",
  thoughtWarn: "已思考 {s} 秒，證據不足",
  stageUnderstand: "理解你的問題",
  stageCacheHit: "找到相似的已答問題",
  stageSearch: "搜尋知識庫",
  stageRerank: "比對 {n} 段候選內容",
  stageCompose: "整理 {n} 份來源，組織回答",
  stageAbstain: "證據不足，不想用猜的",
  stageAbstainDetail: "最高信心 {c}，低於門檻 {t}",
  stageWorking: "正在查詢資料",
  retry: "重試",
  sourceCount: "{n} 份來源",
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
  presenceOnline: "Online, usually replies instantly",
  presenceThinking: "Thinking…",
  presenceTyping: "Typing…",
  received: "Seen",
  thoughtActive: "Thinking…",
  thoughtDone: "Thought for {s}s",
  thoughtWarn: "Thought for {s}s, not enough evidence",
  stageUnderstand: "Understanding your question",
  stageCacheHit: "Found a similar answered question",
  stageSearch: "Searching the knowledge base",
  stageRerank: "Comparing {n} candidate passages",
  stageCompose: "Drafting from {n} sources",
  stageAbstain: "Not enough evidence to answer",
  stageAbstainDetail: "Best match {c}, below threshold {t}",
  stageWorking: "Looking that up",
  retry: "Retry",
  sourceCount: "{n} sources",
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

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
