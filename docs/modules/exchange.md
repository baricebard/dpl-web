# Exchange：DPL Exchange

## 責任與階段

Task 07A 依使用者決策完成 A-06 的固定匯率合約、本機測試與部署準備。首頁 Exchange 仍未開放，尚未部署 Sepolia，Task 07B／07C 尚未開始。完整 API、安全、部署及驗證見 [固定匯率交換](../12-fixed-rate-exchange.md)。

此平台用 DPLT／DPLT-A／DPLT-B 模擬 USD／TWD／CNY，價格為教學自訂，不連接真實外匯市場、不代表真實資產價格。交換使用教師準備的庫存，沒有 AMM 定價曲線、池或 LP 份額；[Liquidity](liquidity.md) 仍是獨立未來模組。

## A-06 已決定的規格

| 輸入 → 輸出 | 精確比例 |
| --- | --- |
| DPLT → DPLT-A | 30/1 |
| DPLT-A → DPLT | 1/30 |
| DPLT-B → DPLT-A | 9/2 |
| DPLT-A → DPLT-B | 2/9 |
| DPLT → DPLT-B | 20/3 |
| DPLT-B → DPLT | 3/20 |

三種資產均為標準 18 decimals ERC-20。合約地址、比例不可修改，無交換費用。以最小單位整數乘分子再除分母、無條件捨去，拒絕零輸入／零輸出。往返捨入不增加代幣。

每筆輸入最多 10 DPLT 等值：10 DPLT、300 DPLT-A、200/3 DPLT-B。B 的精確比較為 `amountIn * 9 <= 600 * 10^18`，實作用等價的 `amountIn <= floor(600 * 10^18 / 9)` 避免溢位。非每日／身分配額，多筆仍可累積交換。

`DPLFixedExchange` 使用 IERC20、SafeERC20、Ownable、Pausable、ReentrancyGuard。明確 constructor 管理者與部署者分離；只可管理內部庫存，不能從學生錢包任意扣款，也不能修改三代幣供給。管理者可 pause／unpause／withdrawReserve，暫停期間仍可提領；學生須自行 approve 並呼叫 swap。

## 合約與未來介面

- `quote(tokenIn, tokenOut, amountIn)`：唯讀精確報價，同時驗證代幣、數量及單筆額度；不保證庫存、allowance 或未暫停。
- `swap(tokenIn, tokenOut, amountIn, minAmountOut)`：驗證最低輸出與真實庫存後，原子執行 transferFrom／transfer，發出 Swap。
- `reserveOf(token)`：實際 balanceOf；只接受三個白名單資產。
- `withdrawReserve(token, amount, recipient)`：僅 owner、非零數量與收款地址；發出 ReserveWithdrawn。

Task 07C 預期依賴 Wallet 與 Token 公開介面。先核對帳號、Sepolia、正式合約地址、最新餘額、Gas、庫存與暫停狀態，讀 quote，再清楚顯示 spender、數量與摘要。標準 `approve(exchange, amountIn)` 預設只授權本次量；approve 與 swap 是兩筆獨立交易，approve 不會交換代幣。交換失敗時既有授權可能仍保留，應提供查詢／撤銷說明。切換帳號／網路、金額變更使摘要失效；receipt 前不得顯示成功，不自動重送。

## 驗證及後續

本機 EDR 測試涵蓋六方向、精度、額度邊界、授權／餘額／庫存／最低輸出不足、權限、暫停、提領、事件、資產守恆、輸出失敗回滾及重入。測試使用本機部署實例，不以真實 Sepolia 地址作替身。

Task 07B 待另行授權：部署／來源驗證、公開紀錄、人工庫存注入及鏈上核對。Task 07C 待另行授權：報價／最小授權／交換介面、receipt 與失敗流程、真實兩帳號驗收。本次未執行上述工作。
