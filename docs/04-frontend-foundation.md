# Task 02：前端基礎工程

## 基線與交付狀態

以 Task 01 Commit `4172b8b23d7a0a7e92c07c70ce6e972c55aaa072` 為基線。本次授權前端工程，符合 AGENTS.md「後續只有在任務授權相應開發階段時才建立工具鏈或程式碼」的規範，未更改 Task 01 的架構決策。

已建立可開發、型別檢查、lint、建置與本機預覽的靜態前端，附 GitHub Pages 工作流程。這是路線圖階段 1 的部分交付，並非完整階段 1 或 MVP 驗收通過。Task 01 規格中的「本次文件任務」及階段 0 描述保留為原始規劃脈絡，實際進度以 README 與本文為準。

## 工具選擇與架構對應

| 項目 | 本次選擇與理由 |
| --- | --- |
| React／React DOM | 19.3.1；元件化介面，無大型 UI 框架 |
| TypeScript | 6.0.3，strict；符合 typescript-eslint 8.72.1 的支援範圍（低於 6.1），未使用尚不相容的 TypeScript 7 |
| Vite／React plugin | 8.3.7／6.3.0；React 開發、靜態建置與 `/dpl-web/` 子路徑 |
| Node.js／npm | 24.22.1／11.9.0；`.nvmrc`、engines、packageManager 與 lockfile 提供重現基線 |
| ESLint | 10.14.0，搭配 TypeScript、React Hooks 與 React Refresh 規則；不採已停止支援的 ESLint 9 |
| Playwright | 1.65.0；驗證 production preview 的桌面／手機、錨點、鍵盤與子路徑行為 |
| 樣式與導覽 | 原生 CSS media queries 與單頁錨點；無 router、狀態管理或 UI 套件 |

A-01 僅完成本階段必要的 UI 工具選擇。錢包、鏈上讀寫與狀態工具維持待決；A-02 沒有 RPC 呼叫，保留至整合前處理。A-10 的前端依賴與部署流程由本次任務確定，實際 Pages 設定與發布、合約地址及部署紀錄格式仍待後續處理。A-03 至 A-09 未變更。

`src/app/` 組裝應用程式，`src/app/pages/` 保存首頁；`src/shared/` 保存共用卡片、圖示、導覽與 CSS；`src/config/` 保存純展示的模組規劃與目標網路名稱／chain ID。沒有 RPC URL、虛構地址、ABI 或秘密設定。後續實作才建立 `src/modules/`、`src/lib/`，避免空目錄與不必要的抽象。

## 介面與功能邊界

- 以繁體中文為主，保留專業英文名詞，呈現平台名稱、中文副標及 Ethereum Sepolia 教學環境。
- 六個模組明確標示「尚未開放」，入口使用原生 disabled button，不發送任何交易或錢包請求。
- 網路面板標示「目標教學網路」與「尚未連接網路」，並非即時鏈上狀態。
- 不顯示假餘額、假交易、報酬或已完成的交易操作；保留零真實資金教學說明。
- 桌面三欄、平板兩欄、手機單欄；提供語言標記、語意化區塊、跳至主內容、鍵盤焦點及文字狀態。

## 部署與驗證

操作指令及首次 Pages 設定見 [README](../README.md)。流程僅接受 main push 與手動觸發，build／deploy 另以 main ref 限制。build job 僅有 contents／pages 讀取權限；deploy job 使用 pages write 與 OIDC id-token write，綁定 github-pages environment。官方 configure-pages、upload-pages-artifact、deploy-pages 分別配置、上傳與發布靜態內容。

本機驗證 `npm install`、`npm ci`、`npm run lint`、`npm run typecheck`、`npm run build`、`npm test` 及 `git diff --check`。瀏覽器測試檢查頁面與資源沒有 HTTP 錯誤、沒有未處理的 JavaScript 錯誤、沒有外部請求，六個入口停用，以及錨點重新整理、鍵盤操作與手機不橫向溢出。這些檢查不包含遠端 GitHub Actions 或 Pages 實際發布驗證。

## 下一階段

依 Wallet 規格先完成 A-01 的錢包／讀寫工具決策，再處理帳號與網路事件、錯網路、拒簽及中斷測試；RPC 決策由 A-02 處理。Faucet 下一步先提供經確認的外部 Gas 取得指引，教學代幣來源仍須 A-03／A-04 決策。合約與其他模組按既有路線圖進行。
