(() => {
  const params = new URLSearchParams(window.location.search);
  const apiUrl = params.get("api");
  const projectId = params.get("project");
  const publishableKey = params.get("key");
  const live = Boolean(apiUrl && projectId && publishableKey);

  const I18N = window.EMBAID_I18N ?? { lang: "zh-TW", t: (zh) => zh, onChange: () => {} };
  const T = I18N.t;
  const isEN = () => I18N.lang === "en";
  const nativeFetch = window.fetch.bind(window);
  const encoder = new TextEncoder();

  const liveConfig = () => ({
    primary_color: "#0033ff",
    greeting: T(
      "嗨，我已連上你的知識庫。問我任何關於你剛上傳文件的問題吧。",
      "Hi, I'm connected to your knowledge base. Ask me anything about the documents you just uploaded.",
    ),
    starter_questions: [],
    bot_name: params.get("bot") || T("知識助理", "Knowledge assistant"),
    theme: "dark",
    locale: isEN() ? "en" : "zh-TW",
  });

  const demoConfig = () => ({
    primary_color: "#0033ff",
    greeting: T(
      "嗨，我是 EmbAId Agent。試著問我檢索原理、如何嵌入，或資料安全。",
      "Hi, I'm EmbAId Agent. Ask me how retrieval works, how to embed me, or how your data is kept safe.",
    ),
    starter_questions: isEN()
      ? ["How does RAG avoid making things up?", "How do I embed the agent on my site?", "Is my data safe?"]
      : ["RAG 如何避免亂編答案？", "怎麼把助理嵌到我的網站？", "我的資料安全嗎？"],
    bot_name: "EmbAId Agent",
    theme: "dark",
    locale: isEN() ? "en" : "zh-TW",
  });

  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const demoAnswers = () => [
    {
      match: ["檢索", "亂", "幻覺", "hallucin", "準", "來源", "信心", "出處", "rag", "retriev", "make", "source", "accura"],
      text: T(
        "EmbAId Agent 用**混合檢索**（Dense 向量 + BM25）找出候選段落，以 RRF 融合後再由 Cross-encoder 重排序。當證據信心低於門檻時，不會生成錯誤的回覆，所以每個答案都查得到出處。",
        "EmbAId Agent finds passages with **hybrid retrieval** (dense vectors + BM25) and reranks them with a cross-encoder. When the evidence is too weak it won't make up an answer, so every answer cites a source.",
      ),
      cite: { title: T("檢索管線設計", "Retrieval pipeline"), snippet: "hybrid retrieval + cross-encoder rerank" },
    },
    {
      match: ["嵌", "embed", "安裝", "整合", "script", "api", "sdk", "網站", "接", "install", "site", "integrat"],
      text: T(
        "只要貼上一段 **script** 標籤，填入 publishable key 與 project id，右下角就會出現浮動泡泡，而且跑在 **Shadow DOM** 裡不會被你的 CSS 影響。需要更深整合時，可改用 REST API 或 TypeScript SDK。",
        "Paste one **script** tag with your publishable key and project id and a bubble appears in the bottom-right corner. It runs in a **Shadow DOM**, so your CSS can't affect it. For deeper integrations, use the REST API or the TypeScript SDK.",
      ),
      cite: { title: T("嵌入與整合指南", "Embedding guide"), snippet: "script embed / REST / SDK" },
    },
    {
      match: ["安全", "隱私", "資料", "privacy", "合規", "gdpr", "自架", "私有", "safe", "secur", "data", "self-host"],
      text: T(
        "資料以**專案為界**完整隔離，API Key 分為 publishable、secret、sandbox 三種權限層級。程式碼開源，可以自架；除了你選的模型供應商，資料不會離開你的伺服器，模型也可以換成本地的 Ollama。",
        "Data is fully isolated **per project**, and API keys come in three permission levels: publishable, secret and sandbox. The code is open source and self-hostable; apart from the model provider you choose, your data never leaves your server, and the model can be a local Ollama.",
      ),
      cite: { title: T("安全與多租戶", "Security and tenancy"), snippet: "project-scoped isolation, self-host" },
    },
  ];

  const demoFallback = () => ({
    text: T(
      "我是 EmbAId Agent 的示範。它把你的文件變成會查證、可客製化的 AI Agent：查詢改寫、混合檢索、Cross-encoder 重排序、低信心自動婉拒，還有可稽核的 Retrieval Trace。想看真實效果，請登入上傳文件後從儀表板試用。",
      "I'm a demo of EmbAId Agent. It turns your documents into a verifiable, customizable AI agent: query rewriting, hybrid retrieval, cross-encoder reranking, automatic refusal at low confidence, and an auditable retrieval trace. To see it on your own content, upload documents and try it from the dashboard.",
    ),
    cite: null,
  });

  const pickDemo = (message) => {
    const lower = message.toLowerCase();
    return (
      demoAnswers().find((a) => a.match.some((k) => lower.includes(k.toLowerCase()))) ??
      demoFallback()
    );
  };

  const chunk = (text, size) => {
    const out = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out;
  };

  const streamResponse = (frames) => {
    let index = 0;
    const stream = new ReadableStream({
      pull(controller) {
        return new Promise((resolve) => {
          if (index >= frames.length) {
            controller.close();
            resolve();
            return;
          }
          const next = frames[index++];
          window.setTimeout(() => {
            controller.enqueue(encoder.encode(next.data));
            resolve();
          }, next.delay);
        });
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  };

  const demoFrames = (message) => {
    const answer = pickDemo(message);
    const frames = [
      { delay: 160, data: frame("conversation", { conversation_id: "conv_demo", message_id: "msg_demo" }) },
      { delay: 120, data: frame("status", { stage: "understand" }) },
      { delay: 420, data: frame("status", { stage: "search", query: message }) },
      { delay: 520, data: frame("status", { stage: "rerank", candidates: answer.cite ? 18 : 6 }) },
    ];
    if (answer.cite) {
      frames.push({ delay: 480, data: frame("status", { stage: "compose", sources: 1 }) });
    }
    for (const piece of chunk(answer.text, 3)) {
      frames.push({ delay: 42, data: frame("token", { text: piece }) });
    }
    if (answer.cite) {
      frames.push({
        delay: 220,
        data: frame("citations", {
          items: [
            {
              chunk_id: "c_demo",
              document_id: "d_demo",
              title: answer.cite.title,
              url: "#demo",
              snippet: answer.cite.snippet,
            },
          ],
        }),
      });
    }
    frames.push({ delay: 120, data: frame("done", { answered: answer.cite !== null }) });
    return frames;
  };

  window.fetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");

    if (url.includes("/widget-config")) {
      return new Response(JSON.stringify(live ? liveConfig() : demoConfig()), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!live && url.endsWith("/v1/chat")) {
      let message = "";
      try {
        message = JSON.parse(init?.body ?? "{}").message ?? "";
      } catch {
        message = "";
      }
      return streamResponse(demoFrames(message));
    }

    if (!live && url.includes("/feedback")) {
      return new Response(null, { status: 204 });
    }

    return nativeFetch(input, init);
  };

  if (live) {
    const banner = document.createElement("div");
    banner.className = "live-banner";
    const bannerText = () =>
      T("已連上你的知識庫，這個 Agent 正在讀取你上傳的文件", "Connected to your knowledge base: this agent is reading the documents you uploaded");
    banner.textContent = bannerText();
    document.body.appendChild(banner);
    I18N.onChange(() => (banner.textContent = bannerText()));
    document.body.setAttribute("data-live", "true");
  }

  const loadWidget = () => {
    const widget = document.createElement("script");
    widget.src = "./widget.js";
    widget.setAttribute("data-key", live ? publishableKey : "pub_demo");
    widget.setAttribute("data-project", live ? projectId : "proj_demo");
    widget.setAttribute("data-api-url", live ? apiUrl : "https://demo.embaid.chat");
    document.body.appendChild(widget);
    return widget;
  };
  let widgetScript = loadWidget();

  // The widget reads its locale once, when it mounts. On a language switch mount a
  // fresh one and drop the old one only after the new one is in, so the bubble never blinks.
  I18N.onChange(() => {
    const old = [...document.querySelectorAll("[data-embaid-widget]")];
    const watcher = new MutationObserver(() => {
      const fresh = [...document.querySelectorAll("[data-embaid-widget]")].some((el) => !old.includes(el));
      if (!fresh) return;
      watcher.disconnect();
      old.forEach((el) => el.remove());
    });
    watcher.observe(document.body, { childList: true });
    widgetScript.remove();
    widgetScript = loadWidget();
  });
})();
