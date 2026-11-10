# Wallet：錢包連接與網路檢查

## 實作與決策

Task 03 已實作 Wallet，保留首頁與六張模組卡片，Wallet 入口連至同頁錢包介面。未實作任何交易、簽章、資產查詢或其他模組。錢包連接不是學生身分認證，也不管理名冊或金鑰。

A-01 已確定：主要教學對象為 MetaMask 瀏覽器擴充功能；使用 EIP-1193 Provider，優先透過 EIP-6963 的 `io.metamask` 公告辨識 MetaMask，避免採用其他注入錢包。公告 metadata 不是安全認證，使用者仍應由官方安裝。沒有公告時，僅對單一、帶 MetaMask 標記且非已知其他錢包的 legacy Provider 回退；不猜測多 Provider 陣列。延遲注入可由後續公告發現，舊版擴充功能安裝後可重新整理。

鏈上函式庫使用精確鎖定的 **viem 2.57.17**（Task 03 安裝時的穩定版），相容現有 Node 24.22.1、React 19.3.1、TypeScript 6.0.3（viem 要求 TypeScript >=5.0.4）。目前用於 EIP-1193 型別、地址驗證／checksum、Chain ID 編碼及 Sepolia 鏈識別；不建立簽署器。React 使用原生 Context、Hooks 與 `useSyncExternalStore` 訂閱模組狀態，暫不引入 wagmi、Redux 或 Zustand。WalletConnect QR Code、手機跨 App 及多錢包進階管理延後。

A-02 已確定：Task 03 只使用錢包 Provider，呼叫 `eth_accounts`、`eth_chainId`、使用者觸發的 `eth_requestAccounts` 與 `wallet_switchEthereumChain`。不建立獨立 Public RPC、不使用 API Key。Task 04/05 再決定公共 Sepolia RPC、限流、備援與重試策略；不影響其他模組未決定的合約設計。

## 使用流程

1. 首頁 Wallet 卡片開啟同頁介面。未安裝時連至 [MetaMask 官方下載頁](https://metamask.io/download/)，不索取私鑰或助記詞。
2. 初次載入只讀既有授權，絕不自動呼叫授權或切換請求。解鎖後明確點擊「連接錢包」，在 MetaMask 選擇帳號並確認。
3. 顯示 checksum 地址與複製按鈕、目前網路名稱及 Chain ID。已知 Sepolia／Ethereum Mainnet 顯示名稱，其他鏈明示「其他／未知網路」與實際 Chain ID；無效 Chain ID 顯示未知且禁止交易。
4. 非 Ethereum Sepolia（11155111 / 0xaa36a7）時警告，只有明確點擊「切換至 Sepolia」才請求切換。若回傳 4902，不新增網路、不自動採用外部 RPC，請使用者在 MetaMask 開啟顯示測試網路並選擇 Sepolia。
5. 中斷網站工作階段只清除本頁狀態，忽略後續事件與過期請求結果；不是撤銷錢包端網站授權。請至 MetaMask 網站連線權限管理撤銷。重新整理可能恢復仍存在的授權。

## 公開介面與生命週期

由 `src/modules/wallet/index.ts` 匯出 `WalletProvider`、`useWallet()`、`WalletPanel` 與型別。App 組裝 Provider；未來 Token、Exchange、Portfolio 只依公開 Hook／型別，不直接讀內部 store。

| 欄位／方法 | 型別與意義 |
| --- | --- |
| address | viem Address 或 null；目前帳號 |
| chainId | number 或 null；目前網路 |
| connectionStatus | unavailable / disconnected / connecting / connected |
| isSepolia | chainId 是否為 11155111 |
| canTransact | 已連接、有效地址、Sepolia 且無進行中操作才為 true；不代表本階段已提供交易 |
| isBusy / error | 請求進行中與繁體中文錯誤訊息 |
| connect() | Promise<void>；明確操作請求連接，重複呼叫去重 |
| disconnect() | void；結束本頁工作階段 |
| switchToSepolia() | Promise<void>；明確操作請求切換 |

監聽 `accountsChanged`、`chainChanged`、`disconnect`，同步更新可交易狀態。非同步回應以工作階段與帳號／鏈版本防止覆蓋較新的事件；卸載、替換 Provider 清除三種事件監聽與 EIP-6963 發現監聽／計時器，避免重複訂閱。請求失敗以狀態回報，不向 UI 拋出未處理 rejection。

不使用本機儲存、不發送簽章或交易。Token 等模組未來送出前仍須重新核對帳號、網路與合約，不能只依賴 `canTransact` 快照。

## 驗證與限制

自動化使用 Mock EIP-1193 Provider，不將 mock 注入正式應用程式。Playwright 在桌面／手機 Chromium 尺寸驗證：無錢包、成功連接、拒絕連接、未解鎖／未授權、請求已進行中、中斷、錯鏈、成功／拒絕切換、未知網路與其他切換失敗、帳號／網路／空帳號事件、重複點擊、過期回應、重新載入既有授權、單一 legacy Provider 與 EIP-6963 多錢包選擇。另直接測試 store 的 canTransact、取消訂閱、卸載及重新掛載的事件清理。原首頁的子路徑、響應式與鍵盤測試仍保留。

尚未完成真實 MetaMask 擴充功能測試：實際解鎖、授權視窗、使用者拒絕、不同錢包共同安裝、實際 Sepolia 切換、4902 指引及錢包端撤銷權限需人工驗證。手機測試僅驗證響應式與 Mock Provider，不代表支援手機跨 App 連接。共用 receipt 策略仍屬 A-05，交易與其他模組未提前實作。

本次驗證結果：`npm ci`、`npm run lint`、`npm run typecheck`、`npm run build`、`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test` 全部通過；16 個案例各於 desktop／mobile 執行，共 32 passed。build 有 viem 間接依賴 ox 的 `node:worker_threads` 瀏覽器 externalization 提示；本模組未使用該功能，production preview 瀏覽器測試通過。

## Task 06 交易工作階段介面

`useWallet().captureTransactionSession()` 僅在目前可操作 Sepolia 時回傳 `TransactionSession`（address、chainId、原本選定的 provider、isCurrent），否則拒絕。Token 透過此公開介面使用同一個 MetaMask，不重新發現或改用另一個注入 Provider。`isCurrent()` 綁定 Provider／工作階段、帳號事件版本與網路事件版本，切換再切回也會失效；送出前仍需重新讀 eth_accounts／eth_chainId，不能只憑 React 狀態送出。此介面不自動簽署或發送。
