# 開發路線圖

以可驗收成果分階段，不預設週數或承諾一學期內完成所有擴充。每階段開工前重新確認需求與待決事項；階段 0 與 Task 02～04 的前端基礎已完成；Task 05 完成階段 2 的合約本機部分，Sepolia 部署與 MVP 整合尚未完成。

| 階段 | 工作與依賴 | 完成條件 |
| --- | --- | --- |
| 0：文件基線 | 專案規格、MVP 邊界、模組文件與 Codex 規範 | 文件連結有效、責任分明、待決事項可追蹤；無應用程式或合約實作 |
| 1：工具鏈與基礎介面 | 決定 A-01、A-02、A-10 的前端相關項目，再建立 React／TypeScript／Vite 及測試配置；Wallet、Faucet 指引 | 錢包狀態與錯誤流程通過測試，Pages 子路徑預覽可用 |
| 2：教學代幣與 MVP | 先決定 A-03、A-04、A-05；Solidity／Hardhat 本機測試後，另行執行 Sepolia 部署工作；整合 Token | 三種地址與 ABI 有紀錄，兩帳號轉帳與全部 [MVP 驗收](02-mvp-scope.md)通過，完成 30 人演練後再發布 |
| 3：DPL Exchange | Task 07A 已決定 A-06：六方向不可變固定匯率、教師庫存、10 DPLT 等值單筆額度；完成合約及本機測試 | 07A／07B 已合併；使用者提供部署地址，07C 前端與 Mock 測試完成、首頁入口開放；真實人工驗收與發布仍待辦 |
| 4：Liquidity／AMM | Task 08A 已決定 A-07：單池 DPLT／A 常數乘積、0.3% 留池、ERC-20 LP、無管理權限；完成合約與本機測試 | 08A／08B 已合併，08C 學生 AMM Swap／LP 操作與 Mock 已實作；使用者提供 Sepolia 地址，真實兩帳號人工驗收與發布待辦，見 [08C](17-amm-frontend.md) |
| 5：Portfolio | Task 09 已決定 A-08：DPLT 固定教學參考價、LP 底層拆解、不重複計值 | 唯讀 Dashboard 與 Mock 驗證已實作；真實 RPC／MetaMask 人工驗收待辦，見 [Task 09](18-portfolio-dashboard.md) |
| 6：Layer 2 與課程擴充 | 決定 A-09；教材可獨立進行，鏈上實驗需另訂網路與資源規格 | 明確區分概念、模擬及實際交易；課程流程經試教 |

## 推進規則

- 合約機制先寫入模組規格並記錄決策，再實作及測試；不得用部署結果反過來取代設計審查。
- 前端開發可使用明確標示的測試替身；不得把它當成真實 Sepolia 部署或正式驗收證據。
- 每階段同步 README 的實際狀態、模組規格與必要操作說明；未到階段保留文件，不預先建立空模組程式碼。
- 發布前檢查公開設定、合約地址、依賴與測試結果。部署與管理者操作由明確授權的工作處理。

## 課堂準備

教師於試教前確認錢包相容性、外部 Faucet 資格／供給與 RPC 容量，並準備網路故障時的教材流程。首次班級試用後依學生完成率、錯誤類型與教師支援負擔調整下一階段優先順序；成績系統等需求需另立範圍。

待決事項索引與決策時點見[系統架構](01-system-architecture.md)。

## Task 05 完成範圍與 Task 06 前置

已完成 A-03 固定供給／無管理權限、A-04 教師分發與 A-05 最低 receipt 原則；單一 TeachingToken 合約、三實例 Ignition 模組、本機測試及離線／RPC 預檢準備見 [合約文件](06-token-contracts.md)。本機測試不是 Sepolia 整合驗收，階段 2 尚未完成。

另行授權部署工作需補遠端簽署整合與強制 chain ID 預檢，完成 Sepolia 部署、Etherscan 驗證、真實教師持有及合約紀錄。Task 06 開始前還需決定確認區塊數、重組與替換策略，確認真實 RPC／CORS 與課堂測試資源；之後才可整合 ABI／真實地址、餘額與轉帳 UI。本次不執行部署、不實作 Task 06。

## Task 07A 完成範圍

[固定匯率交換規格](12-fixed-rate-exchange.md)記錄不可變比例、單筆額度、原子交換、最小 approve、庫存與 owner 管理、測試及部署計畫。Task 06 與餘額修正已合併 main。Task 07A 僅完成本機合約與部署準備，不代表 Sepolia 或交換 UI 完成；未執行部署、教師資產移動、approve，也未開始 Task 07B／07C。


## Task 07C 完成範圍

Task 07A PR #10、Task 07B PR #11 已合併，07C 由最新 main 開發，依使用者提供的 Exchange 地址完成六方向固定報價、最小授權、交換、Receipt、庫存／Gas／單筆上限與繁中教學；Mock 驗證及 [人工驗收指南](14-exchange-frontend.md)已建立。此任務只含前端，沒有合約修改、部署、庫存注入、真實 approve／swap、合併或網站發布。後續需人工驗證 MetaMask／Sepolia、兩帳號與課堂資源；不開始階段 4／5。

## Task 08A 完成範圍

[DPL AMM 規格](15-amm-pool.md)記錄 A-07 常數乘積、0.3% 留池費、DPL-LP／永久鎖定、比例注資與自行移除、實際餘額／捐贈政策、數學界限與本機驗證。無 owner 或任意提領入口，既有已部署合約不修改。Pool 地址為 null，沒有 Sepolia 部署或真實資產操作，Liquidity 未開放。

08A 已加入非零 immutable initialProvider，只限制教師首次初始化，失敗不解鎖，成功後所有帳號皆可注資；不增加管理員提領權。08B 核對教師參數並沿用 localhost + MetaMask 工具處理部署／教師首次注資；08C 才實作學生 quote／swap／LP 及教材介面。兩任務均未開始，本機測試不代表人工驗收完成。

## Task 08C 完成範圍

由 main `753c7c4` 開發學生 AMM Swap／Add／Remove、精確授權、LP 權益、Fee／Price Impact／Slippage 與 Fixed quote 比較，附 Mock 與手機版面驗證。[人工驗收指南](17-amm-frontend.md)保留真實兩帳號／MetaMask／Sepolia 待辦；本次沒有合約修改、部署、真實交易、合併或發布，也不開始 Portfolio。

## Task 09 完成範圍

Portfolio 開放當前資產、LP 權益、固定教學估值、五類配置、AMM 儲備比例比較及獨立 ETH。A-08 的價格與捨入、資料一致性限制、刷新／錯誤及後續績效分析範圍見 [Portfolio 規格](modules/portfolio.md)。沒有合約修改、部署、簽署、學生資產操作、歷史績效或 Layer 2；真實帳號及課堂 RPC 人工驗收仍待完成。
