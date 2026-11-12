# Task 10：DeFi 教學體驗整合

課程：**區塊鏈交易與去中心化金融應用實務**（Practical Applications of Blockchain Transactions and Decentralized Finance）。平台：**DeFi Portfolio Lab／去中心化金融投資組合實驗室**。

對象為 30 位零基礎學生，支援實體與線上混合教學，以 150 分鐘試教起步，之後可延伸為一學期。全部鏈上操作限 Ethereum Sepolia（11155111），不投入真實金融資金。Task 09 PR #17 已合併，Task 10 由 main `69d30f4` 建立；不改動合約、地址或讀寫服務，不部署、不發送真實交易。

## 六階段與學生可觀察成果

介面各單元包含學習目的、可執行任務、可展開的步驟及預期結果、原有操作介面、2～3 項概念整理及下一單元連結。預期結果不是成功訊息，實際鏈上狀態仍由原有查詢與 Receipt 驗證。導覽順序如下，學生可自由跳轉，沒有登入、資料庫或學習進度追蹤，也不把開啟頁面當作交易完成。

| 單元 | 學習目標與重要概念 | 學生操作與預期結果 | 銜接 |
| --- | --- | --- | --- |
| [Wallet](modules/wallet.md) | 帳號、公開地址與私鑰；MetaMask 管理簽署，資產狀態在鏈上，不是錢包中的傳統資料庫 | 官方安裝測試錢包，連接網站，核對公開地址與 Sepolia；畫面顯示地址及正確網路 | 有地址後準備 Gas |
| [Faucet](modules/faucet.md) | Sepolia ETH 用於 Gas；教學 ERC-20 不能付 Gas；Faucet 不是挖礦或投資收益 | 查看 ETH、依外部資格領取、返回手動更新；最新餘額與更新時間供核對，領取不保證即時成功 | 同時準備教師分發的三種代幣 |
| [Token](modules/token.md) | ERC-20 名稱／符號／合約身份、18 decimals、餘額、transfer、Gas、Transaction Hash、Receipt、區塊確認 | 選代幣，填收款地址／數量，核對摘要，再確認轉帳；成功後核對餘額及 Etherscan | 從資產移轉走向資產交換 |
| [Exchange](modules/exchange.md) | DPLT／A／B 模擬 USD／TWD／CNY；固定 1 DPLT = 30 A、1 B = 4.5 A；approve 與 swap | 查報價、按需精確授權、另行確認 swap；交換成功才應看到支付資產減少、收到資產增加，授權成功只更新額度 | 比較固定匯率與 AMM |
| [Liquidity](modules/liquidity.md) | x*y=k、儲備比例決價、0.3% 輸入費留池；Price Impact 與 Slippage Tolerance；Add／DPL-LP／Remove／份額／無常損失 | 查交換報價與最低量；按比例提供兩資產，確認 Add 後取得 LP；移除時銷毀自己的 LP 並按份額取回資產；實際數量看 Receipt 事件及更新餘額 | 將 LP 權益帶入整體資產觀點 |
| [Portfolio](modules/portfolio.md) | 三種 ERC-20、LP 底層權益、DPLT 統一教學估值、配置百分比、不重複估值、固定參考價與 AMM 現貨價 | 唯讀查看同區塊快照與最後更新時間，手動刷新；LP 拆為底層兩資產，面額不再加總，ETH 另列；資料失敗顯示不可計算 | 回顧並解釋自己的資產配置 |

## 哪些操作要確認？

| 操作 | MetaMask 與 Gas |
| --- | --- |
| 連接網站／切換 Sepolia | 需要 MetaMask 權限或網路確認，沒有資產交易 Gas；不等於授權資產轉出 |
| 餘額、報價、池儲備、LP 權益、Portfolio、Etherscan | 唯讀，不需交易簽署或鏈上 Gas；目前帳號的資產查詢仍需已連接且在 Sepolia |
| 外部 Faucet | 本平台不代領、不簽署、不內建發幣；外部服務自行定資格，不提供私鑰或助記詞 |
| Token transfer | 核對摘要後確認一筆 MetaMask 交易，支付 Gas，不需 approve |
| Exchange／AMM Swap | allowance 不足時先確認 approve，再獨立確認 swap，各需 Gas；足額則跳過 approve |
| Add Liquidity | 兩種資產可能各需 approve，加上 addLiquidity，最多三筆分別確認並付 Gas；授權不會取得 LP |
| Remove Liquidity | 確認 removeLiquidity 並付 Gas，只銷毀自己的 LP，不需 LP approve |

交易送出前保持收款人／使用合約、資產、數量、網路、最低接受量及預估費用可核對。沿用 Task 08C-UX 的 AMM 操作步驟、摘要焦點、授權提示及實際結果。Token／Exchange 交易狀態改用中文描述，Exchange 成功明確區分授權及交換。Token、Faucet 的主要餘額顯示最多六位小數，非零極小值以 `< 0.000001` 表示；完整精度與合約資訊仍可展開。Portfolio 已有精確數值收合，其他必要交易技術資訊保留。更新時間只表示最近查詢，不宣稱持續即時。

