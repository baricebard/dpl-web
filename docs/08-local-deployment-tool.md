# Task 05C-2：Windows 本機 Sepolia 部署工具

## 狀態與範圍

本次只開發、測試工具，**未向 Sepolia 發送部署交易**，沒有真實合約地址或 Hash，未開始 Task 06。PR #4、#5 已合併後，從 main 建立 `task-05c-deploy-tool`。Solidity 原始碼與 Ignition 模組不變。

這個工具供教師日後在自己的 Windows 電腦操作，使用既有 Hardhat 產物及 MetaMask。不要在 Codex 雲端簽署。本文件不要求現在部署；實際交易需由教師另行決定並逐筆確認。

部署者及三種 initialHolder 固定為公開地址 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。viem 驗證、checksum 正規化，MetaMask 第一個授權帳號必須相同；不搜尋其他帳號替代、不提供地址修改欄位。

| 名稱 | Symbol | Decimals | Initial supply（基礎單位） |
| --- | --- | --- | --- |
| DeFi Portfolio Lab Token | DPLT | 18 | 1000000000000000000000000 |
| DeFi Portfolio Lab Asset A | DPLT-A | 18 | 1000000000000000000000000 |
| DeFi Portfolio Lab Asset B | DPLT-B | 18 | 1000000000000000000000000 |

每種供給為 1,000,000 tokens；這不是要傳送的 ETH。目標只接受 Ethereum Sepolia，chain ID `11155111`／`0xaa36a7`。

## 1. 安裝 Windows 環境及 Clone

