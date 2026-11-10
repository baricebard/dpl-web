# Task 05：ERC-20 教學代幣

> Task 05C-2 更新：已提供[本機 MetaMask 部署工具](08-local-deployment-tool.md)，固定部署者與 initialHolder 為 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。以下保留先前準備紀錄；使用本機工具時以 08 指南的固定地址、產物檢查與安全流程為準。此句為工具開發當時的狀態；最新使用者提供紀錄及獨立驗證限制見下方 Task 06 補記。

## Task 06 現況補記

使用者已提供三個 Ethereum Sepolia 部署地址（11155111），已納入 [Token 公開設定](modules/token.md)，本文件下列 Task 05 未部署敘述屬當時歷史狀態。Task 06 不重新部署合約；本次唯讀 RPC 存取受阻，不能宣稱新鏈上核對完成。main 已合併本機部署與唯讀驗證工具，並保留使用者提供的[部署紀錄](09-sepolia-deployment-record.json)及[獨立驗證受阻報告](09-sepolia-deployment-verification.md)；紀錄不是新取得的 RPC receipt 證據；Etherscan 原始碼驗證與歷史 runtime bytecode 完整比對仍未完成。

A-05 已於 Task 06 決定至少 1 個區塊確認、canonical block 及實際交易內容核對、替換／取消與未知結果處理，以及記憶體紀錄策略，詳見 [Token](modules/token.md)與 [驗收紀錄](08-task-06-validation.md)。

## Task 05 歷史狀態與決策

Task 05 從包含 Task 01～04 的 `origin/main`（`91ba9de`）建立 `task-05-erc20`。只完成本機合約、測試及部署準備，**尚未部署 Sepolia**，沒有實際合約地址或交易 Hash。Token UI 仍未開放；沒有開始 Task 06、發送公用網路交易、索取或設定私鑰。

### A-03：固定供給與無管理權限

| Name | Symbol | Decimals | 每個實例初始供給 |
| --- | --- | --- | --- |
| DeFi Portfolio Lab Token | DPLT | 18 | 1,000,000 |
| DeFi Portfolio Lab Asset A | DPLT-A | 18 | 1,000,000 |
| DeFi Portfolio Lab Asset B | DPLT-B | 18 | 1,000,000 |

目標為 Ethereum Sepolia（11155111），僅零真實資金教學用途。每個實例的 constructor 供給為 `1000000000000000000000000` 基礎單位（`1_000_000n * 10n ** 18n`），不使用浮點數。

`contracts/TeachingToken.sol` 是唯一 Solidity 原始碼，繼承 OpenZeppelin ERC20，constructor 接受名稱、symbol、初始持有人及整數供給量；同一份原始碼部署三次，地址、餘額、allowance 與 totalSupply 各自獨立。constructor 的 `_mint()` 一次將全部供給交給**明確指定的教師地址**，不隱含使用部署者。零地址由 OpenZeppelin `ERC20InvalidReceiver` 拒絕；不合法地址格式在 TypeScript 準備階段與 ABI 編碼時拒絕。

合約本身允許呼叫者選擇初始供給；三個正式教學實例的數值由共用規格與 Ignition 模組固定。部署後沒有 mint、burn、owner、管理員、pause、proxy、升級、稅費、黑名單、凍結或自動扣款功能。只提供標準 ERC-20 metadata、餘額、供給、transfer、approve、allowance、transferFrom 與 Transfer／Approval 事件；不重寫 OpenZeppelin 的餘額或授權行為。有限 allowance 在 transferFrom 後減少；OpenZeppelin 的最大 uint256 allowance 採標準無限授權語意，但未來網站不應要求無限授權。

### A-04：教師錢包分發

教師錢包統一持有三種初始供給，再於 Sepolia 以一般 transfer 分發至學生地址。學生不需購買主網資產取得教學代幣；ERC-20 無法支付 Sepolia Gas，學生後續轉帳仍需原生 Sepolia ETH。現有 Faucet 只提供 ETH 餘額與外部領取指引，沒有 ERC-20 自動領幣。

