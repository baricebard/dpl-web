# Exchange：DPL Exchange

## 責任與目前狀態

Task 07A PR #10 與 Task 07B PR #11 已合併。Task 07C 從最新 main `55549d43bcc9b8c89ec27a95a9e8e77dd5467e48` 實作學生前端，首頁 `#exchange` 開放固定匯率交換。部署地址由使用者在 Task 07C 提供：Ethereum Sepolia（11155111）`0xd0bc9E38a7fA59C9ee306Ef28D1Fa5B001957e3B`。這是使用者提供的部署／注入紀錄，本次沒有獨立聲稱完成真實 RPC、MetaMask 或鏈上人工驗收。

學生操作、測試結果與人工驗收見 [Task 07C 前端指南](../14-exchange-frontend.md)；合約 API 與本機合約測試見 [Task 07A](../12-fixed-rate-exchange.md)，教師 localhost 工具見 [Task 07B](../13-exchange-deployment.md)。本次不修改 Solidity、不部署、不注入庫存、不執行真實 approve 或 swap，也不發布網站。

## 六方向與限制

DPLT／DPLT-A／DPLT-B 模擬 USD／TWD／CNY，是教學自訂比例，不是真實行情。

| 輸入 → 輸出 | 精確比例 |
| --- | --- |
| DPLT → DPLT-A | 30/1 |
| DPLT-A → DPLT | 1/30 |
| DPLT-B → DPLT-A | 9/2 |
| DPLT-A → DPLT-B | 2/9 |
| DPLT → DPLT-B | 20/3 |
| DPLT-B → DPLT | 3/20 |

三種資產皆為 18 decimals；金額使用 bigint、parseUnits、formatUnits。正式報價一律讀合約 `quote()`，最小單位向下取整，零輸出拒絕。單筆上限為 10 DPLT、300 DPLT-A、`floor(600e18/9)` 個 DPLT-B 最小單位（66.666666666666666666 DPLT-B）；Max 取錢包餘額與上限較小值。禁止相同代幣及任意地址。

合約比例不可修改，交換手續費 0%，仍需 Gas。教師庫存支應輸出；owner 可暫停／提領庫存。沒有 AMM 曲線、流動性池或 LP 份額，[Liquidity](liquidity.md) 保持未開放。

## 使用與交易契約

1. 重用 `useWallet()` 及 Transaction Session，確認 MetaMask 與 RPC 皆為 Sepolia。
2. 初次開啟 Exchange 才查三種 balanceOf、reserveOf、allowance、ETH 與 paused；同帳號進行中查詢去重、成功快取 30 秒，無背景輪詢。手動更新間隔 30 秒，失敗清除可顯示資料並明確提示，不補零。
3. 選擇不同資產、輸入正數及最多 18 位小數，按「查詢合約報價」。報價有效 2 分鐘，變更數量／代幣／帳號／網路即失效。
4. allowance 不足先檢查 approve 摘要，核對 spender 為固定 Exchange、本次 amountIn、既有額度與 Gas，再明確確認開啟 MetaMask。標準 OpenZeppelin ERC20 的 approve 覆寫既有非零額度，不需要先歸零，不要求無限授權。
5. approve receipt success、至少 1 個區塊並核對原始交易後才顯示授權成功，重新讀取 allowance；查詢失敗或仍不足不得進入 swap。授權成功不代表交換成功，不自動呼叫 swap。
6. allowance 已足夠可跳過 approve。swap 準備及送出前均重查 quote、輸入餘額、allowance、輸出庫存、paused，執行 simulateContract、Gas 估算與 ETH 檢查。minAmountOut 等於摘要中的 quote，報價或 Gas 增加／摘要過期需重新確認。
7. 明確確認後僅呼叫 Exchange `swap(tokenIn, tokenOut, amountIn, minAmountOut)`；不以 ERC-20 transfer 取代交換。
8. approve 與 swap 分別追蹤 idle／validating／awaiting-wallet／submitted／confirming／success／failed／unknown。Hash 不代表成功；Receipt 成功且至少 1 個區塊、canonical block 與實際 from／to／calldata／value 核對通過，swap 還須有符合的 Swap 事件，才顯示成功。這不是 Ethereum finality。
9. 交換成功重新查三資產餘額、allowance、庫存及 ETH；顯示實際收到量、原帳號／鏈／Exchange／Hash／Receipt 與 Etherscan。

結果未知保留 Hash、不自動重送，阻止新授權與交換，允許手動查原交易。送出回應遺失而無 Hash 時，先查 MetaMask 活動，不提供繞過未知鎖定。帳號／鏈切換使未送摘要失效，已送交易仍保留原帳號與鏈追蹤；原帳號查詢不會覆蓋新帳號資料。紀錄只存本頁記憶體，重新整理前保存 Hash。

approve 成功但未交換／交換失敗時可能仍有授權。提供 allowance 查詢與 Sepolia Etherscan 支付代幣 `approve(exchange, 0)` 的手動撤銷說明，撤銷另需 Gas；本次不建立授權管理平台。

## 模組邊界

`src/config/exchange.ts` 集中固定地址、鏈、ABI、顯示比例及輸入上限，ABI 只保留學生方法、事件與相關 custom errors，追溯合約來源 PR #10 commit。前端不載入 artifact、creation bytecode、Solidity source 或 localhost 工具。

`src/modules/exchange/` 包含入口／介面、簡單服務／交易 store 與型別。重用 Wallet 公開 API、Token 公開的 Task 06 Session／錯誤工具、既有代幣設定／ERC-20 ABI 及唯一 Sepolia Public Client，不新增 Provider 或 RPC 基礎架構。Token transfer 邏輯不變。
