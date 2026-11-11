# Task 07C：DPL Exchange 學生前端

## 交付與固定設定

基底為最新 main `55549d43bcc9b8c89ec27a95a9e8e77dd5467e48`，已確認 PR #10（07A）與 #11（07B）合併。分支 `task-07c-exchange-ui`。本次只完成前端、Mock 測試及文件，不更動合約／依賴版本、不部署、不發真實 Sepolia 交易、不合併或發布網站。

使用者提供的已部署 Exchange 為 `0xd0bc9E38a7fA59C9ee306Ef28D1Fa5B001957e3B`，Ethereum Sepolia / **11155111**；管理者為 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。本次未重新驗證歷史部署或注入，不把 Mock 結果當成真實鏈上驗收。

| 資產 | 模擬幣別 | 固定 ERC-20 地址 |
| --- | --- | --- |
| DPLT | USD | `0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e` |
| DPLT-A | TWD | `0x53Ac929866423479c7C5746F76F398e8b3907d6E` |
| DPLT-B | CNY | `0xA8E2854c62A46329838f9922587adBbEb007072f` |

| 方向 | 固定比例 |
| --- | --- |
| DPLT → DPLT-A | 30/1 |
| DPLT-A → DPLT | 1/30 |
| DPLT-B → DPLT-A | 9/2 |
| DPLT-A → DPLT-B | 2/9 |
| DPLT → DPLT-B | 20/3 |
| DPLT-B → DPLT | 3/20 |

以上均為教學模擬比例，非真實外匯行情。三資產均 18 decimals；金額全程 bigint。UI 比例只供說明，**可執行報價只來自合約 quote()**，例如 1 DPLT → B 為 6.666666666666666666 DPLT-B，合約向下取整，不補浮點誤差。

## 學生操作

1. 在 Wallet 連接 MetaMask，確認 Sepolia；在首頁點 Exchange。
2. 確認三資產餘額、ETH、庫存、paused 與 allowance 查詢成功，選擇不同支付／取得代幣，輸入數量。
3. 按 Max 會填入 `min(餘額, 單筆上限)`。上限為 10 DPLT、300 DPLT-A、66.666666666666666666 DPLT-B，並非每日額度。
4. 按「查詢合約報價」，查看預期收到、同額 minAmountOut、0% 交換手續費與庫存是否足夠。
5. allowance 不足時按「檢查授權摘要」，核對原帳號、Sepolia、支付代幣地址、固定 spender、本次授權數量、既有額度及 Gas。明確按「確認授權並開啟 MetaMask」才請求簽署。
6. 等待 approve Receipt 成功與 allowance 重讀。approve 只授權 Exchange 使用代幣，不發生交換；成功後也不會自動開始 swap。
7. allowance 已足夠時按「檢查交換摘要」，確認支付數量、取得代幣及數量、minAmountOut、餘額、庫存、未暫停與 Gas。明確按「確認交換並開啟 MetaMask」再親自核准。
8. 查看 Swap Success、實際事件取得量、原帳號／鏈／Exchange、原 Hash、Receipt status 與 Etherscan。成功後的三種餘額及庫存由 RPC 重讀。

approve 預設**只授權本次 amountIn**。目前三種 TeachingToken 為標準 OpenZeppelin ERC20，`approve` 會覆寫不足的非零 allowance，不假設所有代幣都需要先歸零。既有足夠 allowance 不再 approve。spender 不可編輯，不提供無限額授權。

兩筆交易各需 Sepolia ETH Gas；固定匯率與 0% 交換費不代表免費。估算各含 20% gas／gas price 餘裕，實際收費仍依鏈上執行；approve 成功之後 swap 仍可能因 Gas、庫存或暫停而失敗。兩筆分別確認，不在網站自動連續發送。

授權可能在 approve 成功但尚未 swap，或 swap 失敗時留下。按手動更新查看 allowance；若不再交換，可自行在 **Sepolia** Etherscan 支付代幣合約的 Write Contract，用原帳號呼叫 `approve(上述 Exchange 地址, 0)` 撤銷，也需 Gas。不要輸入陌生 spender，不必重新部署代幣或 Exchange。

## 安全與錯誤狀態

