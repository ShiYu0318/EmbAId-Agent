(() => {
  const nativeFetch = window.fetch.bind(window);
  const encoder = new TextEncoder();

  const config = {
    primary_color: "#7c3aed",
    greeting:
      "嗨,我是 proprAI 智嵌的示範助理。試著問我檢索原理、如何嵌入,或資料安全。",
    starter_questions: [
      "RAG 如何避免亂編答案?",
      "怎麼把助理嵌到我的網站?",
      "我的資料安全嗎?",
    ],
    bot_name: "智嵌助理",
    theme: "dark",
    locale: "zh-TW",
  };

  const answers = [
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
    {
      match: ["定價", "價格", "多少", "費用", "免費", "pricing", "方案", "錢"],
      text: "有**免費體驗**方案可直接開始,含一個專案與每月 500 則訊息;成長方案每月 20,000 則訊息並開放完整 API。自架版本永久免費、原始碼開放。(此為展示頁,價格僅供參考)",
      cite: { title: "方案比較", snippet: "free / growth / enterprise" },
    },
  ];

  const fallback = {
    text: "我是 proprAI 智嵌的示範助理。這個平台把你的文件變成會查證的問答助理:混合檢索、交叉重排序、對話式改寫、低信心自動婉拒,還有可稽核的檢索軌跡。試著問我「RAG 如何避免亂編」、「怎麼嵌到網站」或「資料安全嗎」。",
    cite: null,
  };

  const pick = (message) => {
    const lower = message.toLowerCase();
    return (
      answers.find((a) => a.match.some((k) => lower.includes(k.toLowerCase()))) ?? fallback
    );
  };

  const chunk = (text, size) => {
    const out = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out;
  };

  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const buildFrames = (message) => {
    const answer = pick(message);
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
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  window.fetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");

    if (url.includes("/widget-config")) {
      return new Response(JSON.stringify(config), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/v1/chat")) {
      let message = "";
      try {
        message = JSON.parse(init?.body ?? "{}").message ?? "";
      } catch {
        message = "";
      }
      return streamResponse(buildFrames(message));
    }

    if (url.includes("/feedback")) {
      return new Response(null, { status: 204 });
    }

    return nativeFetch(input, init);
  };
})();