30 人課堂可先規劃每人每種 1,000 tokens（每種共 30,000），每種保留 970,000 供後續交換、流動性池、投資組合練習及補發；這是課前規劃建議，未執行分發，也未決定未來池的資產比例或價格。教師課前核對地址、Gas、實際餘額及收款結果。本次沒有教師 UI、自動 Faucet、批次分發合約或學生名冊；未來分發工具另案設計。

### A-05：後續交易最低確認原則

Task 06 才實作前端交易。本次記錄以下原則：

- 使用者必須自行於錢包確認；取得 Hash 只代表已送出，不能標記成功。
- 至少取得交易 receipt 且 `status = success` 才能標記成功，revert receipt 必須標記失敗。
- 分別顯示拒絕簽署、鏈上失敗、RPC 逾時與結果未知。逾時不等於交易失敗，保留原鏈、原帳號及 hash 供查詢。
- 交易失敗或查詢逾時不得自動重送；先查原 hash，避免重複轉帳。
- 帳號／網路切換即使舊請求尚未結束，也不得沿用舊交易授權或簽署狀態。
- 進一步確認區塊數、重組、交易替換及本機紀錄策略，留待 Task 06 實作前決定；本機測試的 receipt 成功不代表已完成這些策略。

## 工具鏈與相容性

2026-11-10 核對官方 npm 套件 metadata、Hardhat 隨套件提供的 `templates/01-node-test-runner-viem`、Toolbox README 與 compiler path 設定型別後，採以下穩定版並鎖入既有 npm lockfile：

| 工具 | 版本／設定 |
| --- | --- |
| Node.js / npm | 24.22.1 / 11.9.0（沿用專案） |
| Hardhat | 3.21.2 |
| 官方 viem Toolbox | 5.0.7 |
| Hardhat Ignition | 3.1.9（直接 import，明確列為開發依賴） |
| Solidity / npm solc | 0.8.38 / 0.8.38（完整 build：`0.8.38+commit.1835d247.Emscripten.clang`） |
| OpenZeppelin Contracts | 5.6.1 |
| TypeScript / viem | 6.0.3 / 2.57.17（沿用前端） |
| Compiler settings | optimizer enabled、runs 200、evmVersion cancun |

Toolbox 5.0.7 的 peer ranges 為 Hardhat `^3.8.0`、viem `^2.47.6`，接受現有 viem；Node 24 為 Hardhat 3 支援的 LTS 系列。未升級或降級任何既有前端依賴版本。為避免 npm 加入 Hardhat 後將原有共用 Zod 4.6.7 重解析成 3.x，明確新增 devDependency `zod: 4.6.7` 保留原版本，讓 Hardhat 的 Zod 3 相容依賴由 npm 分別安裝於其子樹；以 `npm ci` 與 lockfile 版本比對確認。合約工具鏈加入根 package 的 devDependencies，無須另一份 lockfile 或 workspace；若未來發生版本衝突，再考慮獨立工具鏈。

`hardhat.config.ts` 指定 `contracts/` 與 `paths.tests.nodejs = test/contracts/`，使用官方 Node.js Test Runner；Playwright 繼續只找 `tests/e2e/`。`tsconfig.contracts.json` 使用 NodeNext，與前端 Bundler 設定分離。Hardhat 生成的 ABI 型別位於忽略的 artifacts，合約型別檢查前先 compile。Solidity compiler 使用 lockfile 鎖定的 npm `solc/soljson.js` 自訂路徑，避免依賴另一次 compiler 主機下載；版本與 pragma 相同。前端不 import Hardhat、Ignition 或產物。新增的 `.github/workflows/contracts.yml` 僅執行本機 compile／型別檢查／測試，不含部署或 secrets；既有 Pages 工作流程不變。

