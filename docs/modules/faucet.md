# Faucet：Sepolia ETH 餘額與測試資源取得

## Task 04 已完成範圍

沿用首頁風格開放 Faucet 同頁入口；Wallet Task 03 的 Provider／狀態管理不變。未連線也能閱讀教材，連線且處於 Ethereum Sepolia（11155111）才自動查一次餘額。可複製目前地址、開啟安全的 Sepolia Etherscan 地址連結、手動重新查詢及閱讀繁體中文 Gas 教材。不要求私鑰、助記詞、簽名或轉帳，不持久儲存地址與餘額。

金額透過 viem `getBalance()` 取得 bigint wei，`formatEther()` 轉字串。主顯示截取六位小數，不做浮點金額運算；非零但小於 0.000001 顯示 `< 0.000001`，另顯示完整 18 位精度金額。只有成功查詢才顯示餘額與最後更新時間；錯誤不是 0 ETH。外部 Faucet 的成功訊息不作為入帳證據。

## 分層與公開介面

- `src/config/rpc.ts`：公開 RPC URL、逾時／冷卻參數；沒有金鑰或備援。
- `src/lib/web3/publicClient.ts`：共用 Sepolia viem Public Client，供後續 Token 使用。
- `src/lib/web3/balance.ts`：`readSepoliaBalance(Address)` → `{ wei: bigint, updatedAt: number }`；同地址進行中請求去重、共用鏈別檢查與限流處理。
- `src/lib/web3/balanceStore.ts`：載入／成功／失敗狀態與手動更新冷卻。
- `src/shared/hooks/useSepoliaBalance.ts`：以 address、chainId 建立獨立 store；切換時立即捨棄舊顯示，過期請求只更新舊 store，不覆蓋新狀態。供 Task 05/06 重用。
- `src/modules/faucet/`：只透過 Wallet 公開 `useWallet()` 讀取帳號與網路，不直接修改其內部狀態。

重新查詢時清除舊數值以避免誤認為最新結果。每次成功／一般失敗後至少等待 10 秒；按鈕倒數計時不會發送 RPC。沒有輪詢，也不在外部網站返回或頁面 focus 時自動查詢。地址／網路切換時重新查詢；進行中舊讀取不取消傳輸，但其結果不能回寫目前介面。完成後移除 pending 地址，無持久快取。

## RPC 選型與驗證（2026-11-10）

