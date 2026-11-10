# Task 06：合併前最終整合

## 合併基線與衝突

在乾淨的 `task-06-token`（`3bcbde1`）fetch 最新 `origin/main`（`0e30fef`），確認包含 PR #6（`a1f288f`）與 PR #7（`0e30fef`）。使用一般 merge，沒有 rebase、force push、覆蓋使用者變更或合併至 main。

文字衝突只有 README.md、docs/06-token-contracts.md、docs/07-sepolia-deployment-guide.md。保留 Task 06／A-05 現況，也保留 localhost 部署工具入口、固定教師、操作指南與安全限制；過期的「尚未部署／未開始 Task 06」標為歷史狀態，不抹除使用者提供的部署紀錄與獨立驗證受阻報告。

程式碼雖可自動合併，仍處理三項語意衝突：

1. main 的 Sepolia Public Client 精簡成原生 ETH 專用，不能供 Token 讀取、模擬、Gas 與 receipt 使用。整合採 Task 06 的既有 viem Public Client，保留同一公開 RPC／8 秒 timeout／transport retry 0。PR #7 的 `readPublicRpc` 與驗證引擎仍獨立限制五種唯讀方法，沒有錢包或 signer。
2. 舊 production 掃描將 eth_sendTransaction、encodeDeployData、三個公開代幣地址與教師公開地址都當成洩漏。這與新的學生 transfer 正常功能衝突。現在以真正的 Vite 模組圖拒絕 tools/deploy、tools/verify、scripts/deploy、scripts/verify、scripts/contracts、Hardhat artifacts、虛擬產物與 Solidity 檔；dist 掃描拒絕兩工具專用標記、artifact 格式、Solidity 原文及實際 Hardhat creation/runtime 全文。不是略過隔離檢查：新增正向學生識別字與負向工具／artifact／bytecode 注入測試驗證邊界。
3. manifest 原本把 package.json 全文與 Task 05C-1 比對，會拒絕 PR #6/#7 的新增 npm scripts。調整為完整核對 dependencies、devDependencies、engines、packageManager；合約、Hardhat config、lockfile 原文、compiler binary、Standard JSON input 與完整 runtime（含 metadata）仍鎖定。新增腳本可用，但修改 compiler 依賴仍拒絕。沒有改指紋來容忍未知 bytecode。

## 保留與修改範圍

PR #6/#7 的 `tools/deploy/**`、`tools/verify/**`、`scripts/deploy/artifact.ts`、`scripts/verify/artifact.ts` 與 `origin/main` 完全一致；本機引擎、持久嘗試鎖、Web Locks、明確 MetaMask 確認、Host 限制、唯讀五方法、證據匯出及缺產物策略均保留。兩套 Vite 設定繼續拒絕 build／preview。

三種地址、供給、TeachingToken.sol、hardhat.config.ts、package-lock.json 均未修改。正式 Token 保留三種餘額、完整 runtime／Solidity metadata 指紋、帳號／網路隔離、MetaMask transfer、Gas 預估及 A-05 receipt／替換／重組追蹤。runtime 指紋仍為 `0x88419e5ba519f7ec9b3ec0b822a04597f18b0f1a08b0afe611f3bdae6bbe3105`，1764 bytes。

整合調整主要檔案：

- README.md、docs/06-token-contracts.md、docs/07-sepolia-deployment-guide.md：三份衝突處理。
- src/lib/web3/publicClient.ts：保留 Token 所需公開 RPC actions。
- scripts/contracts/runtime-manifest.ts、test/contracts/RuntimeManifest.test.ts：新增工具指令與固定編譯基線兼容，保留拒絕條件。
- vite.config.ts、scripts/deploy/check-production.ts、tests/deploy/build.test.ts：正式模組圖／內容隔離與正負向回歸。
- docs/01-system-architecture.md、docs/modules/token.md、docs/08-local-deployment-tool.md、docs/09-task-06-runtime-integrity.md、docs/10-local-readonly-verifier.md、本文件：同步整合狀態與證據分級。
- main 的其餘工具、測試、公開紀錄、package.json／tsconfig／CI 變更正常納入。合約 workflow 保留 manifest gate 及全部部署／唯讀工具／瀏覽器回歸；Pages workflow 保留 manifest gate 與正式隔離檢查。

## 本機完整驗證

Node 24.22.1 / npm 11.9.0；套件無版本或 lockfile 變更。npm cache 與 XDG 路徑使用可寫的 /tmp；瀏覽器為系統 Chromium。沒有略過、停用測試或忽略命令失敗。

| 命令 | 結果 |
| --- | --- |
| `npm ci --cache /tmp/dpl-npm-cache` | 通過 |
| `npm run lint` / `npm run typecheck` | 通過 |
| `npm run build` | 通過，含正式模組圖與 dist 隔離；保留既有 viem/ox externalization 與 >500 kB 提示 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- --workers=4` | 186/186，桌面／手機學生網站回歸 |
| `npm run contracts:compile -- --force` | 通過，Solidity 0.8.38 / Cancun |
| `node scripts/contracts/runtime-manifest.ts --check` | 通過，完整 runtime／metadata 指紋不變 |
| `npm run contracts:typecheck` | 通過 |
| `npm run contracts:test` | 30/30，含來源、metadata、可攜與依賴守門回歸 |
| `npm run deploy:test` | 18/18，含真實 Vite 模組圖負向注入與內容掃描 |
| `npm run verify:test` | 28/28，包含本機 EDR 與唯讀安全邊界 |
| `npm run deploy:test:ui` | 3/3，Mock Provider；明確確認、跨分頁未知鎖、Host 拒絕 |
| `npm run verify:test:ui` | 4/4，Mock HTTP；手動查詢、證據匯出、錯誤／缺產物、Host 拒絕 |
| `git diff --check` / 文件相對連結／無衝突標記 | 通過 |

本機工具中的部署／轉帳只發生在 in-process EDR 或 Mock Provider，並非 Sepolia。沒有重新連線真實鏈上查詢、簽署、重新部署或發送真正 ERC-20 transfer。

## 人工合併與發布界線

PR #8 維持 Draft；本次僅合併 main 到工作分支，不自行合併 main 或觸發 Pages。遠端最新 commit 的 Actions run、全步驟成功終態與 mergeable 狀態在 PR #8 及完成報告中記錄，不以本機結果推定遠端成功。

程式整合／CI 完成可供人工審查；真實三地址的獨立鏈上驗證、Etherscan、原部署產物封存、真實 MetaMask／CORS 與課堂驗收仍是尚未完成的發布條件。使用者提供紀錄不是新取得的 RPC 證據。現有 main push 會自動觸發 GitHub Pages，因此人工合併也必須明確考量發布授權與上述條件，不能把「無衝突、CI 成功」宣稱為真實鏈上發布驗收已通過。