- 表單只允許固定三資產、不同方向、正十進位數、最多 18 位小數與精確單筆上限；禁止科學記號。合約還會拒絕零輸出。
- 查詢首次進入才啟動，同帳號進行中讀取去重，成功快取 30 秒；手動更新間隔 30 秒，沒有背景輪詢。送出準備及確認前必須重新查詢必要條件，RPC 失敗顯示錯誤，不當成零或沿用可簽署的舊摘要。
- approve／swap 各有 idle、validating、awaiting-wallet、submitted、confirming、success、failed、unknown。Receipt success、至少 1 個區塊、canonical block 與實際交易核對後才成功；swap 額外核對固定 Exchange 發出的 Swap 事件。確認不表示最終不可逆 finality。
- minAmountOut 預設等於本次摘要 quote。報價／Gas 增加／摘要過期（2 分鐘）要求重新確認。輸入、代幣、帳號或網路變更使摘要失效；A → B → A 也不能復用舊 Session。
- 餘額／allowance／Gas／庫存不足、已暫停、錯鏈、模擬失敗或 RPC 故障都阻止發送。拒簽為 failed；交易 revert 與查詢逾時分開呈現。
- 取得 Hash 只表示送出。RPC 逾時或不確定發送為 unknown，保留原 Hash 並允許手動查原交易，阻止再送。不會以查較早成功交易解除另一筆未知交易。若發送回應遺失無 Hash，先查 MetaMask 活動，勿重送。
- 帳號／鏈切換後，已送紀錄仍保留原帳號、11155111 及原 Hash；若原錢包確認視窗仍開啟，應拒絕。已發送交易可在新帳號或錯鏈時透過唯讀 Sepolia Public Client 查詢，資料不會套用到新帳號。
- 紀錄僅在本頁記憶體；重新整理前保存 Hash。不處理主網、任意代幣、後端、AMM、LP 或 Portfolio。

## 實作與 viem API

- `src/config/exchange.ts`：固定 Exchange／管理者／鏈、來源 commit、學生最小 ABI（quote、swap、reserveOf、paused、Swap 與必要錯誤）、輸入上限及顯示比例。
- `src/modules/exchange/components/`：延遲啟動入口、支付／取得／Max／方向、查詢、摘要、獨立交易結果與繁中教材。
- `src/modules/exchange/services/`：輸入驗證、快取讀取、preflight、簡單外部 store 與 Receipt 核對。
- `src/modules/exchange/types/`：報價、快照、摘要與交易型別；`index.ts` 為 App 公開入口。
- `src/modules/token/index.ts` 只新增既有 assertSession／tokenError／型別的公開匯出；Token 轉帳與 Wallet Provider 實作不改。
- HomePage、ModuleCard、modules 設定與 global.css 啟用 Exchange 並沿用既有視覺；首頁測試同步新入口。

沿用唯一 `sepoliaPublicClient`，使用 `readContract`、`getBalance`、`getChainId`、`simulateContract`、`estimateContractGas`、`getGasPrice`、`waitForTransactionReceipt(confirmations: 1)`、`getTransactionReceipt`、`getBlock`、`getBlockNumber`、`getTransaction`。金額為 `parseUnits`／`formatUnits`，交易 ABI 以 `encodeFunctionData` 編碼，再用 `createWalletClient`／`custom({retryCount: 0})`／`sendTransaction` 將精確 calldata 交給 MetaMask。Swap 收到量由 `decodeEventLog` 核對 Receipt 事件；未使用 ERC-20 transfer 取代 swap。

正式 bundle 不匯入 Hardhat artifact／creation bytecode／Solidity source／localhost 工具。沿用現有 build 隔離守門，沒有重做歷史 runtime／metadata 或 Archive RPC 驗證。

## 自動驗證

使用既有 Playwright 與 Mock Provider／RPC，所有交易只在測試替身，不接觸真實 Sepolia。測試檔為 `tests/e2e/exchange-service.spec.ts` 與 `tests/e2e/exchange.spec.ts`。