官方參考：[Hardhat 3](https://hardhat.org/docs/)、[Node 支援](https://hardhat.org/docs/reference/nodejs-support)、[viem Toolbox](https://www.npmjs.com/package/@nomicfoundation/hardhat-toolbox-viem)、[Ignition](https://hardhat.org/ignition)、[OpenZeppelin ERC20](https://docs.openzeppelin.com/contracts/5.x/erc20)、[Solidity compiler](https://www.npmjs.com/package/solc)。

## 本機驗證

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run contracts:compile
npm run contracts:typecheck
npm run contracts:test
git diff --check
```

Playwright 執行前需 production build 與 Chromium，安裝方式沿用 README；已有系統 Chromium 可使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`。受限雲端環境若使用者家目錄不可寫，可於 shell 設定 `npm_config_cache=/tmp/dpl-npm-cache` 與 `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache XDG_DATA_HOME=/tmp/dpl-data`；不需修改專案或 HOME。

合約測試使用 Hardhat EDR 本機模擬網路及其測試帳號：21 項合約測試、3 項部署準備檢查，共 24 項。涵蓋三種名稱／symbol／18 decimals／初始供給、教師與部署者分離、mint／transfer／Approval 事件、正常與失敗轉帳、approve／transferFrom／allowance、零初始地址、無額外公開權限、實際 Ignition 三實例獨立性、無稅、1 基礎單位與小數精度、固定供給與標準零額／自身轉帳。**本機通過不代表 Sepolia 測試成功。**

## 部署準備流程（本次不部署）

Task 05C-1 的 [Remix + MetaMask 操作指南](07-sepolia-deployment-guide.md)補充由使用者錢包自行簽署的部署途徑，不依賴尚未實作的 Hardhat 遠端 signer；仍須先確認實際 chain ID、編譯產物與四個參數，並另行取得部署授權。本次只準備文件，尚未部署。

- `scripts/contracts/spec.ts`：單一代幣規格來源、bigint 供給、目標 chain ID 及公開教師地址驗證。地址必須非零、格式有效；混合大小寫須符合 checksum。
- `scripts/contracts/prepare.ts`：離線輸出三個 constructor argument sets，不連線、不簽署。
- `scripts/contracts/preflight.ts`：先驗證輸入，再透過 HTTPS RPC 實際 `eth_chainId` 檢查 11155111，錯鏈或 RPC 失敗直接停止，不重試、不發交易。
- `ignition/modules/TeachingTokens.ts`：以 `TeachingTokens.initialHolder` 必填參數建立 DPLT、DPLTA、DPLTB 三個 future；名稱／symbol／供給由共用規格提供。零地址仍由合約拒絕。模組已在本機測試。
- Hardhat 只設定 EDR，**未設定任何 HTTP 公用網路或 deploy script**，因此目前不能直接用本專案命令部署 Sepolia／Mainnet。模組本身是可重用計畫，RPC 預檢是未來部署流程的必要步驟，不宣稱 Ignition 模組自行驗證 RPC。

離線準備時由操作者提供公開資料（以下變數值須自行設定，未提供地址範例）：

```sh
TOKEN_CHAIN_ID=11155111 TEACHER_ADDRESS="$teacher_public_address" npm run contracts:prepare
```

未來獲得部署授權後，先核對教師地址與其控制權，選定支援的外部簽署方式；不要求將私鑰寫入設定、前端、log 或 Repository，不在聊天中索取私鑰。以執行環境提供的 RPC 設定跑唯讀預檢：

```sh
TOKEN_CHAIN_ID=11155111 TEACHER_ADDRESS="$teacher_public_address" SEPOLIA_RPC_URL="$sepolia_rpc_url" npm run contracts:preflight
```

預檢目前未對真實 RPC 執行。未來部署工作需在加入 Sepolia HTTP 設定時明確指定 chainId 11155111，於實際簽署之前再次取得 RPC chain ID，並核對教師地址、三組參數與供給；不可只依網路名稱或傳入的環境變數判斷。將已核對的公開地址填入 Ignition 參數 JSON 的 `TeachingTokens.initialHolder`，參數、離線計畫及實際送出參數必須一致。部署工具應在同一流程強制完成預檢後才可簽署；這個遠端執行器與秘密管理整合尚未實作，需在部署授權工作完成，不能直接略過預檢操作模組。

每個部署需等待成功 receipt、核對三個不同地址的 bytecode、metadata、教師 balance 與 totalSupply，然後記錄下表。Compiler cache、artifacts、node_modules、Ignition deployments 與環境設定均不提交。

## 部署與合約驗證紀錄

| 欄位 | DPLT | DPLT-A | DPLT-B |
| --- | --- | --- | --- |
| 狀態 | 待部署 | 待部署 | 待部署 |
| Network / Chain ID | Ethereum Sepolia / 11155111 | Ethereum Sepolia / 11155111 | Ethereum Sepolia / 11155111 |
| 合約地址 | 待部署 | 待部署 | 待部署 |
| Compiler | 0.8.38 | 0.8.38 | 0.8.38 |
| OpenZeppelin | 5.6.1 | 5.6.1 | 5.6.1 |
| 初始持有人 | 待部署時提供 | 待部署時提供 | 待部署時提供 |
| 初始供給（基礎單位） | 1000000000000000000000000 | 1000000000000000000000000 | 1000000000000000000000000 |
| Decimals | 18 | 18 | 18 |
| 部署交易 Hash | 待部署 | 待部署 | 待部署 |
| 部署區塊／Commit | 待部署 | 待部署 | 待部署 |
| Etherscan 驗證狀態／連結 | 待部署，未驗證 | 待部署，未驗證 | 待部署，未驗證 |

未來以 Hardhat verify／Ignition verification 提交各地址的完整來源、精確 compiler build、optimizer 200、Cancun 與各自四個 constructor args（供給用整數字串）；如需 Etherscan API Key，從執行環境的秘密管理注入，不能用 `VITE_*`。核對 Sepolia Etherscan 的來源／bytecode 與鏈上部署相符，再更新驗證狀態與連結；驗證失敗不可標記完成。未來應保存 compiler standard JSON／build info 的可追溯交付副本於適當外部產物保存機制，而非將 artifacts 提交到 Git。

## Task 06 依賴更新與尚未驗證事項

Task 06 已使用任務提供的三個 Sepolia 地址建立共用設定、餘額、摘要、轉帳與 Mock 測試，A-05 已完成策略決策，見 [Token 模組](modules/token.md)。本次 RPC 唯讀存取受阻；真實合約 metadata、CORS、配額、Gas 與 30 人供給仍需課前核對。Etherscan 原始碼驗證、歷史 runtime bytecode 及實際部署 receipt 封存未完成，不能用本機測試補作鏈上證據，亦不因此重新部署。

前端引用單一標準 ERC-20 ABI 與 `(chainId, contractAddress, name, symbol, decimals)` 公開設定，執行時核對 code、metadata 與供給才開放對應轉帳。真實 MetaMask、真實兩帳號轉帳及課堂分發驗收尚未由本次 Mock／本機 EDR 測試完成。

## 本次驗證結果（2026-11-10）

| 檢查 | 結果 |
| --- | --- |
| npm ci | 通過；既有直接及 lockfile 套件版本均保留 |
| npm run lint / npm run typecheck | 通過 |
| npm run build | 通過；仍有 worker_threads 瀏覽器 externalization 與大於 500 kB bundle 提示，未造成失敗 |
| npm test（系統 Chromium） | 完整重跑 60/60 通過，桌面與手機均涵蓋 |
| npm run contracts:compile | 通過，Solidity 0.8.38 / Cancun |
| npm run contracts:typecheck | 通過 |
| npm run contracts:test | 24/24 通過（21 項合約、3 項準備檢查），僅本機 EDR |
| git diff --check / 更新文件相對連結 | 通過 |

首輪 Playwright 有一項桌面鍵盤 Tab 焦點逾時（59/60）；該項單獨重跑及完整 60 項重跑均通過。未改動前端程式或測試來略過此情境，保留此偶發結果供後續觀察。合約測試執行後，獨立型別檢查曾發現測試用 ABI holder 缺少 address，已改用實際本機部署實例並重新通過檢查。遠端 GitHub Actions 結果須以 PR checks 為準，不以本機結果代替。
