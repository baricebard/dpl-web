# Token：ERC-20 餘額與轉帳

## Task 06 狀態與公開設定

已實作三種代幣餘額、Gas、單筆 ERC-20 transfer、摘要及結果追蹤。尚未發布，也未執行真實轉帳。地址來自本次任務提供的部署資料；本次環境對 PublicNode RPC 的唯讀請求受阻，不能宣稱完成新的鏈上核對。執行時每個代幣必須通過鏈別、完整 runtime 指紋（包含 Solidity metadata）及 name、symbol、decimals、totalSupply 核對，否則停用該代幣轉帳。本機預期 runtime 由 Task 05C 固定 Git 基線重建；執行時指紋核對不代表已補齊 Etherscan 原始碼驗證或歷史部署 runtime 封存證據。完整方法與發布前獨立驗收見 [完整性審查修正](../09-task-06-runtime-integrity.md)。

唯一公開設定為 [tokens.ts](../../src/config/tokens.ts)，身份使用 `chainId:lowercaseContractAddress`；symbol 只作顯示。Ethereum Sepolia，Chain ID **11155111**。

| Name | Symbol | Contract |
| --- | --- | --- |
| DeFi Portfolio Lab Token | DPLT | [0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e](https://sepolia.etherscan.io/token/0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e) |
| DeFi Portfolio Lab Asset A | DPLT-A | [0x53Ac929866423479c7C5746F76F398e8b3907d6E](https://sepolia.etherscan.io/token/0x53Ac929866423479c7C5746F76F398e8b3907d6E) |
| DeFi Portfolio Lab Asset B | DPLT-B | [0xA8E2854c62A46329838f9922587adBbEb007072f](https://sepolia.etherscan.io/token/0xA8E2854c62A46329838f9922587adBbEb007072f) |

各 18 decimals、固定 1,000,000 tokens（`1000000000000000000000000` 最小單位），無公開 Mint、無特殊管理權限。初始教師持有人為 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`，目前餘額不可假設仍為初始供給。合約來源與供給決策見 [Task 05](../06-token-contracts.md)，部署指南歷史資料見 [Task 05C](../07-sepolia-deployment-guide.md)。最終整合已納入 main 的[使用者部署紀錄](../09-sepolia-deployment-record.json)、[獨立驗證受阻報告](../09-sepolia-deployment-verification.md)與[本機唯讀驗證工具](../10-local-readonly-verifier.md)。紀錄中的 receipt／Hash 是使用者提供資料，不是本次新取得的鏈上證據；原始 artifact／build-info 封存仍缺，不可因此重新部署。

## 操作與模組介面

首頁 Token 卡片開啟 `#token` 才載入 ERC-20 查詢；離開入口仍保留本頁交易資料。模組依賴公開 `useWallet()`、`captureTransactionSession()`、Sepolia Public Client 及共用 `useSepoliaBalance()`／RPC 錯誤分類。Wallet 原有連接與 Faucet 流程保持可用。

- 顯示連接帳號、目前網路、Sepolia ETH、三種完整精度餘額、最後查詢時間與安全 Etherscan 連結。未連接／錯鏈清除帳號資料；RPC 失敗不顯示零。各代幣核對錯誤獨立顯示，其他通過的代幣仍可操作。
- 同地址進行中查詢去重，同批合約鏈別核對去重；代幣手動更新最少 30 秒、無自動重試或餘額輪詢。ETH 沿用 Faucet：8 秒逾時、最多重試一次及限流退避。RPC 限流／故障時請稍候手動更新，課堂改用教材與教師示範，不展示假資料。
- 選擇固定代幣，輸入有效非零 Ethereum 地址與正十進位字串，拒絕負數、NaN、科學記號、超過 18 位小數、零及超額。所有金額使用 bigint、`parseUnits`／`formatUnits`。收款為自己時提示 Gas 消耗。
- 「檢查轉帳摘要」重新核對錢包帳號／鏈、合約完整 runtime（含 metadata）及 ERC-20 欄位與餘額，使用 `simulateContract`（必須回傳 true）、`estimateContractGas`、`getGasPrice`。Gas limit 與 legacy gas price 各加 20% 整數緩衝，檢查 ETH 足夠支付所顯示上限。預估與實際費用、確認時間有不確定性。
- 摘要列出完整帳號、網路、合約、收款地址、數量、代幣及 ETH 餘額、Gas limit、gas price 與費用上限。2 分鐘後過期；表單變更、帳號／網路／Provider／工作階段切換均使原摘要失效，切走再切回也不可沿用。
- 只有明確點「確認並開啟 MetaMask」才進入送出。送出前重做唯讀核對與模擬；Gas 條件超過已確認上限即阻止並要求新摘要。由原本選定的 MetaMask Provider 經 viem `createWalletClient`／`custom`／`writeContract` 發送標準 `transfer(address,uint256)`，停用 transport 重試。無 approve、transferFrom、批次或任意合約輸入。
- 錢包待確認期間切換帳號／網路時，網站提示拒絕已開啟的請求；網站無法撤回 MetaMask 已呈現的確認視窗。若已廣播，持續保留原始帳號與鏈追蹤，不把新帳號的資料套到舊交易。

## A-05 交易狀態與確認策略

`idle → validating → awaiting-wallet → submitted → confirming → success / failed / unknown`。準備摘要時也使用 validating；準備完成回 idle，必須另行確認。取得 hash 不等於成功。

確認使用 `waitForTransactionReceipt`，至少 1 個區塊確認、8 秒查詢間隔、最多 60 秒等待，僅對已發送交易追蹤。成功前重新讀 `getTransactionReceipt`、receipt 區塊、最新高度與實際交易；核對 status success、hash、canonical block hash、from、to、calldata、value = 0。至少 1 個區塊指包含該交易的區塊，並非額外等待一塊，更不是 Ethereum 最終確定性。

- Receipt reverted／實際替換或取消不符合原 transfer → failed。
- repriced／replaced／cancelled 保存原與替換 hash；只有實際交易仍符合原帳號、代幣、收款地址、數量且 receipt 成功才可成功。
- RPC 逾時、查無 receipt、重組或無法核對 → unknown；禁止新送出，保留原 hash，僅允許手動查原交易。重新核對成功才解除未知狀態；絕不自動重送。
- 發送階段逾時而無 hash 同樣 unknown，需先人工檢查 MetaMask 活動；本頁鎖定新送出，重新整理不是解決未知交易的方法。
- 使用者拒簽與前置檢查失敗 → failed，沒有成功交易假象。busy 防重複提交。
- 成功後重新讀取相關代幣餘額。成功交易仍允許手動查詢；若後續重組、receipt 消失，改為 unknown。無長期背景 finality 監控。
- 紀錄僅存在本頁記憶體。新交易開始時保留較早交易的 hash／原帳號／鏈，重新整理後不保證保存；學生應另保存 Etherscan 連結，網站不承諾完整歷史。

## 驗證與待人工驗收

[Task 06 驗收紀錄](../08-task-06-validation.md)記錄命令、Mock 案例與鏈上讀取限制。Mock Provider／RPC 與本機 EDR 都不等於真實 Sepolia 交易。正式發布前必須在允許的環境核對三種合約、Etherscan 來源及 runtime 封存，另由使用者授權並親自在 MetaMask 做兩帳號轉帳、拒簽、替換、CORS／RPC 與 30 人課堂演練。手機版僅驗證響應式畫面，手機跨 App 錢包連接仍未支援。Task 06 不新增合約、不發布、不開始 Task 07。
