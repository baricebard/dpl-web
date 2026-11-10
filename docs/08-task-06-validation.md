# Task 06：實作與驗收紀錄

## 範圍與基線

2026-11-10，從最新 `origin/main`（`fb7af5b`，包含 Task 01～05C）建立 `task-06-token`。工作目錄起始乾淨，沒有下層 AGENTS.md。閱讀專案總覽、架構、MVP、路線圖、Wallet／Faucet、TeachingToken、Task 05 合約規格與 Task 05C 部署指南及既有 prepare／preflight 工具。main 沒有實際部署結果封存或部署後 metadata 驗證工具。

本次實作共用公開代幣設定、餘額、合約執行時核對、單筆 transfer、摘要與 A-05 追蹤。地址、初始教師及供給由任務提供，完整公開表見 [Token 模組](modules/token.md)。不重新部署，不做真實轉帳，不更動 Pages 工作流程或執行發布，不開始 Task 07。

## 技術與安全行為

- ABI 唯一引用 viem `erc20Abi`，對應 TeachingToken 繼承的標準 OpenZeppelin ERC20。鏈上身份是 chain ID + address，不能輸入任意合約。數量只用 bigint、formatUnits、parseUnits。
- Public Client：getChainId、getCode、readContract、getBalance、simulateContract、estimateContractGas、getGasPrice；Wallet Client：custom、writeContract。前置／送出前均核對 Metadata、Code、原 MetaMask 帳號／鏈及餘額，固定 transfer 不使用 approve。
- 摘要有收款地址、原帳號、代幣合約、數量、餘額、Gas limit／price／費用上限，需使用者明確確認，MetaMask 親自核准。表單變更或錢包工作階段版本改變使摘要失效。
- A-05：idle、validating、awaiting-wallet、submitted、confirming、success、failed、unknown。Hash 不等於成功。receipt success + 至少 1 個區塊 + canonical block 及實際交易內容核對才成功，成功後更新代幣餘額。
- 拒簽、RPC 逾時、Gas 不足、revert、Receipt 失敗、替換／取消、重組及帳號／鏈切換分流；unknown 不自動重送，已知 Hash 只重查原交易。無 Hash 的未知發送不能利用上一筆成功交易解除鎖定。
- 無餘額輪詢；代幣更新間隔 30 秒，同址／同批 chain ID 去重；ETH 重用 Faucet 查詢與共用 RPC 錯誤分類。receipt 最多追蹤 60 秒，每 8 秒查詢，viem receipt 重試設 0，之後手動查詢。
- 交易資料只存本頁記憶體，切換不抹除原 Hash／帳號／鏈；較早 Hash 也保留。重新整理後需自行保存的 Hash 或 MetaMask 活動繼續追蹤，無持久化歷史與背景 finality 保證。

## 真實鏈上讀取與證據限制

2026-11-10 22:09（Asia/Taipei），以 curl 對公開設定的 `https://ethereum-sepolia-rpc.publicnode.com` 發送唯讀 `eth_chainId`，代理回應 **HTTP 403 Forbidden / CONNECT tunnel failed**，尚未取得有效 chain ID，因此三種 code、name、symbol、decimals、totalSupply **本次未能重新核對**。這不是合約不存在或零餘額的證據。

新增 [read-deployed.ts](../scripts/contracts/read-deployed.ts) 方便之後以同一份公開地址與 ABI 重現唯讀核對。2026-11-10 22:17（Asia/Taipei）執行 `NODE_USE_ENV_PROXY=1 node scripts/contracts/read-deployed.ts`，於 eth_chainId 發生 `HttpRequestError / fetch failed`，未取得 metadata。此工具沒有 signer、部署、轉帳或秘密設定，不是新增測試命令，也不能取代 Etherscan 與 bytecode 完整驗證。

實際部署地址來自使用者提供的部署紀錄及先前核對回報；本次未取得部署 receipt／Hash、歷史 runtime bytecode 封存或 Etherscan full match 證據。保留 Task 05C 歷史指南，不補造資料。前端在使用者環境重新讀取每種合約；只有通過核對才啟用對應轉帳。Mock 核對通過不代表真實地址已通過本次鏈上驗證。

## 自動化命令與結果

