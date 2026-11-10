# MVP 範圍與驗收

## 第一版目標

Task 06 已實作 Wallet、Faucet 與 Token 教學閉環介面及 Mock 驗證；真實 Sepolia／MetaMask 整合與課堂驗收仍未完成，不代表已發布或正式通過全部 MVP 驗收。MVP 讓學生完成「連接錢包 → 確認 Sepolia → 依指引取得 Gas 與教學代幣 → 查詢三種餘額 → 向同學轉帳 → 查看結果」的最小學習閉環。

## 交付邊界

| 模組 | MVP 納入 | 延後 |
| --- | --- | --- |
| [Wallet](modules/wallet.md) | 連接、顯示帳號、網路檢查與切換提示 | 多錢包進階管理、嵌入式錢包 |
| [Faucet](modules/faucet.md) | 外部 Sepolia ETH 指引、教學代幣取得說明 | 網站一鍵領幣、專用 Faucet 合約與班級配額 |
| [Token](modules/token.md) | 三種代幣餘額、單筆 ERC-20 轉帳、交易結果 | 批次轉帳、任意代幣匯入、管理介面 |
| [Exchange](modules/exchange.md) | 不納入可操作交換 | 報價、approve、swap |
| [Liquidity](modules/liquidity.md) | 不納入 | AMM、池操作與 LP 權益 |
| [Portfolio](modules/portfolio.md) | 不納入；餘額展示由 Token 負責 | 配置比例、估值、績效與歷史 |
| [Layer 2](modules/layer2.md) | 不納入 | 概念教材、模擬或測試網實驗 |

未實作模組可以只出現在文件導覽；若放入網站導覽，須標示「未開放」，不得顯示可執行交易的控制項。

## 前置條件與不納入項目

MVP 整合驗收前需有經測試的三種 Sepolia 教學代幣、已確認的 ABI／地址，以及可供全班使用的 Gas 與教學代幣取得流程。Task 05 已完成合約本機測試，Task 06 使用任務提供的三個已部署地址，公開資料見 [Token 設定](modules/token.md)。學生流程使用已確認的三個固定地址與 18 decimals，查詢不以 runtime／Solidity metadata 相符為前置。轉帳必須重新核對帳號、11155111、允許清單、最新餘額、Gas 及 simulateContract，再經使用者明確確認。Etherscan 原始碼驗證與歷史 runtime bytecode 比對未完成；部署 receipt 封存仍缺。A-03、A-04 已定固定供給與教師一般 transfer 分發，網站無自助 ERC-20 Faucet。

不納入獨立後端、資料庫、帳號登入、名冊、成績、主網、真實資產、交易所整合、自動交易、橋接與真實價格服務。

## MVP 驗收條件

1. 未連接錢包仍可讀取教材與領取指引；沒有錢包時提供安裝／選擇提示，不要求輸入機密。
2. 連接後顯示目前帳號與網路；非 Sepolia 時阻擋交易，切換遭拒仍可讀教材。
3. 三種代幣各自顯示正確餘額與單位；RPC 失敗與零餘額可辨識。Sepolia ETH 作為獨立 Gas 餘額展示。
4. 學生依指引可取得測試資源；教師於課前確認 30 人所需供給、外部資格限制及不足時的處置。
5. 轉帳先驗證收款地址、金額、代幣餘額與網路；送出前清楚顯示收款人、資產、金額及 Gas 說明，由錢包確認。
6. 交易提供 hash 與 Sepolia 瀏覽器連結；receipt 成功、至少 1 個區塊確認並核對 canonical block 與實際交易後更新餘額；不宣稱最終確定性。拒簽、Gas 不足、revert 與 RPC 逾時有可理解的提示，重複點擊不產生重複請求。
7. 帳號或網路切換後不顯示前一帳號的餘額，亦不沿用舊交易表單授權。
8. Pages 專案子路徑的首頁、靜態資源與導覽重新整理正常；桌面投影及手機畫面可操作，表單有標籤、鍵盤焦點與文字狀態提示。
9. 使用兩個測試帳號完成端到端轉帳；30 人課堂情境演練記錄 RPC 限流、Gas 準備與故障指引，不將無法掌控的測試網延遲當作固定 SLA。

各模組細部測試情境見所屬文件；共用測試政策見 [AGENTS.md](../AGENTS.md)。
