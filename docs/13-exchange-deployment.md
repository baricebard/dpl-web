# Task 07B：Windows 本機 Exchange 部署與庫存注入

本次只開發與本機測試工具，沒有發送任何 Sepolia 交易。PR #10 已合併，開發基底為 main 的 `59db139b12a7eb1b6d5d7dc9710c7ebf3a5b7a23`。既有三種 ERC-20 不需重新部署，合約、地址及固定匯率保持不變。學生 Exchange UI 留待 Task 07C。

> 後續 Task 07C：使用者已提供部署／注入紀錄與 Exchange 地址 `0xd0bc9E38a7fA59C9ee306Ef28D1Fa5B001957e3B`（Sepolia）。本文件保留 07B 工具開發當時的紀錄，不要求再次部署或注入。學生前端與人工驗收見 [Task 07C](14-exchange-frontend.md)。

## Windows 安裝、更新與啟動

使用 Git for Windows、Node.js 24.22.1、npm 11.9.0、最新版 Chrome／Edge 與官方 MetaMask。一般使用者 PowerShell：

```powershell
git clone https://github.com/baricebard/dpl-web.git
cd dpl-web
git fetch origin
git switch task-07b-exchange-deployment
git pull --ff-only
npm ci
npm run contracts:compile
npm run deploy:local
```

已 Clone 者從 `cd dpl-web` 開始，先保存自己的修改；分支經審查合併後可改用包含本工具的最新 main。若 PowerShell 阻擋 npm.ps1，改用 `npm.cmd`。開啟 **http://127.0.0.1:5174/**，結束時 Ctrl+C。固定同一 origin／瀏覽器 profile 操作；不要用 LAN、公開 tunnel、GitHub Pages 或 Codex 雲端簽署。

沿用 [localhost 工具安全機制](08-local-deployment-tool.md)：只允許 loopback 與開發模式，拒絕 build／preview；正式 Pages 模組圖及產物掃描禁止工具、artifact 與完整 bytecode。Hardhat 產物載入器沿用來源、版本、settings、lockfile 與 commit 追溯。瀏覽器只有 viem 編碼與 MetaMask Provider，不需要私鑰、助記詞或 RPC 金鑰。

## 連接與部署 Exchange

1. MetaMask 手動選擇 **Ethereum Sepolia（11155111）** 及教師帳號 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。
2. 在「DPL Exchange — DPLFixedExchange」按「連接／核對 Exchange 教師錢包」。頁面載入只辨識 Provider，不要求授權或自動發送交易。
3. 按「準備部署 DPL Exchange」，核對 constructor 順序：

| 參數 | 固定地址 |
| --- | --- |
| dplt | `0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e` |
| assetA | `0x53Ac929866423479c7C5746F76F398e8b3907d6E` |
| assetB | `0xA8E2854c62A46329838f9922587adBbEb007072f` |
| administrator | `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02` |

4. 核對帳號、Sepolia、Hardhat compiler provenance、Gas 預估含 20% 餘裕、Gas Price、費用上限、Contract Creation（無 to）、**ETH Value = 0 Wei**。確認有效期 5 分鐘；費用增加或錢包變更須重新準備。
5. 勾選本筆確認框，按明確的「確認部署」按鈕，再親自於 MetaMask 核對及核准。保留的三種 ERC-20 舊部署區不需操作。
6. 等待「等待 MetaMask 簽署 → 已送出交易 → 等待 Receipt → 成功／失敗／結果未知」。Hash 不代表成功。成功需核對 receipt success、chain ID、地址有 code、dplt／assetA／assetB、owner 等於教師、paused false，以及六方向 quote 的預期整數固定匯率。只讀目前狀態，不進行完整 bytecode、metadata、Archive RPC 或 Etherscan 自動稽核。
7. 保存 Exchange 地址、Hash，立即匯出公開 JSON。部署時間採 receipt 區塊 timestamp 的 UTC ISO 字串。成功不表示最終確定性。

查詢失敗或欄位不符顯示「結果未知／未驗證」，停止注入，不宣稱成功，不自動重新部署。重新整理後 Exchange 成功狀態也先降為結果未知，按「查詢 Exchange 原交易（不重送）」重新驗證後才開放注入。若沒有 Hash，先查 MetaMask 活動，填入原 Hash；不得填入其他部署或手動輸入 Exchange 收款地址。

## 分別注入三種庫存

部署驗證通過後：

1. 按「查詢 owner／paused／三種 reserveOf」。目前庫存未驗證時，所有注入按鈕停用；RPC 錯誤不顯示零。
2. 目標為 **DPLT 1,000、DPLT-A 30,000、DPLT-B 6,666**，全部 18 decimals。待補量使用 bigint：`max(目標 - 最新 reserveOf, 0)`。已達目標即停止初始注入。
3. 只選一種代幣按「準備注入」。再次驗證 Exchange 與目前庫存，檢查教師代幣及 ETH 餘額、估計 Gas。
4. 核對代幣、差額、收款 Exchange、Gas 與 Value 0；勾選本筆確認，再按「確認注入」，親自核准該筆 MetaMask。交易只呼叫既有 ERC-20 的 **transfer(Exchange, 差額)**，沒有 approve、transferFrom 或無限授權。
5. 送出前再查最新庫存及 Gas；差額或費用增加時原確認失效，需重新準備。每筆獨立完成，不自動串接三筆交易。
6. Receipt 成功後重新查三種 reserveOf，畫面顯示實際餘額。庫存在交換開始後可能變動，工具不承諾固定餘額。
7. 重複上述步驟處理另外兩種代幣，每次都需獨立確認；最後再查 reserveOf 並匯出 JSON。