工具鏈 Node 24.22.1、npm 11.9.0；未變更 package.json 或 lockfile，也未新增依賴。初次 npm ci 因預設 `/home/agent/.npm` 不可寫而失敗；改用可寫暫存路徑後完成。Hardhat 的預設使用者設定路徑同樣不可寫，使用 XDG 暫存路徑後完成，未變更 HOME 或系統權限。

| 命令 | 結果 |
| --- | --- |
| `npm ci --cache /tmp/dpl-npm-cache` | 通過，依既有 lockfile 安裝 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- --workers=4` | 通過，164/164（82 個案例各跑桌面／手機；含 Wallet／Faucet 回歸） |
| `npm run build` | 通過；viem/ox 的 node:worker_threads 瀏覽器 externalization 與 >500 kB bundle 提示仍存在，不影響本次瀏覽器測試；未隱藏警告 |
| `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache npm run contracts:compile` | 通過，solc 0.8.38 / Cancun |
| `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache npm run contracts:test` | 通過，24 項本機 EDR 測試 |
| `npm run contracts:typecheck` | 通過 |
| `git diff --check` | 通過；相對文件連結與變更範圍／秘密資訊檢查亦完成 |

## 測試案例對照

前端測試沿用 Playwright，桌面與 iPhone 13 尺寸 Chromium 皆執行，不新增測試命令。`token-service.spec.ts` 用 Mock EIP-1193 與注入 Mock RPC 驗證金額、送出／receipt 邊界；`token.spec.ts` 用 Mock Provider／HTTP RPC 在 production preview 操作真正 React 畫面。Wallet/Faucet 原有測試全部回歸。

| 任務案例 | 自動化覆蓋 |
| --- | --- |
| 1–2 未連接／錯 Sepolia | 教材仍可讀、無假餘額、轉帳停用、資料清除 |
| 3–5 三種餘額／零／RPC 失敗 | 三種完整精度、錯誤不等於零、Gas 分開展示 |
| 6–7 無 Code／metadata 不符 | Code、name、symbol、decimals、totalSupply、RPC chain mismatch 各自阻止操作 |
| 8–13 地址與數量 | 無效地址／零地址／零／負數／NaN／科學記號／超精度／超額 |
| 14 Gas 不足 | service 與 React 表單皆阻止摘要／發送 |
| 15 拒絕 MetaMask | failed、無 Hash、與 RPC 發送逾時的 unknown 分開 |
| 16–18 成功／reverted／逾時 | service 與瀏覽器成功，receipt 失敗，逾時保留 Hash 後手動重查 |
| 19–21 帳號／網路切換、快速切換 | 舊餘額不覆蓋、新摘要失效、A → B → A 事件版本隔離、廣播途中切換保留原帳號 |
| 22–23 防重複與無 approve | Promise 併發確認只發送一次；檢查唯一發送 calldata 為 transfer |
| 24–25 Hash／連結／成功更新 | React Etherscan 連結、成功後重新讀 DPLT，其他代幣保留各自餘額 |
| 26 替換／取消／未知／重組 | repriced 可成功；內容不同的 replaced/cancelled 不可成功；canonical hash 不符列 unknown；無 Hash 的新未知交易不被較早成功交易解除鎖定 |
| 27 最小／大整數 | 1 最小單位至 999999.999999999999999999，不使用浮點數 |
| 28 桌面／手機 | 表單、完整地址換行、無水平溢出、成功畫面截圖檢視；不是手機 MetaMask 跨 App 整合 |

## 尚未完成的人工驗收與發布門檻

- 在可連線環境重新核對三個實際合約與 RPC CORS／限流、部署 receipt 封存、Etherscan 原始碼 full match 及歷史 runtime bytecode。
- 由使用者另行授權並親自完成 MetaMask 真實兩帳號轉帳、拒簽、待確認時切換、Gas 價格變動、替換／取消及 Etherscan 對照。本次未簽署或執行任何真實 ERC-20 轉帳。
- 教師確認三種代幣分發、全班 Gas 與 30 人 RPC 容量及故障教材；Mock 與本機 EDR 不等於真實 Sepolia 交易或課堂驗收。
- 需 PR 審查與發布授權後才發布正式網站。本分支僅 Draft PR，不合併 main、不觸發 Pages。
