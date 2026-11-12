# Portfolio：投資組合檢視

Task 09 已實作唯讀 Dashboard，首頁 `#portfolio` 開放；A-08 由本次任務決定。沿用 React、TypeScript、Vite、viem 與唯一 Sepolia Public Client，沒有新合約、後端或資料庫。學生操作與人工驗收見 [Task 09 指南](../18-portfolio-dashboard.md)。

## A-08 教學估值

計價單位為 **DPLT 教學單位**，不是 USD、TWD、CNY 或市場價格：

| 資產 | 固定教學參考價（DPLT） |
| --- | --- |
| DPLT | 1 |
| DPLT-A | 1/30 |
| DPLT-B | 3/20 |

即 1 DPLT = 30 DPLT-A = 20/3 DPLT-B。AMM 現貨價格只用於比較，不混入預設估值。畫面明確標示「DPLT 教學參考價值，不代表真實貨幣價值。」不提供真實 USD 換算或投資建議。

全部鏈上數量為 18 decimals bigint；A 以最小單位 / 30、B 以最小單位 × 3 / 20 **逐項向下取整**，再相加。顯示通常截到六位小數；非零小額顯示 `< 0.000001`，參考價值不足一個 DPLT 最小單位時顯示 `< 0.000000000000000001`。可展開精確鏈上數值與估值最小單位捨入結果。

## LP 拆解及配置

使用既有 [Token 設定](../../src/config/tokens.ts)與 [Pool 設定](../../src/config/amm.ts)，不修改部署地址。查詢三種 ERC-20 balanceOf、Pool balanceOf／totalSupply／getReserves，及獨立的 Sepolia ETH。

底層 DPLT = floor(studentLP × reserveDPLT / totalSupply)，底層 DPLT-A 同理。先拆解再按固定參考價估值。總額僅加直接持有三種代幣與 LP 底層兩種資產；**LP 面額不再加總**。列表中的 LP 等值是底層兩項小計。

配置分五類：錢包 DPLT、錢包 A、錢包 B、LP 底層 DPLT、LP 底層 A。以估值最小單位計算百分比，向下取到 0.01%，合計可能略低於 100%。全零估值顯示 0%，不繪製假比例。ETH 不納入分母或總額。

供給及 LP 均為零、儲備也為零時權益正常為零。LP 大於供給、零供給有儲備、正供給但儲備為零等矛盾資料顯示不可計算；缺失或 RPC 失敗亦不可計算，不生成假總額。

## AMM 比較

固定價 1 DPLT = 30 DPLT-A；AMM 現貨價 = reserveDPLTA / reserveDPLT。相對差距 = (reserveDPLTA − 30 × reserveDPLT) / (30 × reserveDPLT) × 100%。使用 bigint 計算，差距以絕對值向下取到 0.01%，另外標示正負；不足顯示精度仍標示小額差距。空池、零儲備、缺值或 RPC 失敗不顯示價格或百分比。

池內比例隨儲備改變，不代表外部市場價格；實際成交受手續費及價格衝擊影響。兩價不同不是可保證獲利的套利機會。不以 quoteSwap(1 DPLT) 成交均價取代現貨價。

## 更新及錯誤

僅開啟模組後讀取當前已連接 Sepolia（11155111）帳號。先核對 RPC chain ID，再取得最新區塊編號，所有餘額、ETH、LP 及儲備指定同一 blockNumber；不逐次查 Bytecode／Metadata。區塊編號仍可能受到鏈重組影響，不能保證 RPC 實作或最終確定性。不支援指定區塊時顯示查詢失敗，不回退 latest，不能宣稱快照成功。

無背景輪詢；手動刷新冷卻 30 秒，進行中防重複請求。查詢開始立即清除舊結果；個別失敗顯示「查詢失敗」，依賴該值的總額／配置不可計算，其他成功值仍可查看。全局 RPC／鏈驗證失敗清除結果及更新時間。帳號或鏈切換同步換用新 store，舊請求不能覆蓋新帳號。數值及時間僅代表上次查詢時點，不宣稱持續即時更新。

## 範圍及驗證

只有目前持倉、LP 權益、教學估值、配置、AMM 比較及手動更新。不包含交易按鈕、簽署、approve、transfer、swap 或流動性管理。

Playwright Mock RPC 覆蓋三資產、精確換算／捨入、LP 拆解及矛盾、零持倉、RPC 錯誤、儲備更新、快照、ETH 排除、帳號／網路切換、刷新與桌面／320px。不把 Mock 說成 Sepolia 人工驗收；真實瀏覽器、MetaMask 及 RPC 可用性待人工確認。

後續績效分析須另訂成本基礎、現金流、歷史快照、價格時間序列及方法，再評估索引／儲存依賴。本版不追蹤歷史績效、未實現損益、稅務、跨鏈、真實行情或自動交易。