只提供 owner／paused／reserveOf 查詢，沒有 pause、unpause 或 withdrawReserve 管理按鈕，也不會自動提領。

## 失敗、未知結果與持久紀錄

沿用同頁 busy、同 origin Web Locks 與送出前同步寫入 localStorage。Exchange 部署使用原部署 journal 的 `:exchange` 子鍵；庫存使用 `dpl-exchange-funding-v1:<教師地址>`。寫入失敗就停止送出；4001 明確拒簽可以重新準備，其餘不確定送出維持鎖定。

- 部署只允許一次嘗試；receipt revert 也不開放自動重新部署。
- 任何注入結果未知時，阻擋所有新注入。查詢原 Hash、核對原交易 from／to／data／value、receipt 及三種 reserveOf 後，才可準備其他操作。沒有 Hash 時先從 MetaMask 活動找回。
- 注入 receipt revert 且 reserveOf 查詢完成後，可以重新準備差額；這仍是新的明確確認與 MetaMask 核准，絕非自動重送。
- Receipt success 但後續 reserveOf 查詢失敗仍為結果未知；查詢失敗不等於沒有注入。
- 不清除 localStorage、切換 origin、無痕或另一電腦繞過鎖。同 origin 鎖不能協調不同電腦、瀏覽器或其他手動交易，教師應只在一處操作。
- 長期 pending、替換、取消與重組需人工調查；不自動追蹤替換、不重送、不提供清鎖按鈕。保存原 JSON 與 MetaMask 紀錄。

## 公開 JSON 格式

按「匯出 Exchange 部署與注入公開 JSON」，下載 `dpl-exchange-deployment-funding.json`，包含：

| 欄位 | 內容 |
| --- | --- |
| deployment.version／chainId／deployer／mode | 版本、11155111、教師與 exchange |
| deployment.exchange | 合約名稱、依序四個 constructorArgs |
| deployment.provenance | Git commit、compiler 完整版本、OpenZeppelin、lockfile／artifact／input SHA-256、build-info ID、settings |
| deployment.records.exchange | status、attempted、hash、contractAddress、blockNumber／blockHash、receiptStatus、gasUsed／effectiveGasPrice、checkedAt、deployedAt、送出時 provenance 與 deploymentDataHash |
| funding.targets | 三種固定代幣地址與目標基礎單位 |
| funding.attempts[] | token、收款 address、基礎單位 amount、transfer data、status、hash、receiptStatus、blockNumber、checkedAt、rejected、message |
| funding.reserves／owner／paused／exportedAt | 最近成功讀取的三種庫存、管理權、暫停狀態與匯出時間 |

bigint 全部匯出十進位字串，未取得欄位會省略，未知狀態不補假資料。JSON 為公開紀錄，無秘密；它是工具觀察紀錄，不是獨立鏈上稽核證明。部署尚未執行時不會有真實地址或 Hash。

## 本機驗證與人工待辦

```powershell
npm run lint
npm run typecheck
npm run build
npm run contracts
npm run deploy:test
npm run deploy:test:ui
git diff --check
```

`contracts` 彙整既有 compile、合約 typecheck 與本機合約測試。新增測試使用 in-process Hardhat EDR，僅將本機 chain ID 標成 Sepolia 以測守門；Mock Provider 測拒簽、未知送出、receipt 失敗／逾時與查詢故障。瀏覽器測載入不發送、獨立確認、拒簽、重新整理、Host 與多分頁鎖。這些結果不代表 Windows 實機、真實 MetaMask、Sepolia RPC／Gas 或真實部署已通過。

人工尚待：Windows 安裝、教師確認控制權及 Gas，親自部署一次 Exchange、保存地址與 JSON，分別核准三筆庫存 transfer、確認實際 reserveOf。此次未執行任何真實部署或庫存注入；不合併 main、不開始 Task 07C。

2026-11-11 本機驗證結果：lint、typecheck、build（含 Pages 隔離）、contracts、deploy:test、deploy:test:ui 及 git diff --check 均通過。合約測試 80 項；部署／庫存與建置守門共 43 項（新增 Exchange／庫存 25 項）；Mock Chromium UI 4 項。正式 build 保留既有 chunk 超過 500 kB 提示。依賴及 lockfile 未變；Linux 的 Hardhat XDG 目錄設至 /tmp，Chromium 使用 /usr/bin/chromium。沒有重新執行無關的歷史 Sepolia／runtime 稽核。
