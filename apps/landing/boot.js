(() => {
  const params = new URLSearchParams(window.location.search);
  const apiUrl = params.get("api");
  const projectId = params.get("project");
  const publishableKey = params.get("key");
  const live = Boolean(apiUrl && projectId && publishableKey);

  const nativeFetch = window.fetch.bind(window);
  const encoder = new TextEncoder();

  const liveConfig = {
    primary_color: "#7c3aed",
    greeting:
      "嗨,我已連上你的知識庫。問我任何關於你剛上傳文件的問題吧。",
    starter_questions: [],
    bot_name: params.get("bot") || "知識助理",
    theme: "dark",
    locale: "zh-TW",
  };

  const demoConfig = {
    primary_color: "#7c3aed",
    greeting: "嗨,我是 proprAI 智嵌的示範助理。試著問我檢索原理、如何嵌入,或資料安全。",
    starter_questions: [
      "RAG 如何避免亂編答案?",
      "怎麼把助理嵌到我的網站?",
      "我的資料安全嗎?",
    ],
    bot_name: "智嵌助理",
    theme: "dark",
    locale: "zh-TW",
  };

  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const demoAnswers = [
    {
      match: ["檢索", "亂", "幻覺", "hallucin", "準", "來源", "信心", "出處", "rag"],
      text: "proprAI 用**混合檢索**同時比對語意向量與關鍵字,再以 cross-encoder 重排序挑出最相關的段落。當證據信心低於門檻時,助理會直接說「文件裡沒有」而不硬掰——所以每個答案都查得到出處。",
      cite: { title: "檢索管線設計", snippet: "hybrid retrieval + cross-encoder rerank" },
    },
    {
      match: ["嵌", "embed", "安裝", "整合", "script", "api", "sdk", "網站", "接"],
      text: "只要貼上一段 **script** 標籤,填入 publishable key 與 project id,右下角就會出現浮動泡泡,而且跑在 **Shadow DOM** 裡不會被你的 CSS 影響。需要更深整合時,可改用 REST API 或 TypeScript SDK。",
      cite: { title: "嵌入與整合指南", snippet: "script embed / REST / SDK" },
    },
    {
      match: ["安全", "隱私", "資料", "privacy", "合規", "gdpr", "自架", "私有"],
      text: "資料以**專案為界**完整隔離,API Key 分為 publishable、secret、sandbox 三種權限層級。你可以用雲端託管,也可以用開放原始碼版本自架,敏感資料完全不出你的伺服器。",
      cite: { title: "安全與多租戶", snippet: "project-scoped isolation, self-host" },
    },
  ];

  const demoFallback = {
    text: "我是 proprAI 智嵌的示範助理。這個平台把你的文件變成會查證的問答助理:混合檢索、交叉重排序、對話式改寫、低信心自動婉拒,還有可稽核的檢索軌跡。想看真實效果,請登入上傳文件後從儀表板開啟試用連結。",
    cite: null,
  };

  const pickDemo = (message) => {
    const lower = message.toLowerCase();
    return (
      demoAnswers.find((a) => a.match.some((k) => lower.includes(k.toLowerCase()))) ??
      demoFallback
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
    ];
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
      return new Response(JSON.stringify(live ? liveConfig : demoConfig), {
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
    banner.innerHTML =
      '<span class="live-banner__dot"></span>已連上你的知識庫 · 這個助理正在讀取你上傳的文件';
    document.body.appendChild(banner);
    document.body.setAttribute("data-live", "true");
  }

  const widget = document.createElement("script");
  widget.src = "./widget.js";
  widget.setAttribute("data-key", live ? publishableKey : "pub_demo");
  widget.setAttribute("data-project", live ? projectId : "proj_demo");
  widget.setAttribute("data-api-url", live ? apiUrl : "https://demo.proprai.chat");
  document.body.appendChild(widget);
})();