1. 安裝官方 [Git for Windows](https://git-scm.com/download/win)、[Node.js](https://nodejs.org/en/download) **24.22.1**（專案 `.nvmrc`），使用 Node 附帶的 npm；預期 npm **11.9.0**。以一般使用者開啟 PowerShell，不需要系統管理員。
2. 安裝最新版 Chrome 或 Edge，以及從 [MetaMask 官方網站](https://metamask.io/download/)取得的擴充功能。請自行管理錢包；本工具不建立或匯入錢包，不收取私鑰／助記詞。
3. 在 PowerShell 執行：

```powershell
node --version
npm --version
git clone https://github.com/baricebard/dpl-web.git
cd dpl-web
git fetch origin
git switch task-05c-deploy-tool
npm ci
```

若此分支日後已審查合併，可改用包含本工具的最新 main。若 PowerShell 阻擋 `npm.ps1`，使用 `npm.cmd` 執行相同命令，不必關閉系統安全政策。請使用 repository 中的 lockfile，不自行升級 Solidity 或依賴。

## 2. 編譯與啟動（此步不發送交易）

```powershell
npm run contracts:compile
npm run contracts:test
npm run deploy:local
```

`deploy:local` 會先再次執行 Hardhat compile，再啟動獨立 Vite 開發伺服器。開啟 **http://127.0.0.1:5174/**；也可使用 http://localhost:5174/，但應固定同一 origin，因為部署紀錄按 origin 保存。不要使用普通 `npm run dev` 尋找部署入口。結束時在 PowerShell 按 Ctrl+C。

工具只允許 loopback 連線與 localhost Host，頁面另檢查 DEV 及 hostname；不設定 LAN、公開 tunnel 或遠端瀏覽器。不提供 build／preview；嘗試以本機部署設定 build 會直接失敗。正式 `npm run build` 的唯一入口仍為學生網站，完全不 import 此工具、ABI 或 deployment bytecode，且自動掃描 dist 防止洩漏。

產物缺少、來源過期、合約／Hardhat 設定／lockfile 未提交、依賴或編譯器版本不符時，停止使用。先取得審查過的乾淨 commit，再 `npm ci`、重新 compile；不要略過檢查、手改 bytecode 或改用瀏覽器 compiler。

## 3. 產物來源與檢查

使用 Hardhat `artifacts/contracts/TeachingToken.sol/TeachingToken.json` 及對應 `artifacts/build-info/` input／output。工具核對 ABI、creation bytecode、runtime bytecode、完整來源內容、compiler／OpenZeppelin 與 optimizer 200／Cancun。原始碼只在本機 Hardhat 編譯，瀏覽器使用 viem `encodeDeployData`，沒有 Solidity compiler。

頁面「Hardhat 編譯產物來源」及 JSON 匯出含 Git commit、Solidity 完整版本 `0.8.38+commit.1835d247.Emscripten.clang`、OpenZeppelin `5.6.1`、lockfile／artifact／input SHA-256、build-info ID 及完整 settings；每筆送出前也會保存當時 provenance 與 deployment data keccak256。

實際部署前將 **當時的** artifact、build-info input／output 及 lockfile 複製到個人離線封存位置，不提交生成產物。匯出的 JSON 是公開紀錄，不包含完整 Standard JSON input；Etherscan 驗證仍需封存的原始 input。合約驗證步驟見 [Sepolia 指南第 7 節](07-sepolia-deployment-guide.md#7-sepolia-etherscan-原始碼驗證)。

## 4. 明確連接並核對 MetaMask

頁面只發現 provider，不會在載入／Effect 要求授權或發交易。優先使用 EIP-6963 的 `io.metamask`，沿用既有 `src/lib/web3/provider.ts`；沒有 announcement 時才使用無歧義的單一 legacy MetaMask。EIP-6963 metadata 不是安全認證，仍要確認安裝來源及錢包畫面。

1. 在 MetaMask 開啟測試網路，手動選擇 **Ethereum Sepolia**；不是 Ethereum Mainnet、其他 Sepolia L2 或同名自訂網路。
2. 選擇上述指定地址；若你沒有此地址的控制權，停止，不要求或傳送任何人的私鑰。
3. 按「連接／重新核對 MetaMask 與餘額」，親自授權。工具讀取 `eth_accounts` 第一個帳號與 `eth_chainId`，不符合就阻擋。沒有自動切換或替代帳號。
4. 核對頁面的 Sepolia ETH 餘額。讀取經過已選定的 MetaMask provider，不需要輸入 RPC 金鑰或 `.env`。查詢失敗不當成零。
5. 每次切換帳號、網路或斷線，準備資料立即失效，須重新連接及準備。MetaMask 視窗已開啟後仍須自行確認其顯示的鏈與帳號；工具無法撤回錢包已接收的要求。

## 5. 日後逐筆部署（現在不需執行）

一次只處理一種：DPLT → 完成查詢／紀錄 → DPLT-A → 完成查詢／紀錄 → DPLT-B。沒有「部署全部」或自動連續交易。

1. 按該代幣「準備部署」。此時只讀取帳號／鏈、預估 Gas 與餘額，不送出交易。
2. 核對四個 constructor 參數順序：name、symbol、固定 initialHolder、完整整數 initialSupply。確認 decimals 18、11155111、**Contract Creation 無 to**、**ETH Value 0 Wei**。
3. 畫面顯示 Gas 估計含 20% 餘裕、Gas Price 及費用上限；餘額不足就停止。使用明確 gas／legacy gasPrice 限制費用；沒有自動加價。估計不是執行成功保證。確認有效期 5 分鐘；重新估計超過已確認值就要求重新準備。
4. 勾選本筆確認框，再按「確認部署」。工具會重新讀取帳號、chain ID、餘額、Gas，重新編碼比較 constructor data，並在最後一次非同步預檢後確認無 to、value 0。帳號／鏈事件會使舊準備失效。
5. MetaMask 彈出後，再親自核對網站、鏈、指定地址、部署用途、Value 0、Gas 及資料，才自行核准。任一欄不符請拒絕。不要接受其他轉帳、approve、未知簽章或秘密輸入要求。
6. Hash 回傳時狀態為「已送出交易／等待 Receipt」，**尚未成功**。工具等待 Receipt，核對原交易 sender、creation、value、完整 data、receipt hash、runtime code，並在部署區塊讀取 name、symbol、decimals、totalSupply 及 initialHolder balance。
7. 全部通過才標示「成功」。receipt revert 為「失敗」；逾時、查詢錯誤、runtime／metadata 不符為「結果未知」。成功不代表 finality，也不代表完成 Etherscan 原始碼驗證。教學啟用前需再次確認主鏈 receipt/code 及原始碼驗證。
8. 按「匯出公開部署紀錄 JSON」，保存後再準備下一種；手動補記 Etherscan 驗證及後續確認結果。

## 6. 未知結果、重複部署與復原

狀態區分：尚未部署 → 等待使用者確認 → 等待 MetaMask 簽署 → 已送出交易 → 等待 Receipt → 成功／失敗／結果未知。

- 送出前同步寫入 localStorage；寫入失敗不會送出。每種代幣有持久嘗試鎖，同頁 busy 防雙擊，Web Locks 防同 origin 多分頁並行。請勿同時使用其他 origin、瀏覽器、使用者 profile 或電腦操作；這些環境無法共享鎖與紀錄。
- RPC 送出逾時即使沒有 Hash，也可能已廣播。永久保留嘗試鎖，不自動重送。只有 MetaMask 明確回報 `4001` 使用者拒簽，才解鎖重新準備；鏈上 revert 也不自動解鎖。
- 有 Hash 時按「查詢原交易（不重送）」。重新整理後未完成嘗試顯示未知，仍可查詢原 Hash；這是手動唯讀重查，不簽署。
- 沒有 Hash 時先查 MetaMask 活動與 Sepolia Etherscan 的指定部署者紀錄；找到原 Hash 後填入查詢欄。工具先核對該交易的 from、無 to、value 0 及完整 data，才允許追蹤。
- 不明交易、替換／取消、重組或長期 pending 由教師人工調查；不自動追蹤替換交易、不提供重置部署鎖按鈕。不要清除 localStorage、改無痕或重開另一個 origin 以繞過未知結果。
- 紀錄毀損或瀏覽器禁止 localStorage 時停止。不要以刪除紀錄當成修復；先保存現有資料並查鏈上結果。

## 7. Etherscan 與真實紀錄

從每筆 Hash 的工具連結開啟 [Sepolia Etherscan](https://sepolia.etherscan.io/)，確認網址。核對交易 Success、From 指定地址、To 為 Contract Creation、Value 0、contractAddress、block number/hash、gasUsed、effectiveGasPrice 及實際費用。查合約地址的 Code／Read Contract，依 [07 指南](07-sepolia-deployment-guide.md)使用精確 compiler 和 Standard JSON input 做 exact/full match。

將匯出 JSON、產物封存位置與以下人工結果填入自己的部署紀錄；目前仍全部待部署，不得捏造：

| 欄位 | DPLT | DPLT-A | DPLT-B |
| --- | --- | --- | --- |
| 真實 contractAddress | 待部署 | 待部署 | 待部署 |
| 原始／替換 Hash | 待部署 | 待部署 | 待部署 |
| Receipt／區塊／確認數／檢查時間含時區 | 待部署 | 待部署 | 待部署 |
| Code／metadata／supply／holder balance | 待部署 | 待部署 | 待部署 |
| Etherscan exact match 與連結 | 未驗證 | 未驗證 | 未驗證 |
| 匯出 JSON 與 Standard JSON 封存位置 | 待填 | 待填 | 待填 |

三個實例地址應不同；不得直接填入學生網站配置或開始 Task 06，除非另行授權。原始碼驗證不是部署交易，不應要求私鑰或 MetaMask 交易核准。

## 8. 安全與本機測試

絕不把私鑰、助記詞、錢包匯出檔或 RPC 秘密寫入聊天、Repository、`.env`、`VITE_*`、截圖或 JSON。此工具沒有這些輸入欄位，不使用本機私鑰、雲端簽署、主網、自動重送或自動連續部署。公開地址、constructor、Hash、receipt 與 compiler provenance 可匯出，仍應自行保管紀錄避免遺失。

```powershell
npm run lint
npm run typecheck
npm run contracts:compile
npm run contracts:typecheck
npm run contracts:test
npm run deploy:test
npx playwright install chromium
npm run deploy:test:ui
npm run build
npm test
```

`deploy:test` 使用 Mock EIP-1193 包住 in-process Hardhat EDR，僅將**本機模擬** chain ID 設成 11155111，以測試 Sepolia 守門；沒有 HTTP 公用鏈、真實錢包或遠端簽署。`deploy:test:ui` 只注入 Mock MetaMask，測連接、準備、明確確認、拒簽與 Host 限制。正式網站原有 Playwright 測試仍只跑 production preview。

正式 build 自動檢查 `dist/` 沒有部署入口、sender、持久鎖識別字及 TeachingToken bytecode；部署工具的 Vite config 拒絕 build。這些測試不代表真實 MetaMask、Sepolia RPC、Etherscan 或 Windows 實機已驗收。

## 9. 本次驗證紀錄

2026-11-10 在 Linux 雲端環境使用 Node 24.22.1／npm 11.9.0 完成本機檢查：lint、前端 typecheck、production build 與模組圖／產物隔離檢查、Hardhat compile、合約 typecheck 通過；既有合約 24 項、本機部署工具 16 項、Mock 瀏覽器部署介面 3 項及原有桌面／手機前端 60 項通過。沒有變更依賴版本或 lockfile。Build 仍有 viem 間接依賴的 `node:worker_threads` browser externalization 提示，未造成失敗。

所有部署交易只存在 in-process Hardhat EDR。真實 Windows、MetaMask 擴充功能、多錢包行為、指定帳號控制權、Sepolia ETH／Gas／RPC、三筆真實 receipt／code／metadata／餘額、後續確認／重組與 Etherscan exact match 均未驗證；留給日後另行授權部署。
