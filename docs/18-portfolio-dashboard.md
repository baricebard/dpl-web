# Task 09：Portfolio Dashboard

PR #16（Task 08C-UX）已合併，開發基線為 main `f688d0a3b0bc90ff1d3c78b00560402c6f106882`。Task 09 僅提供 Ethereum Sepolia 唯讀 Portfolio，不改合約、不部署、不簽署交易、不移動學生資產；完成後不開始 Layer 2。

## 學生操作

1. 在 Wallet 連接目前帳號並確認 Ethereum Sepolia（Chain ID 11155111）。
2. 首頁 Portfolio 點「開啟投資組合」，查看我的教學總資產、帳號、時間與指定區塊。
3. 查看三種代幣錢包數量與 DPL-LP；LP 權益區列出份額、底層 DPLT／DPLT-A 與估值小計。
4. 查看配置長條圖。五類區分錢包與 LP 底層，LP 面額不重複計值。
5. 閱讀固定參考價與 AMM 現貨價比較；Sepolia ETH 單獨用於 Gas 教學，不納入 DPLT 總額。
6. 餘額變更後按「手動重新整理」，更新後有 30 秒冷卻。沒有自動輪詢；以最後更新時間判斷資料時點。可展開精確鏈上數值。

## A-08 與公式

DPLT 是教學計價單位；1 DPLT = 30 DPLT-A = 20/3 DPLT-B。因此 DPLT、A、B 參考價為 1、1/30、3/20 DPLT。這是固定教材參考價，不是真實 USD／TWD／CNY；不提供真實貨幣換算。

LP 底層每項 = floor(studentLP × reserve / totalSupply)。總額 = 直接持有 DPLT + floor(直接 A / 30) + floor(直接 B × 3 / 20) + LP 底層 DPLT + floor(LP 底層 A / 30)，全部使用 bigint 最小單位。LP 本身只作憑證數量，不能再按面額加總。詳細精度、矛盾檢查、百分比分類見 [Portfolio 規格](modules/portfolio.md)。

例如錢包 10 DPLT、300 A、20 B，持有池 10% 份額，池有 100 DPLT／3000 A，LP 底層為 10 DPLT／300 A，教學總估值為 43 DPLT；ETH 不影響此數字。

AMM 現貨價是 reserveA / reserveDPLT，與固定 30 比較相對差距，不作本頁估值來源。池比例隨交易及儲備改變，實際成交受到費用及價格衝擊影響；價差不保證可獲利套利。

## 資料及失敗處理

沿用固定公開地址、最小既有 ABI 與 Public Client，指定同一區塊編號查詢三種 balanceOf、Pool balanceOf／totalSupply／getReserves 與 ETH。RPC 不支援時不回退最新區塊混讀；錯誤明確顯示查詢失敗／不可計算。區塊編號仍有重組限制。成功讀取不是每次 Bytecode 或 Metadata 驗證。

刷新會清除舊結果，失敗不顯示假資產下降；帳號／網路變更立即清除舊帳號資料，晚到請求不能覆蓋新帳號。全部持倉零正常顯示零，空池不生成 AMM 價格。正 LP 配零供給等矛盾資料不推算權益。

## 本機驗證與人工待辦

執行 lint、typecheck、build、Portfolio Mock RPC／Playwright、受影響的首頁與 Wallet／Token／Exchange／AMM 回歸及 git diff --check。lint、typecheck、build（含正式產物隔離）及 git diff --check 通過；相關測試 442 passing（Portfolio 38、首頁／Wallet／Token／Exchange／AMM 404）。最後 LP 配置小計與冷卻顯示調整後重跑 Portfolio 38 passing，桌面及 320px 無水平溢出，已檢視截圖。文件本機連結檢查通過。本機 Mock 不等於真實 Sepolia 驗收。

乾淨環境缺少既有 build 產物隔離檢查所需 artifacts，僅為此檢查本機執行既有 contracts:compile；未修改 Solidity、執行合約測試或歷史 Runtime／Metadata 驗證，產物不提交。

人工需確認真實 MetaMask 帳號連接／切換、Public RPC／CORS 與指定區塊支援、已有兩帳號三種餘額及 LP 對照、手機顯示與課堂 RPC 容量。只讀檢視既有資產即可，不需為驗收簽署或移動資產。

後續歷史績效、未實現損益、成本基礎、稅務與跨鏈索引需另行需求及資料設計；本版不保存歷史，不提供投資建議或自動管理。Layer 2 未開始。