```sh
npm ci --cache /tmp/dpl-npm-cache
# 既有 build 隔離守門需要本機 artifact；不部署、不重建歷史 runtime manifest。
XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache XDG_DATA_HOME=/tmp/dpl-data npm run contracts:compile
npm run lint
npm run typecheck
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test tests/e2e/exchange-service.spec.ts tests/e2e/exchange.spec.ts tests/e2e/wallet.spec.ts tests/e2e/wallet-store.spec.ts tests/e2e/token.spec.ts tests/e2e/token-service.spec.ts tests/e2e/home.spec.ts tests/e2e/faucet.spec.ts tests/e2e/faucet-utils.spec.ts --workers=4
git diff --check
```

Windows 可省略 XDG 環境變數，Chromium 路徑依本機調整，或使用已安裝的 Playwright Chromium。結果於完成測試後記錄於下方。

涵蓋六方向報價與實際 swap calldata／事件、18 decimals／捨入、零值／非法值／精度／單筆上限／相同代幣、餘額／庫存／暫停／Gas／錯網路、足夠或不足授權、非零額度覆寫、approve 成功重讀／拒簽／receipt revert／成功未 swap、swap 模擬失敗／success／revert／unknown、過期及確認前條件變更、帳號／網路切換、雙擊、成功刷新、RPC 失敗、快取去重及桌面／手機介面；另跑 Wallet／Token／Faucet／首頁回歸。

2026-11-11 本機驗證結果：

| 檢查 | 結果 |
| --- | --- |
| lint | 通過 |
| typecheck | 通過 |
| build | 通過，含 Pages 產物隔離；保留既有 >500 kB chunk 提示及 viem 相依的 node:worker_threads browser externalization 提示 |
| Exchange 測試 | **132 passing**：58 個服務案例＋8 個 UI 案例，各跑 desktop／mobile 設定 |
| Wallet／Token／Faucet／首頁回歸 | **160 passing**，含桌面／手機 |
| 合計 | **292 passing，0 failing** |
| git diff --check | 通過 |

依賴及 lockfile 未變。既有 build 守門需要 artifact，因此僅本機編譯既有合約；沒有執行無關歷史 runtime／metadata 稽核或任何部署工具。桌面／手機截圖已檢視，版面無水平溢出。GitHub Actions 為推送 Draft PR 後另外觀察，狀態不等於真實 Sepolia 人工驗收。

## 真實 Sepolia 人工驗收（本次未執行）

這些步驟供維護者後續人工執行，不是本次代理的鏈上操作授權：

1. 在本機 Chrome＋MetaMask 用測試帳號 A／B，確認網站版本、三代幣與 Exchange 固定地址、Sepolia 11155111，準備各方向所需代幣及 ETH。用手動查詢確認真實 CORS／RPC、三餘額、reserveOf、paused 與 allowance。
2. A 先用小額 1 DPLT → A，比對 quote 為 30 DPLT-A；查看固定 spender 及精確 amountIn 授權。先拒簽一次，確認無交易，再重新明確核准 approve。
3. 確認 approve Hash／Receipt、Gas 支出、allowance 更新；此時沒有 swap，代幣未交換。另行確認 swap，核對 calldata、同額 minAmountOut、Receipt／Swap 事件、實際餘額與庫存。
4. 用 A、B 分別驗收六方向與小數捨入，先測足夠 allowance 跳過 approve、非零不足額度覆寫、Max 上限；每次鏈上交易都需人工明確確認，不自動連續發送。
5. 變更輸入、切帳號、切錯鏈、等待 2 分鐘過期，確認舊摘要不能送出；已發送 Hash 仍屬原帳號／Sepolia。保留每筆 Hash 與 Receipt，不宣稱 finality。
6. 真實 pending 時只查原 Hash，不為測試刻意重送或耗盡資產。RPC 斷線、庫存不足與 pause 等破壞性場景以 Mock 測試為主；不要為驗收擅自操作教師 pause／提領。
7. 檢查桌面投影與手機版、Wallet／Faucet／Token 流程；行動端僅驗收版面，本版仍限 MetaMask 瀏覽器擴充功能，不提供手機跨 App 錢包連接。試教前確認 30 人 RPC 容量與測試資源，無需用大量鏈上交易做壓力測試。
8. 若留下 allowance，用原帳號於 Sepolia 手動撤銷並保存結果；記錄環境、實際 Hash、Receipt、Gas、更新後餘額與未通過事項。發布及合併需另行授權。
