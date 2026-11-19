# 參與 EmbAId Agent 開發

[English](CONTRIBUTING.md) · **繁體中文**

> 本文件是 [CONTRIBUTING.md](CONTRIBUTING.md) 的翻譯。兩者內容不一致時，以英文版為準。

EmbAId Agent 是開源、可自架的網站助理。產品與架構請先看 [README](README.zh-TW.md)，開發流程則依照本指南。
內部協作者可以直接在本 repo 開分支；外部貢獻者請先 fork。

## 第一次貢獻

1. 先讀既有的 Issue，或開一個新的 Issue 說明問題與預期成果，詳見[先開 Issue](#先開-issue)。
   API、資料模型、provider 或檢索相關的改動，請先取得共識再實作。
2. 在 Issue 中認領一個範圍明確的任務。寫出受影響的模組，並與同時修改相同介面的人協調。
   小而完整的改動比大範圍的整理更容易審查。
3. 依照[快速開始](README.zh-TW.md#快速開始)建立環境，再執行下方的檢查。跑單元測試不需要付費的模型帳號。
4. 及早開 Draft PR，連結對應的 Issue，並請受影響領域的人審查。
5. 處理審查意見；檢查與說明都完整後，再把 PR 標記為 ready。

## Repo 結構

| 領域 | 位置 | 主要職責 |
| --- | --- | --- |
| API | `apps/api` | 身分驗證、專案、資料匯入、檢索、provider 與資料儲存 |
| Dashboard | `apps/dashboard` | 管理介面、知識庫管理、設定與追蹤紀錄 |
| Widget | `apps/widget` | 可嵌入的訪客介面與串流 client |
| SDK | `packages/sdk-js` | 公開的 JavaScript／TypeScript client |
| Landing | `apps/landing` | 產品網站與 demo 入口 |
| 維運 | `docker`、`.github/workflows` | 部署 image、服務設定與 CI |

公開的說明文件放在 repo 根目錄或 `.github/`。本機的 `docs/` 資料夾被 git 忽略，clone 下來的人看不到。
私人筆記、錄影、實驗與憑證都不要放進受版本控制的檔案。

## 開發環境

使用 Python 3.13、Node.js 20 以上，以及 `package.json` 中固定的 pnpm 版本。
CI 使用的 Node 版本由 `.nvmrc` 指定。請依照已 commit 的 lockfile 安裝：

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
cd apps/api
uv sync --frozen --extra dev
```

模型設定與本機服務的說明請見 README。測試 API 的 `/widget.js` endpoint 之前要先 build widget。
`.env` 只留在本機；新增設定時要同步更新 `.env.example`，但不要放可用的金鑰或個人的 endpoint。

## 先開 Issue

任何工作都從 Issue 開始，再小也一樣：bug、功能、重構、安全修正、文件更正都算。
動手改之前先開 Issue，並讓它只有一個範圍明確、可以驗證的成果。
審查時發現好幾個問題，就每個問題各開一個 Issue，不要整份審查開成一個。Issue 做到一半多出第二個成果時，就把它拆開。

Commit 跟著 Issue 走。每個 commit 處理一個 Issue，並在 subject 寫出 Issue 編號，讓 git 歷史可以逐個 Issue 閱讀：

```text
fix: block internal addresses in crawler and sitemap fetches (#3)
feat: expose widget theme and position in the widget config api (#16)
```

一個 Issue 可以有多個 commit，例如先改 API，再改使用它的 dashboard。不要把不相關的 Issue 混進同一個 commit；
如果兩個改動真的分不開，就把兩個 Issue 都寫上，並在 PR 中說明原因。

PR 的目的就是關閉 Issue。PR 說明要用關閉關鍵字（`Closes #12`）列出它解決的每個 Issue，一行一個，
merge 時就會自動關閉。主題相關、一起審查比較方便的話，一個 PR 可以關閉多個 Issue；
但 PR 裡不能有任何 Issue 沒描述到的工作。工作中發現新問題時，先為它開 Issue，
再決定是加一個 commit 處理，還是留給之後的 PR。唯一的例外是尚未修復的安全漏洞：
請透過 [SECURITY.md](SECURITY.md) 私下回報，不要開公開 Issue。

### 怎麼寫 Issue

選擇合適的模板：行為有錯用 **Bug report**；新行為或公開介面的變更用 **Feature or design proposal**；
重構、文件、測試、CI、依賴套件與其他雜務用 **Task**。開之前先搜尋 open 與 closed 的 Issue，
已經有人開過就在原 Issue 留言，不要重複開。

Issue 可以用英文或繁體中文寫，哪個能把問題講得最精確就用哪個。程式碼、指令、錯誤訊息與識別字保持原文。
PR 與 commit message 仍然要用英文。

標題寫的是「目前的問題」，而不是你心中的解法，這樣即使最後採用別的做法，標題依然正確。
標題要寫出受影響的元件，並具體到能和類似的 Issue 區分開來：

```text
[Bug]: Widget drops the last token when a stream frame is split
[Proposal]: Let projects choose the reranker per knowledge source
[Task]: API tests do not cover deleting a project with active ingestion jobs
```

內文說明目前的行為，以及完成後可以關閉這個 Issue 的成果，細節要足夠讓其他人接手。
相關的 Issue 與 PR 用編號連結。只使用假資料或已遮蔽的資料。

## 分支與 commit

從最新的 `main` 開始，每個 Issue 開一個分支：

```sh
git switch main
git pull --ff-only
git switch -c feat/123-document-sync
```

分支前綴使用 `feat/`、`fix/`、`refactor/`、`docs/`、`test/`、`ci/` 或 `chore/`，後面接簡短的描述，
並帶上分支一開始處理的 Issue 編號。不要直接 push 到 `main`、改寫共用的歷史，或在功能性 PR 裡混入無關的格式調整。
只 rebase 自己的分支；要改寫別人也在用的分支前，先跟對方協調。

Commit message 用英文，並遵循 Conventional Commits：

```text
feat(ingestion): add source synchronization status
fix(widget): preserve partial stream frames
docs: explain local model configuration
```

格式為 `type(scope): imperative description`，scope 可省略。type 有 `feat`、`fix`、`refactor`、`docs`、
`test`、`ci`、`build`、`perf`、`style`、`chore` 與 `revert`。常用的 scope 包括 `api`、`auth`、`ingestion`、
`rag`、`search`、`providers`、`dashboard`、`widget`、`sdk`、`landing` 與 `docker`。
不相容的公開變更要加 `!` 與 `BREAKING CHANGE:` footer，並在 PR 中說明遷移步驟。
保留有意義的開發 commit，不要只為了讓實作看起來不同而改寫歷史。

## Pull request 與審查

PR 標題與說明用英文撰寫，方便跨團隊審查。標題要簡潔描述改動。
PR 模板參考 Apache Spark 的結構：提出的改動、動機、對使用者的影響與相容性、測試，以及生成式 AI 使用揭露。
用關閉關鍵字列出 PR 關閉的每個 Issue，說明可觀察到的行為與遷移需求，並如實回報實際跑過的檢查，以及沒能跑的檢查。
介面有可見變化時附上截圖；公開介面有變更時附上 API 範例。在指定的段落揭露生成式 AI 的協助，
已知的話寫出工具版本，並說明如何檢查它的產出。

一般改動至少需要作者以外一人 approve。涉及身分驗證、租戶隔離、刪除、schema 或憑證的改動，
還需要熟悉該邊界的審查者。討論結束且 CI 通過後，由 maintainer 負責 merge。
Draft 只用於討論，不可 merge。負責人、merge 方式，以及落實此流程的 repo 設定請見 [MAINTAINERS.md](MAINTAINERS.md)。

## 送審前的檢查

前端相關指令在 repo 根目錄執行：

```sh
pnpm -r build
node apps/landing/build.mjs
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

Python 指令在 `apps/api` 執行：

```sh
uv run --frozen ruff check .
uv run --frozen pytest -q
```

API 測試會隔離開發者的 `.env` 檔與環境變數中的模型憑證，並使用記憶體內的應用程式資料庫。
測試的對象是設定載入本身時，測試可以載入明確指定的暫存設定檔。
單元測試使用假的模型 provider；測試通過不代表真實模型的品質或已可上線。

PostgreSQL 整合測試需要 `TEST_DATABASE_URL` 指向一個裝有 pgvector、可以隨意清除的資料庫。
這些測試會刪除自己建立的資料，絕對不可以指向正式環境的資料庫。
選用的 Qdrant 與 Bedrock 測試需要安裝對應的 extras：

```sh
uv sync --frozen --extra dev --extra qdrant --extra bedrock
TEST_DATABASE_URL=postgresql+asyncpg://embaid:embaid@localhost:5432/embaid uv run pytest -q
```

CI 會準備 PostgreSQL 並安裝這些 extras。本機缺少 extras 或沒設定整合測試的 URL 時，部分測試會被略過；
請在 PR 的測試結果中註明這項限制。provider、crawler 與模型相關的改動，可能還需要用你自己有授權的服務另外做一次實際的 smoke test。
付費或依賴網路的測試，在討論清楚執行條件之前不要加進預設的測試組。

Landing page 有獨立的 build 腳本，不在 pnpm workspace 清單中。上面的 build 指令在 repo 根目錄執行，
並會一併 build 它內嵌的 widget bundle。

## 實作規範

- 遵循既有的模組邊界與型別慣例。provider 專屬的邏輯放在 provider adapter 裡，搜尋專屬的邏輯放在搜尋介面後面。
- 行為改動要加上回歸測試，特別是權限、串流、資料匯入的生命週期與檢索決策。只改文件不需要硬加測試。
- 除非 PR 明確說明相容性變更，否則保留公開的 API 欄位、SSE 事件、SDK exports、widget 屬性與在地化 key。
- 用註解說明不明顯的限制為什麼存在。移除過時的規劃註記、被註解掉的實驗，以及只是重述程式碼的旁白；
  有用的安全性、相容性與演算法說明則保留。
- README 與本指南的英文、繁體中文版本要保持一致，Issue 與 PR 模板也要保留兩種語言，內容以英文版為準。
  介面上看得到的字串要加進兩個語系的翻譯檔。清楚區分已實作的行為、模擬的 demo 與規劃中的功能。
- lockfile 的變更與依賴套件的變更一起 commit。不要 commit 產生的 build 檔、本機資料、虛擬環境、錄影、金鑰、
  token，或客戶／學生的文件。

開發時可以使用工具輔助，包括 AI 工具。貢獻者仍要為理解改動、檢查授權與依賴套件、回報真實的驗證結果負責。
保留署名與必要的聲明；不要捏造作者、測試、benchmark 或審查 approve。機密資料不要放進沒有授權接收它的工具。

安全問題請透過 [SECURITY.md](SECURITY.md) 回報。參與本專案須遵守[行為準則](CODE_OF_CONDUCT.md)。
