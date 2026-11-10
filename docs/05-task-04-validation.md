# Task 04 驗證紀錄

日期：2026-11-10。基線為 main `f6636b1`，已含 Task 01 文件、Task 02 PR #1、Task 03 PR #2；開工工作目錄乾淨，自最新 origin/main 建立 `task-04-faucet`。

## 執行環境

Node 24.22.1、npm 11.9.0、viem 2.57.17；未新增套件或更動依賴版本。首次 npm ci 因預設 `/home/agent/.npm` 不可寫而失敗，改用 `npm ci --cache /tmp/dpl-npm-cache` 成功。

## 檢查結果

- `npm ci --cache /tmp/dpl-npm-cache`：通過，使用可寫暫存 cache；沒有變更 lockfile。
- `npm run lint`：通過，零警告；沒有停用規則或加入 eslint-disable／any。
- `npm run typecheck`：通過。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`：60 passed（desktop 30、mobile 30），包含 Task 03 回歸、Faucet HTTP Mock RPC、狀態與格式測試。
- `npm run build`：通過。既有 viem 間接依賴 ox 有 node:worker_threads 瀏覽器 externalization 提示，另有主 bundle 約 518 kB 的大小提示；production preview 測試通過，未調高警告門檻掩蓋訊息。
- `git diff --check`：通過。

測試使用 production preview，因此先 build 供測試使用，再於測試完成後執行最後 build。沒有以 Mock 測試取代真實外部驗證。

## React 時間與生命週期

冷卻顯示從狀態值 0 開始，只在 effect 中建立單次 timeout，並於 callback 讀取 Date.now() 更新狀態；render 僅比較 retryAt 與 now 狀態，不讀取目前時間。retryAt 改變或卸載時清除 timer，effect 不依賴 now，不會因更新 now 重建計時或發送 RPC。即使 effect 延遲至冷卻已過，也會安排一次立即更新，避免按鈕永久鎖住。

餘額 updatedAt 仍只在 getBalance 成功完成時產生。測試確認冷卻結束不更改更新時間、不輪詢，手動更新才取得新餘額與較新的時間；重複點擊只讀取一次。帳號／網路變更改用新 store，過期回應不能覆蓋目前帳號，舊載入狀態與更新時間會清除。

## 真實外部依賴

PublicNode POST `eth_chainId`／`eth_getBalance` 遭環境 CONNECT 403；未到 RPC，未驗證 CORS、鏈別或餘額。官方頁與 Faucet 公開資格查核見 [Faucet](modules/faucet.md)。沒有實際領幣、簽名、轉帳、30 人容量測試或 GitHub Pages 發布。Mock 僅驗證程式行為，真實 MetaMask、RPC、領幣入帳與校園網路須課前人工測試。
