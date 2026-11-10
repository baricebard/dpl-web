# 系統架構

## 狀態與系統邊界

本文件描述目標架構；Task 02 已建立前端，Task 03 已實作 Wallet，Task 04 新增 Sepolia ETH 唯讀餘額與外部 Faucet 指引；真實 RPC／CORS 及領幣仍待人工驗證。Task 05 已完成固定供給教學 ERC-20 的本機實作與部署準備，尚未部署；Token UI 及其他鏈上功能仍為後續規劃。固定技術原則見[專案總覽](00-project-overview.md)，MVP 交付邊界由 [MVP 範圍](02-mvp-scope.md)定義。

```text
GitHub Pages（靜態檔案） → 學生瀏覽器：React UI／各功能模組
                                  ├─ 共用鏈上讀取層 → RPC → Sepolia
                                  └─ 錢包介面 → 學生錢包確認與簽署 → Sepolia
外部測試網 Faucet ← 學生依指引自行開啟
```

GitHub Pages 僅供應靜態內容，無法保密前端設定、執行伺服器任務、排程發幣或限制領取次數。RPC 與外部 Faucet 是外部依賴，不是自建後端；其可用性、配額與使用條件須於授課前確認。

## 分層與模組責任

| 層／模組 | 責任與依賴 |
| --- | --- |
| App 組裝層 | 導覽、頁面組裝、功能啟用狀態與共用錯誤呈現 |
| Wallet | 連接狀態、帳號與網路事件；供其他模組讀取可交易狀態 |
| Faucet | Sepolia ETH 餘額、外部 Gas 領取與 Gas 教材；不代管資金 |
| Token | 三種代幣資料、餘額與 ERC-20 轉帳 |
| Exchange | 未來報價、授權與交換流程；依賴 Wallet、Token |
| Liquidity | 未來池狀態、提供／移除流動性與 AMM 教學 |
| Portfolio | 未來資產彙整與教學估值；不負責簽署交易 |
| Layer 2 | 未來概念教材；獨立於 Sepolia MVP 交易流程 |
| 共用基礎層 | 型別、公開鏈設定、RPC／錢包適配、金額轉換、交易狀態 |

功能模組只透過公開介面互用，不讀寫彼此內部狀態。共用層不得反向依賴功能模組；避免為單一模組需求建立通用框架。A-01 已選定 viem `2.57.17` 與 React 原生 Context + Hooks；Wallet 使用 EIP-1193，優先以 EIP-6963 辨識 MetaMask。暫不使用 wagmi、Redux、Zustand、WalletConnect 或手機跨 App 連接。

## 共用資料與交易契約

- 網路固定為 Ethereum Sepolia，chain ID 為 `11155111`。公開設定需按 chain ID 對應代幣地址、ABI 版本與區塊瀏覽器；未配置或未驗證時停用相關操作，不可填入虛構地址。
- 資產識別使用 `(chainId, contractAddress)`；符號只作顯示。原生 Sepolia ETH 以獨立類型處理，不給它 ERC-20 地址。
- 基礎單位金額使用整數／`bigint`，畫面輸入為十進位字串，依實際 `decimals` 換算；不可使用浮點數計算代幣金額。
- Wallet 對外提供帳號、chain ID、連線與網路狀態及變更通知；Token 提供資產清單、餘額讀取及轉帳請求。Wallet 的型別安全公開介面與操作見 [Wallet](modules/wallet.md)。
- 交易狀態至少區分待錢包確認、已送出（hash）、等待鏈上結果、成功、失敗及結果未知。取得 hash 不等於成功；成功依 receipt 與確認策略判斷。
- 拒簽、revert、RPC 逾時應分開呈現。逾時後先依 hash 查詢，不自動重送交易。帳號／網路切換時清除舊快取、取消過期報價並禁止沿用舊簽署請求；已廣播交易保留原鏈與原帳號追蹤。

## 資料保存與隱私

鏈上餘額與交易結果為資產狀態依據；前端快取只用於展示，需標明載入、失敗或過期，不能將讀取失敗顯示成零。初期不儲存學生身分與成績。重新整理後可重新讀取餘額；本機交易紀錄保存策略待決，不承諾完整歷史。

錢包地址與交易公開可查，課程需說明其可連結性。不得蒐集私鑰、助記詞或錢包匯出檔；部署者金鑰不進入前端、Repository 或建置輸出。

