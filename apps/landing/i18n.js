// Landing i18n. Traditional Chinese is the source language and lives in index.html;
// English is applied at load time from the dictionary below, keyed by the Chinese text.
// Runs as a classic script in <head> so boot.js and app.js can read the language.
(() => {
  const KEY = "embaid-lang";
  const isLang = (v) => v === "zh-TW" || v === "en";

  const pick = () => {
    const fromQuery = new URLSearchParams(location.search).get("lang");
    if (isLang(fromQuery)) return fromQuery;
    try {
      const stored = localStorage.getItem(KEY);
      if (isLang(stored)) return stored;
    } catch {
      void 0;
    }
    const browser = (navigator.languages?.[0] || navigator.language || "").toLowerCase();
    return browser.startsWith("zh") ? "zh-TW" : "en";
  };

  const lang = pick();
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    void 0;
  }
  document.documentElement.lang = lang;

  const EN = {
    // head & chrome
    "EmbAId Agent — 把會查證、可客製化的 AI Agent 嵌入任何網站": "EmbAId Agent — embed a verifiable, customizable AI agent in any website",
    "一段 script，把會查證、可完全客製化的 AI Agent 嵌入任何網站。以 RAG 混合檢索與重排序作答並附出處，證據不足時不會生成錯誤的回覆；資料與模型都留在你選的地方。":
      "One script tag embeds a verifiable, fully customizable AI agent in any website. It answers with RAG hybrid retrieval and reranking, cites its sources, and never makes up an answer when the evidence is thin. Your data and models stay where you choose.",
    "跳到主要內容": "Skip to content",
    "EmbAId Agent 首頁": "EmbAId Agent home",
    "主要導覽": "Main navigation",
    "切換深淺主題": "Toggle light and dark theme",
    "在 GitHub 查看原始碼": "View the source on GitHub",
    "開啟選單": "Open menu",
    "運作原理": "How it works",
    "思考過程": "Reasoning",
    "功能": "Features",
    "部署": "Deploy",
    "開發者": "Developers",
    "登入": "Sign in",
    "免費開始": "Get started",
    "從內容到回答的粒子動畫": "Particle animation from content to answer",
    "往下捲動": "Scroll down",

    // intro
    "從內容到回答": "From content to answer",
    "匯入來源": "Ingest",
    "建立索引": "Index",
    "檢索推理": "Retrieve & reason",
    "生成回答": "Answer",
    "開源、可自架的 Agentic RAG": "Open-source, self-hostable agentic RAG",
    "把會查證的": "Embed a verifiable,",
    "客製化 AI Agent": "customizable AI agent",
    "嵌入任何網站": "in any website",
    "只需一段 script，就能讓 EmbAId Agent 以你的網站、文件與知識庫回答訪客。每個回答都經過 RAG 檢索與重排序並附上出處，證據不足時不會生成錯誤的回覆。名稱、人格、外觀與模型都能客製，資料留在你選的地方。":
      "With a single script tag, EmbAId Agent answers your visitors from your website, documents and knowledge base. Every answer goes through RAG retrieval and reranking and cites its sources, and when the evidence is thin it does not make one up. Name, persona, look and model are all yours to set, and your data stays where you choose.",
    "複製嵌入程式碼": "Copy the embed snippet",
    "免費開始建立": "Start building free",

    // marquee
    "適用場景": "Use cases",
    "企業官網": "Company websites",
    "產品與 API 文件": "Product & API docs",
    "客服中心": "Help centers",
    "內部知識庫": "Internal wikis",
    "電商與會員服務": "E-commerce & membership",
    "部落格與個人網站": "Blogs & personal sites",
    "學校與公共服務": "Schools & public services",
    "政策與法遵文件": "Policy & compliance docs",

    // how it works
    "從一堆文件，到一個會查證的 Agent。": "From a pile of documents to an agent that checks its sources.",
    "一條完整的 RAG 管線：擷取、切塊、嵌入、混合檢索、重排序，再到有依據的生成。每一步都看得見、改得動。":
      "A complete RAG pipeline: ingest, chunk, embed, hybrid retrieval, rerank, then grounded generation. You can see and change every step.",
    "匯入你的內容": "Bring in your content",
    "在你核准的範圍內爬取網站與 Sitemap，或上傳 PDF、Word、Markdown，也能接 Notion 與 Google Docs。每份來源都看得到擷取狀態與抽出的文字（Ingestion）。":
      "Crawl your site and sitemap within the scope you approve, upload PDF, Word or Markdown, or connect Notion and Google Docs. Every source shows its ingestion status and the text that was extracted.",
    "切塊、嵌入、建索引": "Chunk, embed, index",
    "以遞迴切塊（Recursive Chunking，相鄰段落保留重疊）處理中英混排內容，產生 Dense Embedding 寫入向量索引（FAISS／pgvector），同時建立 BM25 全文索引。可開啟 Contextual Retrieval，為每段補上定位脈絡，引用時仍顯示原文。":
      "Recursive chunking with overlapping neighbours handles mixed Chinese and English text, writes dense embeddings to a vector index (FAISS or pgvector) and builds a BM25 full-text index alongside. Turn on contextual retrieval to give each chunk a locating sentence; citations still show the original passage.",
    "混合檢索、重排序、判斷": "Hybrid retrieval, rerank, decide",
    "Agent 先依對話脈絡改寫查詢（Query Rewriting），以向量與 BM25 進行混合檢索（Hybrid Search），用 Reciprocal Rank Fusion 融合後交給 Cross-encoder 重排序，再依來源可信度與時效加權。信心低於門檻時，不會生成錯誤的回覆。":
      "The agent rewrites the query against the conversation, runs hybrid search over vectors and BM25, fuses the results with Reciprocal Rank Fusion, reranks them with a cross-encoder and weights them by source trust and freshness. Below the confidence threshold, it does not make up an answer.",
    "有依據地回答，或記錄知識缺口": "Answer with evidence, or log a knowledge gap",
    "以檢索到的段落進行 Grounded Generation，SSE 逐字串流並附上引用；相似問題命中語意快取（Semantic Cache）直接回答。答不出的問題進入知識缺口佇列，草擬答案、核准後寫回知識庫。":
      "Grounded generation from the retrieved passages, streamed token by token over SSE with citations; near-duplicate questions are served from the semantic cache. Questions it cannot answer go to the knowledge-gap queue, where you draft, approve and write the answer back.",
    "網站，共 128 頁": "Website, 128 pages",
    "完成": "Done",
    "退換貨政策.pdf": "returns-policy.pdf",
    "上傳檔案，共 14 頁": "Upload, 14 pages",
    "產品手冊": "Product handbook",
    "Notion，共 36 頁": "Notion, 36 pages",
    "索引中": "Indexing",
    "網站地圖，等待中": "Sitemap, waiting",
    "排隊": "Queued",
    "Dense 向量": "Dense vectors",
    "BM25 全文": "BM25 full text",
    "遞迴切塊，段落重疊": "Recursive chunks with overlap",
    "「退貨要幾天內申請？」 →": "“How long do I have to return it?” →",
    "退貨申請期限 天數": "return request deadline days",
    "退換貨政策 §4": "Returns policy §4",
    "會員服務條款 §2": "Membership terms §2",
    "運費與門檻": "Shipping and thresholds",
    "2023 舊版政策": "2023 policy (old)",
    "過時": "Stale",
    "退貨要幾天內申請？": "How long do I have to return it?",
    "收到商品後": "You can request a return within",
    "21 天內": "21 days",
    "可申請退貨，請保留發票與完整包裝。": "of delivery. Keep the receipt and the original packaging.",
    "知識缺口：「可以退到信用卡嗎？」": "Knowledge gap: “Can I get the refund on my card?”",
    "草擬答案 →": "Draft an answer →",

    // reasoning demo
    "實際運作的 Agent 推理過程": "The agent's reasoning, live",
    "它會先推理、查證，": "It reasons and checks first,",
    "證據不足就不亂答。": "and won't guess without evidence.",
    "每一則回答前，Agent 都會讓訪客看見它正在做什麼：理解問題、改寫查詢、混合檢索、重排序、評估證據信心。":
      "Before every answer, the agent shows the visitor what it is doing: understanding the question, rewriting the query, hybrid retrieval, reranking and weighing the evidence.",
    "示範情境": "Demo scenarios",
    "找得到答案": "Answer found",
    "需要追問": "Needs a follow-up",
    "證據不足": "Not enough evidence",
    "右下角的浮動泡泡是真正嵌入的小工具，點開就能直接問。": "The bubble in the bottom-right corner is the real embedded agent. Open it and ask away.",
    "線上立即回覆": "Online, replies instantly",
    "輸入你的問題…": "Type your question…",

    // features
    "為「答得準」打造的每一個環節。": "Every part built to get the answer right.",
    "Retrieval、Reranking、Generation 和營運工具都能自己設定，也都能換掉。": "Retrieval, reranking, generation and the operations tools are all configurable, and all swappable.",
    "混合檢索與 Cross-encoder 重排序": "Hybrid retrieval and cross-encoder reranking",
    "Dense 向量與 BM25 關鍵字並行檢索，以 Reciprocal Rank Fusion（RRF）融合，再由 Cross-encoder 重新排序。專有名詞、型號與政策條號都找得到。":
      "Dense vectors and BM25 keywords are searched in parallel, fused with Reciprocal Rank Fusion (RRF) and reordered by a cross-encoder. Proper nouns, model numbers and clause numbers all turn up.",
    "可稽核的 Retrieval Trace": "An auditable retrieval trace",
    "每則回答都留下改寫後的查詢、向量與 BM25 命中、RRF 分數、重排序結果、信心與各階段耗時。":
      "Every answer records the rewritten query, vector and BM25 hits, RRF scores, the reranked order, the confidence and the time spent in each stage.",
    "官方政策": "Official policy",
    "舊公告": "Old notice",
    "可信度與時效加權": "Trust and freshness weighting",
    "段落帶可信度分數、文件帶驗證日期，過時或低可信的內容在檢索排序時自動降權，不會蓋過權威來源。":
      "Passages carry a trust score and documents a verification date, so stale or low-trust content is down-weighted and never drowns out the authoritative source.",
    "「可以分期付款嗎？」": "“Can I pay in instalments?”",
    "「海外可以寄嗎？」": "“Do you ship overseas?”",
    "「發票可以改抬頭嗎？」": "“Can I change the invoice name?”",
    "草擬答案 → 核准入庫": "Draft → approve → indexed",
    "知識缺口佇列": "Knowledge-gap queue",
    "答不出的問題自動彙整成待辦，草擬答案並核准後直接成為新知識。": "Questions it could not answer collect into a to-do list; draft and approve an answer and it becomes new knowledge.",
    "不打擾的嵌入式 Agent": "An embedded agent that stays out of the way",
    "跑在 Shadow DOM，零相依、不吃宿主樣式。外觀改完即時生效，不必重新部署。":
      "It runs in a Shadow DOM with zero dependencies and never picks up the host page's styles. Appearance changes go live without a redeploy.",
    "「親切、簡潔，使用繁體中文」": "“Friendly, concise, in Traditional Chinese”",
    "人格、外觀與模型全可客製": "Customize persona, look and model",
    "名稱、頭像、問候語、語氣、System Prompt、起始問題、主色，以及聊天與 Embedding 模型，每個專案各自設定並即時預覽。":
      "Name, avatar, greeting, tone, system prompt, starter questions, accent colour, and the chat and embedding models, set per project with a live preview.",
    "Webhook HMAC 簽章": "HMAC-signed webhooks",
    "分析、Webhook 與 SDK": "Analytics, webhooks and SDK",
    "問答量、回答率、信心分布與熱門問題一目了然；事件以簽章 Webhook 推送，或用型別完整的 SDK 接進你的產品。":
      "Question volume, answer rate, confidence distribution and top questions at a glance; events go out as signed webhooks, or plug the fully typed SDK into your product.",

    // deploy
    "部署流程": "Deployment",
    "從建立專案到上線，一條清楚的路。": "A clear path from new project to live.",
    "儀表板會帶著你把 Agent 一路部署上線，並在最後確認你的網站真的接上了。": "The dashboard walks you through deploying the agent and, at the end, confirms your site is really connected.",
    "建立專案": "Create a project",
    "選一個 Agent 人格範本起手：客服、技術文件、內部知識或自訂。": "Start from an agent persona template: support, technical docs, internal knowledge or your own.",
    "連接來源": "Connect sources",
    "設定網站爬取範圍與允許的網域、上傳補充文件，或連接 Notion 與 Google Docs。": "Set the crawl scope and allowed hosts, upload extra documents, or connect Notion and Google Docs.",
    "檢查索引品質": "Check the index",
    "逐份檢視抽出的文字與 Chunk，停用不該公開的內容，再用試答確認檢索命中與 Retrieval Trace。":
      "Review the extracted text and chunks of each document, disable anything that should not be public, and test answers to check the hits and the retrieval trace.",
    "調整人格與外觀": "Set persona and look",
    "名稱、語氣、主色、起始問題，右側即時預覽真實的聊天視窗。": "Name, tone, accent colour and starter questions, with a live preview of the real chat window.",
    "產生金鑰、設定允許網域": "Create a key and allowed sites",
    "發佈用金鑰只能在你列出的網域使用，並有速率限制保護。": "The publishable key only works on the sites you list, and it is rate limited.",
    "貼上 script，確認上線": "Paste the script, confirm it's live",
    "複製一段程式碼到網站，儀表板會偵測第一則來自你網域的對話，告訴你已經接通。": "Paste one snippet into your site; the dashboard spots the first conversation from your domain and tells you you're connected.",

    // hosting
    "你的資料，你的基礎設施": "Your data, your infrastructure",
    "想放哪裡，就放哪裡。": "Run it wherever you like.",
    "文件、向量與對話都存在你營運的儲存空間。除了你選的模型供應商，沒有資料會離開你的部署，而那個供應商也可以是本地的 Ollama。":
      "Documents, vectors and conversations live in storage you run. Nothing leaves your deployment except calls to the model provider you pick, and that provider can be a local Ollama.",
    "最小可行": "Minimal",
    "瀏覽器": "Browser",
    "完全本地": "Fully local",
    "SQLite + FAISS + 本機檔案，聊天與嵌入都走 Ollama。一個指令啟動，不需要 Docker。": "SQLite + FAISS + local files, with chat and embeddings on Ollama. One command to start, no Docker.",
    "彈性": "Flexible",
    "本地嵌入": "Local embeddings",
    "雲端模型": "Cloud model",
    "混合路由": "Hybrid routing",
    "嵌入留在本地、回答交給雲端模型，或反過來。每個專案可各自選擇聊天與嵌入模型。": "Keep embeddings local and answer with a cloud model, or the other way round. Each project picks its own chat and embedding models.",
    "服務化": "Service",
    "完整服務堆疊": "Full service stack",
    "PostgreSQL + pgvector、Redis 背景工作與 S3 / MinIO 物件儲存，換後端只要一個環境變數。": "PostgreSQL + pgvector, Redis background jobs and S3 / MinIO object storage. Switching backends is one environment variable.",
    "在 GitHub 取得原始碼並自架": "Get the source on GitHub and self-host",
    "MIT 授權，一個指令就能在本機跑起來": "MIT licensed, running locally with one command",

    // roadmap
    "研發中，尚未上線": "In research, not shipped yet",
    "下一步：會自主調用工具、": "Next: agentic RAG that uses tools",
    "多輪思考的 Agentic RAG。": "and reasons over several rounds.",
    "相關不等於正確。一段文字可能符合問題，卻描述了已廢止的政策、不同的產品版本，或不適用於這位訪客的條件。我們正在讓 Agent 自主規劃檢索、調用工具、進行多輪思考，並在證據衝突或過時時，決定要回答、補查證據，還是婉拒。":
      "Relevant is not the same as correct. A passage can match the question yet describe a retired policy, a different product version, or conditions that don't apply to this visitor. We are teaching the agent to plan its own retrieval, use tools and reason over several rounds, and, when evidence conflicts or is out of date, to decide whether to answer, look for more evidence, or decline.",
    "自主調用工具（Tool Use）": "Tool use",
    "Agent 依問題自主決定要追加搜尋、閱讀整份文件或主動反問；先從唯讀工具與轉介草稿開始，再開放會改變狀態的操作。":
      "The agent decides for itself whether to search again, read a whole document or ask a clarifying question; read-only tools and referral drafts come first, actions that change state come later.",
    "多輪思考與自主規劃": "Multi-round reasoning and planning",
    "拆解子問題、多輪檢索與自我檢查（Self-reflection）；輪數、成本與時間都有上限，每一步都留下可見的推理紀錄。":
      "Break the question into sub-questions, retrieve over several rounds and check its own draft (self-reflection); rounds, cost and time are capped, and every step leaves a visible record.",
    "DeltaRAG 時效與衝突判斷": "DeltaRAG: freshness and conflict decisions",
    "區分「版本不同」「適用對象不同」與「真正矛盾」，決定回答、再找證據或婉拒，不預設最新的就是對的。":
      "Tell apart different versions, different audiences and genuine contradictions, then answer, look for more evidence or decline, without assuming the newest source is right.",
    "知識同步與存取層級": "Knowledge sync and access levels",
    "排程同步、版本歷史與增量更新；匿名訪客只檢索公開內容。": "Scheduled sync, version history and incremental updates; anonymous visitors only retrieve public content.",
    "Agent 評估問題 + 證據": "Agent weighs question + evidence",
    "回答": "Answer",
    "再找證據": "Find more",
    "反問": "Ask back",
    "婉拒": "Decline",

    // developers
    "開發者優先": "Developer first",
    "一個 API，三種接法。": "One API, three ways in.",
    "嵌入式 Agent、REST API（SSE 串流），或型別完整的 TypeScript SDK，選你順手的方式。": "The embedded agent, the REST API (SSE streaming) or the fully typed TypeScript SDK. Use whichever suits you.",
    "程式碼範例": "Code samples",
    "嵌入 Script": "Embed script",
    "複製": "Copy",

    // faq
    "常見問題": "FAQ",
    "上線前，你可能想知道。": "Things you may want to know before going live.",
    "它會不會亂編答案？": "Will it make things up?",
    "每則回答都以檢索到的段落為依據（Grounded Generation）並附上引用。當最佳證據的信心低於你設定的門檻，Agent 不會生成錯誤的回覆，而是說明目前資料不足，並把問題記錄成知識缺口。":
      "Every answer is grounded in the retrieved passages and cites them. When the best evidence falls below the threshold you set, the agent doesn't make up an answer; it says the material doesn't cover the question and logs it as a knowledge gap.",
    "我的資料會存在哪裡？": "Where is my data stored?",
    "存在你部署的資料庫與儲存空間。專案之間完全隔離；除了你選擇的模型供應商，不會有資料送往第三方。": "In the database and storage of your deployment. Projects are fully isolated, and nothing is sent to third parties other than the model provider you choose.",
    "可以只用本地模型嗎？": "Can I use only local models?",
    "可以。聊天與嵌入都設定為 Ollama 時，整套系統可以在你自己的機器上運作。也能混合使用，例如本地嵌入搭配雲端聊天模型。":
      "Yes. With both chat and embeddings on Ollama, the whole system runs on your own machine. You can also mix them, for example local embeddings with a cloud chat model.",
    "嵌入後會影響我網站的樣式嗎？": "Will it affect my site's styles?",
    "不會。小工具渲染在 Shadow DOM 裡，沒有任何執行期相依，樣式不會外洩到你的頁面，也不會被你的 CSS 影響。":
      "No. The widget renders in a Shadow DOM with no runtime dependencies, so its styles don't leak into your page and your CSS doesn't reach it.",
    "需要會寫程式嗎？": "Do I need to code?",
    "不需要。從匯入內容、調整外觀到產生嵌入程式碼都在儀表板完成，只要能編輯網站並貼上一段 script 即可。需要更深整合時，再使用 API 或 SDK。":
      "No. Importing content, styling and generating the embed code all happen in the dashboard; you only need to be able to paste one script into your site. Reach for the API or SDK when you want a deeper integration.",
    "網站內容更新後，Agent 會知道嗎？": "Will the agent notice when my site changes?",
    "目前可以對單一來源或整個專案重新索引。排程同步、版本歷史與過期提醒正在開發中。": "Today you can re-index a single source or the whole project. Scheduled sync, version history and staleness alerts are in development.",

    // cta & footer
    "讓你的網站，擁有自己的 AI Agent。": "Give your website its own AI agent.",
    "上傳第一份文件，接著就能在自己的網站上看見會查證的 Agent。": "Upload your first document, then watch an agent that checks its sources answer on your own site.",
    "把會查證的客製化 AI Agent，嵌入任何網站。": "Embed a verifiable, customizable AI agent in any website.",
    "頁尾導覽": "Footer navigation",
    "產品": "Product",
    "研發路線": "Roadmap",
    "API 與 SDK": "API & SDK",
    "資源": "Resources",
    "實機展示": "Live demo",
    "回報問題": "Report an issue",
    "© 2026 EmbAId Agent，採 MIT 授權": "© 2026 EmbAId Agent, MIT licensed",
    "Shadow DOM 隔離、繁體中文優先、開放原始碼": "Shadow DOM isolated, Traditional Chinese first, open source",
  };

  // Inside code samples only the sample question is translated.
  const CODE_EN = { "退貨要幾天內申請？": "How long do I have to return it?" };

  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const hasCJK = /[㐀-鿿]/;
  const ATTRS = ["aria-label", "placeholder", "title", "alt"];

  const apply = () => {
    if (lang !== "en") return;
    document.title = EN[norm(document.title)] ?? document.title;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = EN[norm(desc.content)] ?? desc.content;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const raw = node.nodeValue;
      if (!hasCJK.test(raw)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style")) continue;
      if (parent.closest("pre, code")) {
        let out = raw;
        for (const [zh, en] of Object.entries(CODE_EN)) out = out.split(zh).join(en);
        node.nodeValue = out;
        continue;
      }
      const hit = EN[norm(raw)];
      if (hit === undefined) continue;
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      node.nodeValue = lead + hit + trail;
    }
    document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(",")).forEach((el) => {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && hasCJK.test(v) && EN[norm(v)] !== undefined) el.setAttribute(a, EN[norm(v)]);
      }
    });
  };

  const setLang = (next) => {
    if (!isLang(next) || next === lang) return;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      void 0;
    }
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    location.replace(url.toString());
  };

  window.EMBAID_I18N = {
    lang,
    /** Pick the string for the current language. */
    t: (zh, en) => (lang === "en" ? en : zh),
    apply,
    setLang,
    other: lang === "en" ? "zh-TW" : "en",
  };
})();