## 重要風險與常見誤解

- 連線、檢查摘要、估算、取得 Hash、授權成功，都不是資產操作成功。Receipt success、既有區塊及實際交易／事件核對才是本平台成功依據；至少一個區塊不代表最終確定性。
- 狀態未知先保存原 Hash／Etherscan，查 MetaMask 活動，再手動查詢原交易；不要重送，不靠重新整理繞過鎖定。網站不自動重送，記錄僅在本頁記憶體。
- 私鑰與助記詞不可提供給教師、網站或 Faucet。公開地址及交易可被他人追蹤，不作學生身分證明。
- 無 ETH 先準備測試 Gas；無 ERC-20 請教師協助，平台沒有 Mint。Faucet 不可用或資格不足時改觀察教師，不購買真實資產通過資格。
- RPC 失敗不代表零餘額，等待冷卻後手動重查；錯鏈到 Wallet 切回 Sepolia；拒絕 MetaMask 後先核對活動及畫面結果。
- AMM 沿常數乘積曲線交易，費用留池可使 k 增加，沒有固定 1:30 保證。Price Impact 是曲線價格影響，Slippage Tolerance 是相對報價的可接受不利偏差，放寬滑價不能消除風險。
- LP 不是保本存款。相對價格變化可造成相較直接持有的無常損失，費用不保證彌補；不要直接 transfer 到 Pool，直接轉入不會取得 LP。
- Portfolio 的 1、1/30、3/20 DPLT 是教材固定參考價，不是真實市場估值。LP 先拆底層再估值，不重複加面額；AMM 現貨價只供比較，不保證套利收益，也不提供歷史績效。

首頁「課堂操作協助」涵蓋未安裝、未連接、錯鏈、Gas／代幣／授權不足、拒簽、RPC／Faucet 不可用、待確認及未知交易。每個單元都可直接連至協助。

## 150 分鐘試教與學期使用

試教以一次完整學習動線為主，課前準備設備、MetaMask、測試 Gas、教師分發代幣及既有池資源，避免課堂把時間全耗在 Faucet 等待。將 30 人分組錯開查詢；部分學生操作，其他學生先預測餘額、授權與 LP 如何變化，再觀察結果並交換角色。Liquidity 可由教師展示 Swap／Add／Remove，學生用 Portfolio 解釋底層權益。資源或網路不穩時，以現有教材與教師展示進行概念判讀，不虛構完成狀態。

學期使用可分次深化錢包安全、交易生命週期、整數精度、固定匯率與 AMM 比較、LP／無常損失、估值及配置，搭配小組解釋與反思。重返單元不強制重新交易，使用既有持倉或教師展示即可；評量由教師另行安排，本平台不保存名冊、成績或進度。詳細課程流程與 PPT 大綱在另一個討論串規劃，本次不製作 PowerPoint、不新增 Layer 2 或歷史績效功能。

## 驗證與人工教學驗收

自動化使用 Mock Provider／RPC，涵蓋自由導覽、下一單元、教材與唯讀觀察、桌面與 320px 展開內容，以及受影響模組的既有回歸。檢查 lint、typecheck、GitHub Pages build 與正式產物隔離；本次不重複 Solidity 行為、歷史 Bytecode／Metadata 或遠端 RPC 檢查。具體執行結果記於 PR。

人工仍需：確認新手能區分連線／授權／交易，依步驟解釋六單元；投影、鍵盤及手機閱讀；30 人分組及校園 IP 的 RPC／Faucet 資源演練；不能使用錢包的學生能完成觀察題。可沿用已完成的 Sepolia 功能測試與既有資產展示，本次不增加鏈上交易。

本次結果：lint、typecheck、build（含正式產物隔離）、Markdown 本機連結與 `git diff --check` 通過。六模組既有 UI／服務 Mock 回歸 466 passed；首頁與新學習動線 8 passed，共 474 個案例。最後授權結果文案、Gas 精確資訊及導覽排版調整後，重跑首頁／學習動線／Token／Exchange 共 48 passed。已檢視桌面及 320px 截圖，包含展開教材與課堂問題，無不必要水平溢出。自動化為 Mock，不代表本次新增真實 Sepolia 驗收。

乾淨環境的 build 隔離檢查需要既有 artifacts，因此只執行本機 `contracts:compile` 產生未提交產物；沒有合約行為測試、歷史 Runtime／Metadata 或遠端 RPC 重驗。既有 bundle 大小及 viem 間接依賴的瀏覽器 externalization 警告仍存在，production preview 測試通過。合約、讀寫服務、部署地址、依賴與 lockfile 未修改。