候選／目前公開設定：[PublicNode](https://www.publicnode.com/)，URL 為 `https://ethereum-sepolia-rpc.publicnode.com`。官網列有 Ethereum Sepolia RPC，宣稱免費服務；目前未找到明確數值速率配額／課堂 SLA，不可解讀成無限制。

本環境以帶 `Origin: https://baricebard.github.io` 的 JSON-RPC POST 嘗試 `eth_chainId` 與 `eth_getBalance`，遭環境代理 CONNECT 403 阻擋，請求未到 RPC。**端點可用性、實際 chain ID、餘額結果與瀏覽器 CORS 均尚未驗證**。官網資訊只確認候選身分；不能取代實際驗證。未加入任何未核對的備援端點。正式授課前必須通過下列檢查；此 PR 不代表服務已可供全班使用。

程式採每 HTTP 請求 8 秒逾時，viem 內建 retryCount=0，由讀取層最多重試一次，間隔 1 秒。每次需驗證 RPC 的 `eth_chainId` 為 11155111；成功鏈別檢查僅共用 60 秒，錯鏈不呼叫 getBalance。一般錯誤顯示稍後重試，HTTP 429／JSON-RPC 429、-32005 或限流訊息不自動重試；全頁共用至少 30 秒冷卻，若可取得 Retry-After 則尊重較長時間。不繞過 CORS、不使用秘密 API Key。

30 人同時首次進入各需一個鏈別與一個餘額請求；一般手動更新只有餘額請求（鏈別檢查過期後再查鏈別）。去重／冷卻只在各自瀏覽器生效，無法跨學生合併請求或解決全班共用 IP 限流。教師應分組錯開操作並課前演練；故障時保留教材、稍後重試，不展示假餘額。

## 外部 Faucet 候選與資格

核對日期：2026-11-10。來源為 [Ethereum 官方 Networks](https://ethereum.org/developers/docs/networks/) Sepolia 清單及下列服務公開頁。已核對候選網址與 Ethereum Sepolia 標示，**未實際領幣，未確認任何服務適合所有學生**；限制可能變動。

| 候選與正確網址 | 費用與帳號 | 主網資產／資格 | 額度與冷卻 |
| --- | --- | --- | --- |
| [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/) | 公開頁說明免費測試幣，需瀏覽器計算工作，耗時耗電；指引為輸入地址後運算。帳號完整限制尚未確認 | 主網持幣、社群及其他資格完整限制尚未確認 | 尚未確認 |
| [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) | 已確認登入入口，需要 Google 帳號；費用尚未確認 | 主網持幣、社群及其他資格尚未確認 | 尚未確認；登入後課前核對 |
| [Alchemy Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia) | 公開頁列免費發放、不需 Alchemy 帳號 | 至少 0.001 主網 ETH、足夠主網交易活動及低於服務限制的測試幣餘額；社群或其他驗證尚未確認。不能描述為零主網資產方案 | 公開頁列 0.1 ETH / 24 小時，實際資格與供給仍須再查 |

選擇順序可先由教師試用 PoW／Google 候選；PoW 需要時間與運算資源，Google 仍需登入核對。Alchemy 僅列明受限候選，不鼓勵學生購買主網資產取得資格。所有外部連結使用 HTTPS、新分頁及 `noopener noreferrer`。

## 學生流程與 Gas 教學

1. 到 Wallet 明確連接 MetaMask，確認 Sepolia；不提供私鑰或助記詞。
2. 在 Faucet 核對目前地址、Chain ID 11155111 與 Sepolia Test ETH 餘額，複製地址。
3. 開啟外部候選，確認 Ethereum Sepolia 與資格，依服務指引操作。
4. 返回本頁點「重新查詢餘額」；未增加時等待後重查，可用 Sepolia Etherscan 確認地址活動。查詢成功只代表該次讀到的餘額，不推斷是哪個 Faucet 入帳。

Gas Fee 用於支付交易的計算與網路資源、降低垃圾交易；費用隨操作及網路狀況改變。Ethereum Sepolia 使用原生 Sepolia ETH 支付 Gas；它不具有主網 ETH 的實際金融價值。DPLT 等 ERC-20 教學代幣由合約管理，並非 Gas Token；即使轉帳 DPLT 仍需 Sepolia ETH。唯讀餘額查詢一般不支付鏈上 Gas。

## 教師課前與待人工驗證

- 在實際 Pages Origin 以瀏覽器確認 POST／OPTIONS CORS、`eth_chainId = 0xaa36a7`、`eth_getBalance` 與 Etherscan 結果一致；核對 PublicNode 最新使用限制。開發環境代理 403 不代表 RPC 故障。
- 真實 MetaMask 連接／切換帳號與網路，零餘額、領取後更新、拒絕授權、RPC 故障演練。
- 以全新零主網資產地址及預計學生帳號查核每個候選；記錄免費性、驗證、額度、冷卻及是否有庫存，不能只看首頁載入成功。
- 提前準備至少 30 人的測試 Gas 與餘裕，依後續操作實測估算，不能使用固定 Gas 價格。教師可在課前自行按已驗證流程分發測試 ETH，核對每個地址及入帳；本次網站沒有教師轉帳功能，也未執行分發。無資源時改讀教材並延後鏈上實作。
- 分組演練共用校園 IP、30 人讀取與 Faucet 供給；未通過前不承諾課堂可用性。未配置自動備援，新增端點須逐一驗證鏈別、CORS、getBalance 與條款後再改設定。

## 自動化與後續邊界

Playwright 透過 HTTP route Mock RPC 與 EIP-1193 Mock Wallet 驗證，不把 mock 放入正式 bundle。案例包括未連線、零／非零／1 wei 精度、更新時間、複製、安全連結、返回後手動刷新、去重／無輪詢、逾時、RPC 錯誤、HTTP／JSON 限流、RPC 錯鏈、快速帳號切換及網路切換過期回應；桌面與手機皆執行，另保留 Task 03 回歸測試。**Mock 通過不等於真實 RPC、CORS 或 Faucet 發幣成功。** 執行結果見 Task 04 驗證紀錄。

A-04 已於 Task 05 決定：三種 ERC-20 初始供給由教師錢包統一持有，再於 Sepolia 以一般 transfer 分發給學生；不建立自動 ERC-20 Faucet、批次分發合約或教師操作介面。教師應為 30 人保留後續交換、池與投資組合資產，規劃見 [Task 05](../06-token-contracts.md)。現有 ETH Faucet 指引不會自動發放 ERC-20，也不替學生支付 ERC-20 轉帳 Gas。合約尚未部署，Token 前端未開放；沒有自建 Faucet 伺服器／合約或 Exchange 功能。
