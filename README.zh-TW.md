<div align="center">

# EmbAId Agent

**一段 `<script>`，把會查證、可完整客製化的 AI Agent 嵌入任何網站。**

以你自己的內容為基礎的 Agentic RAG：它會一步步推理並讓你看見過程，只依據檢索到的證據作答並附上出處，
證據不足時不會生成錯誤的回覆，而是誠實說明資料裡沒有。

[English](README.md) · **繁體中文**

[![CI](https://github.com/ShiYu0318/EmbAId-Chat/actions/workflows/ci.yml/badge.svg)](https://github.com/ShiYu0318/EmbAId-Chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13-black.svg)](https://www.python.org/)
[![Node](https://img.shields.io/badge/Node-20%2B-black.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-black.svg)](https://www.typescriptlang.org/)

[官方網站](https://embaid-agent.vercel.app) · [快速開始](#快速開始) · [Agent 推理流程](#agent-推理流程)

</div>

<p align="center">
  <img src=".github/assets/screenshots/hero-zh-TW.png" alt="EmbAId Agent 官網的星系首頁，展開的聊天視窗裡有提問、推理步驟與附出處的回答" width="880" />
</p>

---

## 目錄

- [概述](#概述)
- [畫面截圖](#畫面截圖)
- [設計原則](#設計原則)
- [系統架構](#系統架構)
- [Agent 推理流程](#agent-推理流程)
- [RAG 管線詳解](#rag-管線詳解)
- [知識匯入流程](#知識匯入流程)
- [功能總覽](#功能總覽)
- [研發路線：Agentic 檢索](#研發路線agentic-檢索)
- [技術棧](#技術棧)
- [專案結構](#專案結構)
- [快速開始](#快速開始)
- [建立你的第一個 Agent](#建立你的第一個-agent)
- [設定](#設定)
- [嵌入 Agent](#嵌入-agent)
- [使用 SDK](#使用-sdk)
- [API 參考](#api-參考)
- [安全模型](#安全模型)
- [可觀測性](#可觀測性)
- [部署](#部署)
- [測試](#測試)
- [參與貢獻](#參與貢獻)
- [授權](#授權)

---

## 概述

EmbAId Agent 把你自己的內容變成一個住在你網站上的 AI Agent。把它指向你的檔案、網站或 Notion，
它會把內容切塊、嵌入，寫進一個由你掌控的向量資料庫。訪客提問時，Agent 會依序處理：理解並改寫問題、
執行混合檢索、重新排序證據、判斷證據是否足夠，然後才依據證據寫出回答，逐字串流並附上來源段落。

每一個步驟都會即時回報。訪客看到的是 Agent 正在做什麼（「搜尋知識庫…」「比對 18 段候選內容…」），
而不是一個轉圈圈的載入圖示；營運者事後也能看到每則回答完整的檢索軌跡。證據不夠充分時，Agent 會直接
說明，不會生成看似合理的錯誤回答，並把這個問題放進知識缺口佇列，等你補上內容。

**它做什麼**

1. **匯入**知識：上傳檔案、爬取網站、Sitemap、Notion、Google Docs。
2. **建立索引**：遞迴切塊、可選的 Contextual Retrieval（由 LLM 為每段寫一句定位說明）、
   Dense 向量加上 BM25 全文索引，存在你擁有的資料庫裡。
3. **先推理再回答**：依對話脈絡改寫查詢、Dense 與 BM25 混合檢索、Reciprocal Rank Fusion、
   可信度與時效加權、Cross-encoder 重排序，再通過信心門檻判斷，每一步都即時串流給訪客。
4. **回答或婉拒**：證據成立時給出附引用的回答；證據不足時誠實說明文件沒有涵蓋，並記錄為知識缺口。
5. **以嵌入式 Agent 上線**：一段 script、Shadow DOM 隔離、零執行期相依，名稱、人格、外觀與模型都可自訂。
6. **回報成效**：檢索軌跡、與上期比較的數據分析、安裝驗證，以及依頻率排序的待補問題清單。

**適合誰**

- 想在自己的內容與基礎設施上，運行一個有品牌識別的 AI Agent，而不把資料交給第三方 SaaS 的團隊。
- 想要一個每個階段都能檢查、串流、替換的 Agentic RAG 參考實作的開發者。
- 需要客製的不只是顏色的人：人格、檢索行為、模型、儲存方式與門檻，每個專案都能各自設定。

**不需要任何外部服務也能運行。** 預設使用 SQLite、FAISS 與內建工作執行器，一個指令就能啟動完整服務，
不需要 Docker。

---

## 畫面截圖

| | |
| --- | --- |
| ![官網首頁](.github/assets/screenshots/landing-hero.png) | ![官網開場區](.github/assets/screenshots/landing-intro.png) |
| **官網首頁。** WebGL 粒子在十個形狀之間變形，講述產品從匯入到回答的流程。 | **一段 script。** 開場區附上嵌入程式碼與 RAG 管線的階段。 |
| ![儀表板總覽](.github/assets/screenshots/dashboard-overview.png) | ![對話測試與推理步驟](.github/assets/screenshots/dashboard-playground.png) |
| **儀表板總覽。** 上線進度、建議下一步，以及附趨勢的關鍵指標。 | **對話測試。** 上線前試答，並展開 Agent 的推理步驟。 |
| ![嵌入設定與安裝驗證](.github/assets/screenshots/dashboard-embed.png) | ![嵌入網站的 Agent](.github/assets/screenshots/widget-on-site.png) |
| **嵌入設定。** 金鑰、允許網域、嵌入程式碼，以及自動安裝驗證。 | **在你的網站上。** Agent 顯示推理過程，依據你的文件回答並附上出處。 |

---

## 設計原則

| 原則 | 實際上代表什麼 |
| --- | --- |
| **全面可客製** | 名稱、頭像、問候語、人格、主色、起始問題、System Prompt、聊天與嵌入模型、檢索門檻，每個專案各自設定，在儀表板修改後不必重新部署。 |
| **資料與基礎設施都是你的** | 文件、向量與對話都存在你營運的儲存空間。除了你選擇的模型供應商，沒有資料會離開你的部署，而那個供應商也可以是本地的 Ollama。 |
| **每個元件都能替換** | 搜尋後端、聊天模型、嵌入模型與重排序器都藏在精簡的介面後面。從 SQLite+FAISS 換成 Postgres+pgvector 只要改一個環境變數。 |
| **看得見的推理** | Agent 在第一個回答字元出現前，就會串流它執行的每個階段：理解、搜尋、重排序、組織回答或婉拒。訪客看到的步驟，和營運者在軌跡裡看到的完全一致。 |
| **可追溯的回答** | 每則回答都由檢索到的段落組成，並產生一份 `RetrievalTrace`：改寫後的查詢、各後端命中與排名、融合分數、可信度加權、信心值與各階段耗時。 |
| **寧可婉拒，不要亂猜** | 每個專案都有信心門檻判斷證據是否足夠。低於門檻時，Agent 不會生成回答，而是說明文件沒有涵蓋這個問題，並記錄為知識缺口。 |
| **內容不是一律平等** | 段落帶可信度分數，文件帶驗證日期。過時與低可信的段落在檢索時會被降權。 |
| **從第一天就支援多租戶** | 組織、專案、有範圍限制的 API 金鑰、每把金鑰的允許網域與速率限制，都是核心資料模型的一部分。 |
| **Agent 是網站的客人** | 嵌入式 Agent 渲染在 Shadow DOM 裡且零執行期相依，樣式既不會外洩到宿主頁面，也不會被宿主樣式影響。 |

---

## 系統架構

四個可部署的介面共用同一個 API。API 本身無狀態，所有持久化狀態都在關聯式資料庫、搜尋索引與物件儲存中。

```mermaid
flowchart TB
    subgraph clients["用戶端"]
        widget["嵌入式 Agent<br/>Shadow DOM、原生 TS"]
        dash["管理儀表板<br/>Next.js 15 + React 19"]
        sdk["TypeScript SDK<br/>或直接呼叫 HTTP"]
    end

    subgraph api["FastAPI 服務"]
        mw["中介層<br/>CORS · 安全標頭 · 速率限制"]
        auth["驗證層<br/>JWT 工作階段 · API 金鑰"]
        routers["路由<br/>專案 · 內容 · 對話 · 分析"]
        rag["Agent 推理迴圈<br/>理解 → 檢索 → 融合 → 重排序 → 門檻 → 組織回答<br/>各階段以 status 事件串流"]
        jobs["匯入工作<br/>載入 → 切塊 → 補脈絡 → 嵌入"]
    end

    subgraph stores["狀態"]
        rdb[("關聯式資料庫<br/>SQLite 或 Postgres")]
        idx[("搜尋索引<br/>FAISS+FTS5 或 pgvector+tsvector")]
        obj[("物件儲存<br/>本機檔案或 S3/MinIO")]
        queue[("工作佇列<br/>Redis（arq）或內建執行器")]
    end

    subgraph providers["模型供應商"]
        chat["聊天模型<br/>Anthropic · OpenAI · Ollama"]
        embed["嵌入模型<br/>OpenAI · Ollama"]
        rerank["Cross-encoder 重排序<br/>sentence-transformers"]
    end

    widget -->|"發佈用金鑰"| mw
    sdk -->|"私密金鑰"| mw
    dash -->|"JWT"| mw
    mw --> auth --> routers
    routers --> rag
    routers --> jobs
    rag --> rdb
    rag --> idx
    rag --> chat
    rag --> embed
    rag --> rerank
    jobs --> queue
    jobs --> obj
    jobs --> rdb
    jobs --> idx
    jobs --> embed
```

| 元件 | 職責 |
| --- | --- |
| **API**（`apps/api`） | 唯一會寫入持久化狀態的元件，負責驗證、多租戶、匯入排程、檢索與回答生成。 |
| **儀表板**（`apps/dashboard`） | 營運主控台：上線檢查清單、知識庫、含推理步驟的對話測試、元件工作室、含安裝驗證的嵌入設定、對話紀錄、數據分析、知識缺口與 ⌘K 指令面板。以 JWT 呼叫 API。 |
| **Widget**（`apps/widget`） | 訪客在你網站上看到的嵌入式 Agent：狀態提示、即時推理步驟、有節奏的串流與引用標籤。啟動時以發佈用金鑰向 API 讀取設定。 |
| **SDK**（`packages/sdk-js`） | 同時涵蓋對話與管理介面的型別化用戶端，附串流輔助工具。 |
| **官網**（`apps/landing`） | 靜態行銷網站，包含 WebGL 粒子首頁、腳本化的推理示範，並嵌入真正的 Widget 作為現場示範。 |

---

## Agent 推理流程

回答不是一次單純的模型呼叫。API 會在檢索管線上執行一個 Agent 推理迴圈，並把每個進入的階段，透過之後
用來傳送回答的同一條 SSE 串流回報出去：

```mermaid
sequenceDiagram
    autonumber
    participant V as 訪客（Widget）
    participant A as EmbAId Agent API
    participant S as 搜尋索引
    participant M as 聊天模型
    V->>A: POST /v1/chat「可以退回信用卡嗎？」
    A-->>V: status: understand
    A->>M: 依最近幾輪對話改寫問題
    A-->>V: status: search（query =「退款方式 信用卡」）
    A->>S: Dense kNN ∥ BM25
    A-->>V: status: rerank（candidates = 18）
    A->>A: RRF 融合 · 可信度與時效加權 · Cross-encoder
    alt 證據通過信心門檻
        A-->>V: status: compose（sources = 2, confidence = 0.91）
        A->>M: 附編號段落的 grounded prompt
        M-->>A: tokens
        A-->>V: token … token
        A-->>V: citations · trace · done（answered = true）
    else 證據不足
        A-->>V: status: abstain（confidence 0.31，低於門檻 0.55）
        A-->>V: 誠實婉拒 · done（answered = false）
        A->>A: 記錄知識缺口
    end
```

| 階段 | 何時送出 | 附帶欄位 |
| --- | --- | --- |
| `understand` | Agent 開始處理問題 | — |
| `cache_hit` | 之前已回答過幾乎相同的問題 | `sources` |
| `search` | 改寫後的查詢送入混合檢索 | `query` |
| `rerank` | 融合後的候選段落正在重新排序 | `candidates` |
| `compose` | 證據通過門檻，正在撰寫回答 | `sources`、`confidence` |
| `abstain` | 證據未通過門檻 | `confidence`、`threshold` |

Widget 會把這些事件轉成即時的「思考中」面板：每個階段以一個步驟呈現，轉圈的圖示會在完成後變成勾勾；
回答開始時面板會收合成「已思考 2.4 秒」，訪客也可以再展開。因為步驟來自伺服器，而不是預錄的動畫，
訪客看到的就是 Agent 實際做的事。儀表板的對話測試與內建測試機器人也會顯示相同的步驟。

目前的推理迴圈刻意保持有界：一次改寫、一輪檢索、一次決策。多輪檢索與工具調用在
[研發路線](#研發路線agentic-檢索)上；事件協定已經為此設計好，用戶端會渲染任何送達的階段。

### 串流回應格式

`POST /v1/chat` 會回傳 Server-Sent Events：

| 事件 | 內容 | 送出時機 |
| --- | --- | --- |
| `conversation` | `{ conversation_id, message_id }` | 立即送出一次 |
| `status` | `{ stage, ...detail }`，見上表 | 每個階段一次，在第一個 token 之前 |
| `token` | `{ text }` | 生成期間持續送出 |
| `citations` | `{ items: [...] }` | 檢索後送出一次 |
| `trace` | 完整的 `RetrievalTrace` | 結束前送出一次 |
| `done` | `{ answered: boolean }` | 最後送出一次 |

---

## RAG 管線詳解

這一節依序說明管線的每個階段，以及程式中實際使用的預設值。

### 1. 匯入與切塊

| 步驟 | 做什麼 | 備註 |
| --- | --- | --- |
| 載入 | 解析 PDF、DOCX、Markdown 與純文字；網頁會去除導覽列、頁首與頁尾只保留正文；文字以 UTF-8、Big5 或 GB18030 解碼 | 單檔 25 MB |
| 遞迴切塊 | 以能放得下的最大自然邊界切分：段落、換行、中英文句讀，最後才是詞，因此很少把一句話切成兩半 | 相鄰段落保留重疊 |
| Contextual Retrieval | 可選。由聊天模型為每段寫一句「這段在文件中講什麼」的定位說明，與段落一起嵌入，但不會顯示在引用中 | 限制並行數量 |
| 嵌入 | 段落分批轉成 Dense 向量 | 分批處理 |
| 建立索引 | 向量寫入 FAISS（正規化後做內積，`IndexFlatIP`）或 pgvector（cosine）；文字寫入 SQLite FTS5（BM25）或 Postgres `tsvector`（`ts_rank`） | — |

重疊確保跨越邊界的資訊至少完整出現在其中一段。中英混排有特別處理：中文標點（`。！？；：、，`）是切分
邊界；全文檢索以 jieba 斷詞，並用 OpenCC 統一簡繁體，所以「退貨」與「退货」能互相匹配。

### 2. 理解問題

追問通常無法單獨回答（例如「那信用卡呢？」）。有對話歷史時，Agent 會請聊天模型把最新的問題改寫成可以
獨立理解的查詢，依最近幾輪對話補齊代名詞與省略的部分。實際拿去檢索的是改寫後的查詢，原始與改寫兩個版本
都會保留在軌跡中。沒有歷史的第一個問題會跳過這一步。

### 3. 混合檢索

Dense 與全文檢索**同時並行**，各自最多取回 `RETRIEVAL_CANDIDATES`（30）筆：

- **Dense 檢索**找出用不同說法表達同一件事的段落（「退款期限」↔「退貨時間」）。
- **全文檢索（BM25）**找出 Dense 模型容易模糊掉的精確字詞：產品型號、錯誤訊息、條款編號、專有名詞。

### 4. Reciprocal Rank Fusion

兩份結果依「排名」而不是「分數」合併，因此兩者不相容的分數尺度永遠不會直接比較：

```
rrf(d) = Σ（每份清單）1 / (k + rank(d))      k 為平滑常數
正規化 = rrf(d) / (清單數 / (k + 1))
```

正規化讓融合分數容易解讀：在每份清單都排第一的段落，分數剛好是 `1.0`。也因此單一的信心門檻，在不同專案
之間代表相同的意義。

### 5. 可信度與時效加權

```
w = base + (1 − base) · trust_score       （段落層級，0–1）
w = w · stale_penalty   若文件已過期（超過 staleness_days 未驗證）
score = 正規化 rrf · w
```

加權發生在信心門檻**之前**，所以在融合路徑上，來源的可信度與新舊會直接影響 Agent 要不要回答，而不只是
影響排序。

### 6. Cross-encoder 重排序

可選。融合後的候選段落會交給 Cross-encoder（預設為多語言模型，可用 `RERANK_MODEL` 更換）重新評分。它會把問題與
段落放在一起閱讀，而不是比較兩個各自獨立的向量，所以更精準但也更慢，因此只用在融合後的候選清單上，而不是
整個索引。原始分數經 sigmoid 壓到 0–1 後成為段落分數，取前 `RETRIEVAL_TOP_K`（6）段進入下一步。若重排序器
沒有安裝或執行失敗，會保留融合後的順序；此時軌跡中的 `reranked_hits` 為空，也不會有 `rerank` 耗時。

> **已知限制。** 啟用重排序時，Cross-encoder 的分數會取代加權後的分數，所以可信度與時效加權只影響候選清單，
> 不影響最後的門檻判斷。保留兩種分數並有意識地合併，是[研發路線](#研發路線agentic-檢索)中證據判斷的一部分。

### 7. 信心門檻

```
confidence = 前 K 段中的最高分
confidence ≥ 專案的 confidence_threshold → 回答
否則 → 婉拒
```

婉拒是正式的結果之一：Agent 會串流一個 `abstain` 階段，用訪客的語言說明文件沒有涵蓋這個問題，把訊息標記為
`answered = false`，並把問題正規化、去重後記錄為知識缺口，同時累計出現次數。

### 8. 依據證據生成回答

Prompt 包含人格與 System Prompt、編號的段落，以及「只能依據這些段落作答並以編號引用」的指示。Token 透過
SSE 串流，引用會對應回文件標題與網址。完成後，訊息與其軌跡會被保存。

### 9. 語意快取

在上述所有步驟之前，問題的向量會先與同專案中已回答過的問題比對。cosine 相似度 ≥
`SEMANTIC_CACHE_THRESHOLD` 時，直接回傳快取的回答與當時的引用，訪客看到的會是 `cache_hit` 步驟，
而不是搜尋。

**知識缺口變成內容待辦。** 未通過門檻的問題會正規化並記錄出現次數，在儀表板依實際需求排序。模型可以草擬
回答給人審核，核准後的回答會直接寫回知識庫並建立索引。這個佇列會明確告訴你下一份該寫的文件是什麼。

---

## 知識匯入流程

匯入是非同步的。API 在工作排入佇列後立即回應，儀表板會輪詢文件狀態，所以大量爬取不會卡住任何請求。

```mermaid
flowchart LR
    subgraph sources["來源"]
        up["上傳檔案<br/>PDF · DOCX · Markdown · 純文字"]
        crawl["網站爬取<br/>同網域 BFS"]
        sm["Sitemap"]
        conn["Notion · Google Docs"]
    end

    subgraph expand["探索"]
        robots["遵守 robots.txt<br/>限速抓取"]
        readable["移除導覽列、頁首、頁尾<br/>擷取正文"]
        play["Playwright 備援<br/>靜態 HTML 太少時"]
    end

    subgraph process["處理"]
        parse["解析與解碼<br/>utf-8 · big5 · gb18030"]
        chunkit["遞迴切塊<br/>相鄰段落重疊"]
        ctx["Contextual Retrieval<br/><i>可選</i><br/>LLM 為每段寫定位句"]
        emb["分批嵌入"]
    end

    subgraph out["寫入"]
        docrow["文件資料列<br/>摘要 · token 數 · 狀態"]
        chunks["段落資料列<br/>+ 可信度分數"]
        index[("向量 + 全文索引")]
        hook["webhook: document.indexed"]
    end

    up --> parse
    crawl --> robots --> readable --> parse
    sm --> readable
    conn --> parse
    readable -.->|"內容太少"| play -.-> parse
    parse --> chunkit --> ctx --> emb
    emb --> docrow --> chunks --> index --> hook
```

**爬取行為。** 爬蟲只停留在指定的網域、遵守 `robots.txt`、在請求之間加入延遲，並在達到頁數上限時停止。這是成本與雜訊控制，因為每一頁都要花一次嵌入。靜態 HTML 擷取不到足夠文字的頁面，在安裝 Playwright
擴充後會改用無頭瀏覽器渲染。

**刪除會連帶清除。** 移除一個匯入來源，會一併移除它產生的文件與向量，一次爬取可以一個動作完整撤銷。

---

## 功能總覽

### 匯入與索引

- 上傳 PDF、DOCX、Markdown、純文字，單檔 25 MB，依內容類型與副檔名雙重判斷格式
- 同網域 BFS 網站爬取，遵守 `robots.txt`，擷取正文，可選無頭瀏覽器處理 JavaScript 渲染的頁面
- Sitemap 展開，支援巢狀 Sitemap
- Notion 與 Google Docs 連接器
- 針對中英混排調校的遞迴切塊
- 可選的 Contextual Retrieval
- 以 Redis 與 arq 執行背景工作，未設定佇列時改用內建執行器
- 可重新索引單一來源或整個專案
- 刪除時連帶清除文件、段落與向量

### 檢索與回答

- 回答前以 `status` 事件串流即時推理步驟
- 逐字 SSE 串流，回答立即開始出現
- 對話記憶：追問會先依最近幾輪對話改寫再檢索
- Dense 與 BM25 混合檢索，並行執行
- 正規化的 Reciprocal Rank Fusion
- 可選的 Cross-encoder 重排序
- 在信心門檻前套用可信度加權與過期懲罰
- 以 cosine 相似度門檻判斷的語意快取
- 引用對應回文件標題與網址
- 每個專案各自的信心門檻，以訪客語言婉拒
- 中文感知的文字處理（jieba 斷詞、OpenCC 簡繁正規化）

### 多租戶平台

- 組織、使用者與專案
- 三種權限與前綴各不相同的 API 金鑰
- 每把金鑰的允許網域與速率限制
- 每個專案各自的模型供應商、門檻、過期天數與 System Prompt
- 用來快速建立專案提示詞與 Widget 設定的人格範本
- 文件層級的啟用與停用，停用後不參與檢索
- 標籤、篩選與各標籤統計

### 營運

- 由實際專案狀態計算的六步上線檢查清單，附「下一步」捷徑
- 安裝驗證：嵌入設定頁會等待第一則來自真實網站的對話並確認上線（從儀表板發起的對話會另外標記，不列入計算）
- 總覽頁的「建議下一步」，依知識缺口、待核准草稿、婉拒率、過期文件與金鑰安全推導
- ⌘K 指令面板，快速前往頁面、執行動作與切換專案
- 每則訊息保存檢索軌跡，可在儀表板檢視
- 附「與上期比較」的數據分析：對話與訊息量、每日已回答與婉拒、對照專案門檻的信心分布、對話來源、滿意度、
  快取命中率、過期文件、Token 用量，每張圖都能切換成資料表
- 知識缺口佇列，含出現次數、LLM 草擬回答，以及一鍵寫回知識庫
- 訊息層級的讚與倒讚回饋
- 對話瀏覽與匯出
- 附 HMAC 簽章、傳送紀錄、重試與測試觸發的對外 Webhook
- 可選的 Sentry 錯誤追蹤

### 嵌入式 Agent

- 一段 `<script>`，以 data 屬性設定
- 狀態提示（線上、思考中、輸入中）、已讀提示，以及即時推理面板
- 有節奏的逐字呈現，遇到標點會稍作停頓，讀起來更自然
- 引用標籤、回饋按鈕，以及網路錯誤時的重試
- Shadow DOM 隔離，零執行期相依
- 以發佈用金鑰向 API 讀取設定，修改外觀不必重新部署
- 可自訂主色、頭像、問候語、人格與起始問題
- 串流回答，附行內引用與 Markdown 渲染
- 淺色、深色與自動主題；多語系介面

---

## 研發路線：Agentic 檢索

目前的 Agent 走的是固定且有界的路徑。下一階段正在研究中，**尚未上線**，目標是讓檢索更具自主性，並能判斷
證據本身：

- **自主調用工具（Tool Use）。** Agent 自行判斷要再搜尋一次、閱讀整份文件，還是向訪客反問以釐清條件。
  先從唯讀工具與轉介草稿開始，再開放會改變外部狀態的操作。
- **多輪思考與自主規劃。** 把問題拆成子問題、進行多輪檢索，並在回答前自我檢查。輪數、成本與時間上限都由
  模型之外的程式控制，每一步都留在軌跡中。
- **文件衝突與資訊過期下的補查與拒答決策。** 相關不等於正確：一段文字可能符合問題，卻描述了已被取代的政策、
  不同的產品版本，或不適用於這位訪客的條件。Agent 將能分辨「版本不同」「適用對象不同」與「真正矛盾」，
  再決定要**回答、補查更多證據，或婉拒**，而不是預設最新的來源一定是對的。
- **知識同步與存取層級。** 排程同步、版本歷史與增量更新；匿名訪客只能檢索公開內容。

---

## 技術棧

| 面向 | 選擇 |
| --- | --- |
| API | FastAPI、Uvicorn、SSE 串流、自動產生的 Swagger 與 ReDoc |
| 模型串接 | LangChain 供應商整合 |
| 聊天模型 | Anthropic、OpenAI、Ollama，每個專案可選 |
| 嵌入模型 | OpenAI 或 Ollama，每個專案可選 |
| 重排序 | `sentence-transformers` Cross-encoder（可選 `rerank` 擴充） |
| 向量檢索 | 本機用 FAISS，Postgres 上用 pgvector |
| 全文檢索 | 本機用 SQLite FTS5，部署時用 Postgres `tsvector` |
| 關聯式資料庫 | SQLAlchemy 2 async，搭配 SQLite 或 Postgres |
| 中文處理 | jieba 斷詞、OpenCC 正規化 |
| 驗證 | argon2 密碼雜湊、PyJWT access 與 refresh token、Google OAuth |
| 佇列 | Redis 上的 arq，附內建備援 |
| 物件儲存 | S3 或 MinIO，備援為本機檔案系統 |
| 爬取 | httpx 與 BeautifulSoup，可選 Playwright（`crawl` 擴充） |
| 儀表板 | Next.js 15、React 19、TypeScript、CSS 自訂屬性 |
| Widget | 原生 TypeScript、esbuild、Shadow DOM、零執行期相依 |
| 官網 | 靜態 HTML、原生 WebGL 粒子、無框架 |
| SDK | TypeScript、tsup（ESM + CJS + 型別），零執行期相依 |
| 工具鏈 | uv（Python）、pnpm workspaces、ruff、mypy、ESLint、Vitest、pytest |
| CI/CD | GitHub Actions、Docker Compose |

---

## 專案結構

```
EmbAId-Chat/
├── apps/
│   ├── api/                     FastAPI 後端，uv 指令請在此目錄執行
│   │   ├── src/
│   │   │   ├── main.py          App 工廠、中介層、路由註冊
│   │   │   ├── config.py        以環境變數為基礎的設定
│   │   │   ├── db/              SQLAlchemy 模型、async session、ID 工具
│   │   │   ├── search/          後端介面 + sqlite_faiss、postgres、factory
│   │   │   ├── rag/             pipeline、retriever、rerank、rewrite、cache、prompt
│   │   │   ├── ingestion/       loaders、web crawl、connectors、chunking、contextual、jobs
│   │   │   ├── providers/       聊天與嵌入模型供應商註冊
│   │   │   ├── security/        argon2、JWT、API 金鑰雜湊、HMAC 簽章
│   │   │   ├── api/             routers/、services/、deps、errors、middleware
│   │   │   └── tasks/           arq 佇列與 worker
│   │   └── tests/               以假物件替代搜尋、嵌入與聊天的離線測試
│   ├── dashboard/               Next.js 管理主控台
│   ├── widget/                  嵌入式 Agent（Shadow DOM）+ 示範頁
│   └── landing/                 靜態官網，含 WebGL 粒子首頁與現場示範
├── packages/
│   └── sdk-js/                  @embaid/sdk-js 官方 TypeScript 用戶端
├── docker/                      docker-compose.yml 與 Dockerfile
└── .github/                     CI 工作流程與 README 截圖
```

`apps/api` 是以 uv 管理的獨立 Python 專案，其餘都是 pnpm workspace。repo 根目錄只放 workspace 與協調用設定。

---

## 快速開始

### 前置需求

- Python 3.13 與 [uv](https://github.com/astral-sh/uv)
- Node.js 20+ 與 pnpm 10
- 一個模型供應商：Anthropic 或 OpenAI 金鑰，或本地的 [Ollama](https://ollama.com)
- Docker（可選，只有完整的 Postgres、Redis、MinIO 堆疊才需要）

### 後端

```bash
cd apps/api
uv sync --extra dev
cp .env.example .env          # 設定 JWT_SECRET 與一個模型供應商金鑰
uv run uvicorn src.main:app --reload
```

API 位於 `http://localhost:8000`，互動式文件在 `/docs`。預設使用 SQLite、FAISS 與內建工作執行器，不需要
其他服務。

可選擴充：

```bash
uv sync --extra dev --extra rerank    # Cross-encoder 重排序
uv sync --extra dev --extra crawl     # 為 JavaScript 為主的頁面提供 Playwright 備援
```

### 前端 workspace

```bash
pnpm install
pnpm -r build                 # widget、SDK、dashboard
pnpm -r test
```

以開發模式執行儀表板：

```bash
pnpm --filter @embaid/dashboard dev    # http://localhost:3000
```

建置 Widget 並開啟隔離示範頁：

```bash
pnpm --filter @embaid/widget build
# 接著開啟 apps/widget/demo.html
```

啟動附現場 Widget 的官網：

```bash
cd apps/landing && pnpm serve          # 建置 widget，於 :4180 提供服務
```

建置公開版官網時，若沒有公開架設的儀表板，可以把登入按鈕隱藏、讓「免費開始」導向安裝說明：

```bash
LANDING_DASHBOARD_URL="" node apps/landing/build.mjs              # 不連到儀表板
LANDING_DASHBOARD_URL=https://app.example.com node apps/landing/build.mjs
```

### 使用 Docker 啟動完整堆疊

```bash
docker compose -f docker/docker-compose.yml up --build
# api :8000 · dashboard :3000 · postgres :5432 · redis :6379 · minio :9000
```

Postgres（含 pgvector）、Redis 與 MinIO 會以服務形式啟動，API 會自動切換到 Postgres 後端。加上
`--profile ollama` 可以同時執行本地模型。

---

## 建立你的第一個 Agent

從空資料庫到可運作的嵌入，完整流程如下。儀表板的上線檢查清單會依實際專案狀態，逐一勾選這六個步驟：

1. **建立帳號**：到 `http://localhost:3000` 註冊並建立專案。可選擇人格範本來預填 System Prompt 與 Widget 文案。
2. **匯入知識**：在知識庫頁面拖入 PDF 或 Markdown，或新增網站讓爬蟲展開。文件會立即出現，索引完成後狀態
   會從處理中變成有效。
3. **測試並客製化**：在對話測試頁試答，展開推理步驟看看檢索到了什麼；再到元件工作室設定名稱、問候語、人格、
   主色、頭像與起始問題，右側會即時預覽真實的聊天視窗。
4. **建立發佈用金鑰**：在嵌入設定頁建立金鑰、設定允許網域並按部署，就會得到可直接貼上的 script，儀表板裡的
   浮動測試機器人也會解鎖，不用離開主控台就能試用。
5. **貼上程式碼**：把它放在網站的 `</body>` 之前。嵌入設定頁會等待第一則來自真實網站的對話，收到後就會顯示
   「已接通」；從儀表板發起的對話會另外標記，不會被誤判為上線。
6. **持續擴充知識庫**：答不出來的問題會依訪客詢問次數排序，集中在知識缺口佇列。用模型草擬回答、核准後，
   就會直接寫回並建立索引。

---

## 設定

後端設定來自 `apps/api/.env`。最小可用的設定：

```bash
ENVIRONMENT=development
JWT_SECRET=                       # openssl rand -hex 32
DATABASE_URL=sqlite+aiosqlite:///./data/embaid.sqlite
SEARCH_BACKEND=sqlite_faiss       # 或 postgres
QUEUE_ENABLED=false               # 設為 true 需要 Redis
ANTHROPIC_API_KEY=                # 或 OPENAI_API_KEY，或執行 Ollama
DEFAULT_CHAT_PROVIDER=anthropic
DEFAULT_EMBEDDING_PROVIDER=openai
```

### 檢索調校

檢索相關的預設值會隨專案調整，這裡不列出數字；目前的值請看 `apps/api/src/config.py` 與
`apps/api/.env.example`。

| 變數 | 效果 |
| --- | --- |
| `RETRIEVAL_CANDIDATES` | 融合前每個後端取回的候選數。召回率更高，成本也更高。 |
| `RETRIEVAL_TOP_K` | 重排序後交給模型的段落數。 |
| `CONFIDENCE_THRESHOLD` | 婉拒門檻的全域預設值，每個專案可覆寫。 |
| `RERANK_ENABLED` | Cross-encoder 重排序，需要 `rerank` 擴充。 |
| `RERANK_MODEL` | 重排序使用的 Cross-encoder（預設為多語言模型）。 |
| `SEMANTIC_CACHE_ENABLED` | 對幾乎相同的問題重用回答。 |
| `SEMANTIC_CACHE_THRESHOLD` | 命中快取所需的 cosine 相似度。 |
| `CONTEXTUAL_EMBEDDING_ENABLED` | 建立索引時，由 LLM 為每段寫一句定位說明。 |
| `DOCUMENT_STALENESS_DAYS` | 超過這個天數未驗證的文件視為過期並降權。 |
| `EMBEDDING_DIMENSIONS` | 必須與嵌入模型一致，修改後需要重新索引。 |

### 基礎設施

| 變數 | 預設值 | 效果 |
| --- | --- | --- |
| `SEARCH_BACKEND` | `sqlite_faiss` | 本機用 `sqlite_faiss`，`postgres` 則使用 pgvector 加 `tsvector`。 |
| `QUEUE_ENABLED` | `true` | 設為 `false` 時在請求中直接執行匯入，本機方便，正式環境不建議。 |
| `STORAGE_ENDPOINT_URL` | 未設定 | 使用 S3 或 MinIO 時設定，否則使用本機檔案系統。 |
| `RATE_LIMIT_PUBLISHABLE` | `20` | 瀏覽器端金鑰每分鐘請求數。 |
| `RATE_LIMIT_SECRET` | `200` | 伺服器端金鑰每分鐘請求數。 |
| `CORS_ORIGINS` | `http://localhost:3000` | 以逗號分隔。正式環境不接受萬用字元。 |

正式環境若使用預設的 `JWT_SECRET` 或萬用字元的 CORS 來源，應用程式會拒絕啟動。未列出的設定都是可選的，
未設定時會安全略過。

---

## 嵌入 Agent

```html
<script
  src="https://cdn.embaid.chat/widget.js"
  data-key="pub_xxxxxxxx"
  data-project="proj_xxxxxxxx"
></script>
```

| 屬性 | 必填 | 用途 |
| --- | --- | --- |
| `data-key` | 是 | 發佈用金鑰，可以安全公開，見[安全模型](#安全模型)。 |
| `data-project` | 是 | Agent 回答的專案。 |
| `data-api-url` | 否 | 指向你自己的 API，預設為 `https://api.embaid.chat`。 |

Widget 啟動時會從 `GET /v1/widget-config` 讀取外觀與起始問題，所以在儀表板做的修改，重新整理後就會生效，
不需要修改宿主頁面。它完全渲染在 Shadow DOM 中，宿主的 CSS 不會滲入，它的樣式也不會外洩。

**正式上線前**，請把金鑰的允許網域設成你的網域。限定網域的金鑰若從其他地方送出請求，會被回以 `403` 拒絕。

---

## 使用 SDK

```bash
npm install @embaid/sdk-js
```

串流一個有依據的回答。`apiKey` 與 `projectId` 都是必填，金鑰類型會從前綴自動判斷：

```ts
import { EmbAId } from "@embaid/sdk-js";

const client = new EmbAId({
  apiKey: process.env.EMBAID_KEY!,          // pub_… 或 sbx_…
  projectId: process.env.EMBAID_PROJECT_ID!,
});

for await (const event of client.chat.stream({ message: "退款期限是多久？" })) {
  if (event.type === "token") process.stdout.write(event.text);
  if (event.type === "citations") console.log("\n來源：", event.citations.map((c) => c.title));
  if (event.type === "done" && event.refusalReason) {
    console.log(`\n已婉拒（${event.refusalReason}），並記錄為知識缺口。`);
  }
}
```

串流是一個型別化的 `AsyncGenerator`，事件型別包括 `conversation`、`token`、`citations`、`trace`、`done`、
`error`，以及一個 `unknown` 型別，讓伺服器未來新增的事件（例如 `status`）不會讓既有用戶端出錯。需要完整結果
而不是串流時，改用 `chat.send()`。

管理功能需要私密金鑰，而且必須在伺服器端執行：

```ts
const admin = new EmbAId({
  apiKey: process.env.EMBAID_SECRET_KEY!,   // sk_…
  projectId: process.env.EMBAID_PROJECT_ID!,
});

await admin.sources.create({
  type: "url_crawl",
  config: { url: "https://example.com/docs", max_pages: 50 },
});
```

專案層級的資源（`sources`、`documents`、`apiKeys`、`tags`、`knowledgeGaps`、`analytics`、`webhooks`）會從
建構子讀取專案，因此不需要再傳專案參數。若用非私密金鑰呼叫它們，會在呼叫當下拋出 `EmbAIdPermissionError`，
而不是送出一個伺服器一定會拒絕的請求，用戶端拒絕透過瀏覽器安全的金鑰洩漏管理操作。

SDK 提供 ESM、CJS 與型別宣告，沒有執行期相依。

---

## API 參考

互動式文件位於 `/docs`（Swagger）與 `/redoc`。所有錯誤都使用相同的格式：
`{"detail": {"code": "...", "message": "..."}}`。完整端點清單請見[英文版 README](README.md#api-reference)，
以下列出最常用的部分：

| 方法 | 路徑 | 驗證 | 用途 |
| --- | --- | --- | --- |
| `POST` | `/auth/signup`、`/auth/login` | 無 | 註冊與登入 |
| `POST` `GET` | `/v1/projects` | JWT | 建立與列出專案 |
| `POST` | `/v1/projects/{id}/documents/upload` | JWT | 上傳檔案 |
| `POST` `GET` | `/v1/projects/{id}/api-keys` | JWT | 建立與列出金鑰 |
| `POST` | `/v1/chat` | API 金鑰 | 提問，以 SSE 串流回傳推理步驟與回答 |
| `GET` | `/v1/widget-config` | 發佈用金鑰 | Widget 啟動設定 |
| `GET` | `/v1/conversations` | JWT | 瀏覽對話（可依 `channel` 篩選：`widget`、`dashboard`、`api`） |
| `GET` | `/v1/messages/{id}/trace` | JWT | 完整檢索軌跡 |
| `GET` | `/v1/projects/{id}/analytics` | JWT | 數據分析，含每日回答與婉拒、信心分布、來源管道與上期比較 |
| `GET` | `/v1/projects/{id}/knowledge-gaps` | JWT | 依頻率排序的未回答問題 |

---

## 安全模型

### 三種金鑰

| 類型 | 前綴 | 放在哪裡 | 能做什麼 |
| --- | --- | --- | --- |
| **發佈用** | `pub_` | 瀏覽器、公開 HTML | 只能使用對話端點、只限一個專案，並受允許網域限制 |
| **私密** | `sk_` | 只能放在你的後端 | 完整管理權限 |
| **沙盒** | `sbx_` | 測試 | 與發佈用相同，但對話會標記為測試 |

金鑰在伺服器端產生，只以 SHA-256 雜湊值加上簡短的顯示前綴儲存。明文只會在建立時回傳一次，遺失後無法找回，
只能撤銷並換一把新的。因此即使資料庫外洩，拿到的也只是雜湊值，而不是可用的憑證。

### 為什麼把發佈用金鑰放在公開 HTML 裡是安全的

道理與 Stripe 的 publishable key 或 Google Maps 的瀏覽器金鑰相同：

1. 它只能使用對話端點，而且只限建立它的那個專案。它無法讀取原始文件，也無法修改任何設定。
2. 它受允許網域限制。被複製到其他網站使用時，請求會被以 `403` 拒絕。
3. 它有獨立於伺服器端金鑰的每分鐘速率限制。

最壞的情況，是有人從你已經核准的網域，以受限的頻率送出對話訊息。真正能改變設定的 `sk_` 金鑰永遠不會出現在
瀏覽器中。

### 其他控制

- argon2id 密碼雜湊；短效的 JWT access token 搭配輪替的 refresh token
- 安全標頭與嚴格的 CORS；非開發環境不接受萬用字元來源
- Webhook 內容以 HMAC-SHA256 簽章，接收端可以驗證來源與完整性
- 爬蟲遵守 `robots.txt`，並以明確的 user agent 表明身分
- 上傳上限 25 MB，解析前先驗證格式
- 在查詢建構時強制租戶隔離，而不是靠慣例

---

## 可觀測性

**檢索軌跡。** 每則回答都會保存改寫後的查詢、各後端的命中與排名和分數、融合與加權後的分數、對照門檻的最終
信心、Agent 是否作答，以及各階段耗時（快取查詢、改寫、嵌入、搜尋、融合、重排序、載入、生成）。儀表板會以
軌跡檢視器呈現，所以「它為什麼這樣回答」會有具體的答案。

**數據分析。** 對話與訊息量、每日已回答與婉拒、信心分布與專案門檻的對照、對話來源、以讚與倒讚計算的滿意度、
快取命中率、過期文件數與 Token 用量，每個專案可選擇時間區間，並與上一期比較。

**知識缺口。** 被婉拒的問題會正規化、去重並計數。高頻缺口排在最前面，可以由模型草擬回答給人審核，核准後
直接寫回知識庫。

**Webhook。** 訂閱 `document.indexed`、`knowledge_gap.created` 等事件來驅動你自己的自動化。傳送會簽章、
以退避策略重試，並記錄回應碼。

---

## 部署

API 無狀態且可水平擴充；狀態存在 Postgres、搜尋索引、物件儲存與 Redis 中。

接近正式環境的設定：

```bash
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://user:pass@host/embaid
SEARCH_BACKEND=postgres           # pgvector + tsvector
QUEUE_ENABLED=true                # 另外執行 worker
REDIS_URL=redis://host:6379
STORAGE_ENDPOINT_URL=https://s3.example.com
JWT_SECRET=<32 位元組以上的隨機值>
CORS_ORIGINS=https://console.example.com
```

至少在 API 旁邊執行一個 worker，讓匯入工作不會和請求處理搶資源：

```bash
uv run arq src.tasks.worker.WorkerSettings
```

`docker/docker-compose.yml` 會啟動整個堆疊（API、儀表板、含 pgvector 的 Postgres、Redis 與 MinIO），適合作為
單機部署的起點。

官網是純靜態網站，可以直接部署到 Vercel 等靜態主機：以 `LANDING_DASHBOARD_URL` 建置後，把
`apps/landing/dist` 發佈出去即可。

---

## 測試

```bash
cd apps/api
uv run pytest              # 後端測試
uv run ruff check .        # lint
uv run mypy src            # 型別檢查

pnpm -r test               # widget、SDK、dashboard
pnpm -r typecheck
pnpm -r lint
```

執行後端測試時，請把本機 `.env` 的供應商與 OAuth 設定隔離開，避免它們影響測試：

```bash
env DATABASE_URL=sqlite+aiosqlite:///:memory: QUEUE_ENABLED=false \
  GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= \
  DEFAULT_CHAT_PROVIDER=anthropic DEFAULT_EMBEDDING_PROVIDER=openai \
  RERANK_ENABLED=false CONTEXTUAL_EMBEDDING_ENABLED=false \
  uv run pytest
```

後端測試完全離線執行：搜尋後端、嵌入與聊天模型都以確定性的假物件替代，所以檢索邏輯、融合計算、婉拒行為與
租戶規則，都能在沒有網路與 API 金鑰的情況下測試。CI 會在每次 push 時執行兩套測試。

---

## 參與貢獻

歡迎提出 Issue 與 Pull Request。

1. Fork 後從 `main` 開新分支。
2. 讓變更保持聚焦，一個 Pull Request 只處理一件事。
3. 行為變更請補上測試，特別是涉及檢索、融合或租戶隔離的部分。
4. 開 PR 前執行上方完整的檢查。
5. 依照既有風格：Python 用 `ruff` 與 `mypy`，TypeScript 用 ESLint 與 `tsc`，commit 訊息遵循 Conventional Commits。

---

## 授權

MIT，詳見 [LICENSE](LICENSE)。