## 靜態部署與課堂可靠性

- 預計專案型 Pages 路徑為 `/dpl-web/`，實際發布網址與來源設定仍待確認。Vite `base` 必須與發布路徑一致。
- MVP 建議使用單頁導覽或 hash 路由；若改採 history 路由，需另訂 Pages 深層連結方案，不能假設存在伺服器 rewrite。
- 瀏覽器可見的設定與 `VITE_*` 皆屬公開資訊。需要保密的 RPC 金鑰不得內嵌；供應商需允許瀏覽器、CORS 與公開用量限制。
- RPC 讀取需去重、限制輪詢頻率與退避重試；30 人容量演練觀察限流與延遲，不承諾測試網確認時間。
- 課前確認 Gas、代幣取得方式與 RPC；課堂失敗時提供步驟教材及稍後重試，不將示範資料偽裝為真實鏈上結果。

## 跨模組待決事項

A-01 與 A-02 的 Task 03/04 實作範圍已確定；其餘待決部分於對應階段前記錄選項、理由、風險與決策結果，並同步所屬模組文件。

| ID | 待決問題 | 決策時點／規格負責處 |
| --- | --- | --- |
| A-01 | 已確定：MetaMask 擴充功能、EIP-1193、優先 EIP-6963、viem 2.57.17、Context + Hooks、Ethereum Sepolia。延後：其他錢包與行動連接；未實作鏈上讀寫流程 | Task 03；Wallet |
| A-02 | Task 04：獨立 viem Public Client，PublicNode Sepolia 為公開設定候選；8 秒逾時、最多重試一次、1 秒退避、手動更新最少 10 秒、同址進行中去重、無輪詢；429 至少冷卻 30 秒並尊重 Retry-After。無 API Key／未驗證備援。環境代理 403，實際鏈別、getBalance、CORS 與供應商配額尚未驗證；授課前必須通過 | 實作已定；外部驗證待完成，見 [Faucet](modules/faucet.md) |
| A-03 | 已確定：三種各 18 decimals、1,000,000 tokens；constructor 一次分配全部供給至明確教師地址；無額外鑄造、銷毀、管理權限、稅費或升級 | Task 05；[合約規格](06-token-contracts.md) |
| A-04 | 已確定：教師錢包在 Sepolia 以一般 transfer 分發；不實作自動 ERC-20 Faucet、批次合約或教師 UI；30 人需保留後續練習資產 | Task 05；[合約規格](06-token-contracts.md) |
| A-05 | 已確定最低原則：錢包自行確認，至少 receipt status success；拒簽、失敗、RPC 逾時、未知分開，不自動重送，切換不沿用授權。確認區塊數、重組／替換與紀錄策略待決 | Task 06 實作前；[詳細決策](06-token-contracts.md) |
| A-06 | 固定比率或 AMM 交換、交易對、費率、滑價、授權策略 | Exchange 階段前；Exchange |
| A-07 | 池模型、初始流動性、LP 權益表示及資金管理 | Liquidity 階段前；Liquidity |
| A-08 | Portfolio 計價單位、價格來源、歷史資料與績效方法 | Portfolio 階段前；Portfolio |
| A-09 | Layer 2 教材深度、是否實作及對應測試網 | Layer 2 階段前；Layer 2 |
| A-10 | Pages 發布來源／流程、依賴版本、合約地址與部署紀錄格式 | 相應工具鏈或發布前；本文件 |

已確定的技術原則不因待決事項而改變。新增後端、資料庫、主網或跨鏈資產流動需另行修訂範圍，不得透過實作默默加入。

## 合約開發與部署邊界

Task 05 採 Hardhat 3／viem Toolbox／Node Test Runner 與 OpenZeppelin 5.x。單一 Solidity 原始碼建立三個獨立實例；`test/contracts/` 與 Playwright `tests/e2e/` 分離，合約使用獨立 NodeNext 型別設定。前端既有依賴與 Wallet／Faucet 邏輯不變。

部署模組與離線參數準備已建立，另有唯讀 RPC chain ID 預檢；目前 Hardhat 僅設定本機 EDR，沒有 HTTP 部署設定、秘密或公用網路部署命令。尚無真實地址、Hash 或 ABI／地址前端整合。版本、部署紀錄格式、合約驗證流程與未完成遠端執行器見 [Task 05](06-token-contracts.md)；部署需另行授權。
