# Task 05C-3：Windows 本機 Chrome 唯讀部署驗證

## 用途與狀態

本工具讓教師在自己的 Chrome 透過既有 Sepolia Public Client 直接讀取公開合約資料，避開 Codex 雲端代理的 403。它是獨立 localhost 開發入口，**不是原本的 MetaMask 部署頁**，不需安裝或連接錢包。沒有部署、轉帳、授權或簽署按鈕，也沒有私鑰／助記詞輸入欄位。

本次交付工具與本機模擬測試，沒有重新連接真實 Sepolia RPC／Etherscan，沒有執行任何公用鏈交易。歷史雲端失敗探測及未驗證結論保留於[09 報告](09-sepolia-deployment-verification.md)，不能以本次測試結果改寫為鏈上通過。未開始 Task 06，三種前端公開設定候選保持停用。

工作分支 `task-05c-readonly-verification` 建立於既有工具 commit `535671d`，Draft PR 以 `task-05c-deploy-tool` 為 base，依賴尚未合併的 [PR #6](https://github.com/baricebard/dpl-web/pull/6)。這樣審查差異只包含本次唯讀驗證功能；本次不合併任何 PR，也不修改 main。

## Windows 執行方法

使用官方 Node.js **24.22.1**、npm **11.9.0**、Git for Windows 及最新版 Chrome。既有 repository 先保存自己的變更，不要覆蓋原部署產物封存。一般 PowerShell 即可，不需要系統管理員。

```powershell
git clone https://github.com/baricebard/dpl-web.git
cd dpl-web
git fetch origin
git switch task-05c-readonly-verification
node --version
npm --version
npm ci
```

既有 clone 不需再 clone；先進入該目錄再從 `git fetch origin` 開始。若 PowerShell 阻擋 `npm.ps1`，可使用 `npm.cmd` 執行相同命令，不必關閉系統安全政策。

若已有原部署當時的完整 `artifacts/` 封存，先複製到此 checkout 的對應目錄，**不要先 compile 覆寫它**。沒有封存時，使用本分支鎖定的 compiler／依賴重建：

```powershell
npm run contracts:compile
```

重建是本機編譯，不發送交易。合約來源／Hardhat 設定／依賴沿用部署紀錄 commit `535671d93eea7d3b1ee90ea6f6963cc0431460e5` 的鎖定版本：Solidity `0.8.38+commit.1835d247.Emscripten.clang`、OpenZeppelin `5.6.1`、optimizer 200、Cancun。不要更新套件或改設定來消除差異。重建產物不會被冒充為原始封存，檔案 hash 與版本差異會顯示於證據。

```powershell
npm run verify:local
```

在 Chrome 開啟 **http://127.0.0.1:5175/**。可使用 http://localhost:5175/，固定使用同一入口即可；本工具不保存 localStorage。結束時於 PowerShell 按 Ctrl+C。

1. 在「公開部署紀錄 JSON」選擇自己原始的 `dpl-sepolia-deployment-record.json`；repository 也保留[使用者提供的公開紀錄副本](09-sepolia-deployment-record.json)，可以選取該檔。
2. 核對三個地址、名稱、教師地址及輸入檔 SHA-256。檔案只在瀏覽器內解析，不上傳到 RPC。只接受此任務的三種規格、教師地址與 Sepolia version 1 紀錄，最多 128 KiB。
3. 檢查「編譯產物」欄。缺少、過期、來源不符或版本不符會顯示原因；仍可執行公開查詢，但缺少產物的 runtime 比對維持「尚未驗證」。還原／重編譯後須重啟工具並重新載入頁面，以載入新的產物。
4. 按「執行唯讀驗證」。頁面載入／匯入檔案不會自動查詢 RPC；按鈕執行中停用，沒有輪詢或自動重送。
5. 檢視每種代幣的三態結果、每項 expected／actual／時間與共用檢查。展開底部「實際 RPC 請求、回傳證據與錯誤」可查看原始 hex 結果，包括完整 bytecode、receipt logs 及 eth_call 回傳。
6. 按「匯出 JSON 驗證結果」，下載 `dpl-sepolia-verification-result.json`。保留原始檔，不手動把尚未驗證改成通過。每次新查詢或換檔會清除前輪結果，避免舊成功畫面冒充本輪結果。

RPC 為既有無金鑰的 `https://ethereum-sepolia-rpc.publicnode.com`，透過使用者 Chrome 直接呼叫，沿用既有每請求 8 秒逾時、零 transport 重試；不透過 Vite 伺服器或 Codex 雲端代理。如果使用者所在地網路、供應商、限流或瀏覽器 CORS 仍阻擋，結果將保留錯誤與「尚未驗證」，不能假設查詢成功。本工具不提供保密金鑰輸入或未驗證的備援 RPC。

## 查核與結果解讀

第一步要求 RPC `eth_chainId = 0xaa36a7`（11155111）；錯鏈或讀取失敗即停止後續合約查詢。三個地址不同屬獨立離線檢查。接著取得最新區塊 H，將目前 code、metadata 與 balanceOf 全部固定在 H，結束前重查 H 的 hash 及 chain ID，偵測本輪端點錯鏈／區塊重組。

每種代幣核對部署 receipt 的 hash、from、to=null、status `0x1`、contractAddress、部署區塊與 canonical block hash，再驗證 receipt 中由該地址發出的唯一 Transfer 為零地址 mint 至教師，數量為 `1000000000000000000000000`。額外的 Transfer、錯誤數量／持有人或缺失 mint 會失敗。

目前 name／symbol／decimals／totalSupply 須符合既有規格，decimals 18、每種供給一百萬 tokens。教師目前 balanceOf 只確認能讀取整數，**不要求等於初始供給**；後續分發可減少餘額，轉回可增加餘額。本輪沒有查完整 Transfer 歷史，因此不宣稱已解釋所有餘額變動。

狀態定義：

| 狀態 | 意義 |
| --- | --- |
| 通過 | 本輪該項讀取成功且與預期相符；單一代幣只有所有必要共用／個別項目都通過才通過 |
| 失敗 | 取得可判斷的資料，確定與預期不同，例如錯鏈、revert receipt、錯地址、metadata 或 bytecode 差異 |
| 尚未驗證 | 未執行、RPC／CORS／逾時、receipt 為 null、格式錯誤、缺少產物或其他缺證據 |

若同時有失敗與缺證據，總狀態優先顯示「失敗」，但每項未知仍保留，不會被轉成已驗證。整體「通過」僅涵蓋本工具列出的檢查，**不包括 Etherscan exact/similar match、完整管理權限審計、完整轉帳歷史或 finality 策略**。

## Bytecode 與可重現性

伺服器重用既有 `loadDeploymentArtifact()`，核對 Hardhat artifact 與 build-info output 的 ABI／creation code／runtime，以及 build-info input 中每份來源與本機檔案、compiler、OpenZeppelin 與設定。這些是本機檔案核對，不會編譯或連 RPC。缺產物時回傳帶原因的 unavailable 狀態，介面仍可操作。

比對 `eth_getCode(address, receipt.blockNumber)` 及 H 的完整 runtime，包含 compiler metadata。輸出雙方長度、keccak256、第一個不同 byte offset 與原始 code。**不裁切 metadata，不把 ABI 相同、去 metadata 後相同或大部分 byte 相同視為完整通過。** 未解析的 immutable/link references 不支援，會標為尚未驗證。

畫面與匯出會保留本機 sourcePaths、compiler/settings、commit、artifact/input/lockfile hash 與部署紀錄對照。來源路徑、LF／CRLF 或 metadata 設定可能造成差異，但工具不會憑差異位置猜定原因；若 runtime 不同，一律失敗，需回到原封存及來源逐項調查。

`hashesMatchOriginalRecord=false` 明確表示本機產物／input／lockfile 並非逐檔完全符合原紀錄。若鎖定設定符合且完整鏈上 runtime 仍相同，本輪 runtime 比對可通過，但不宣稱已找回原始封存。09 報告已記錄原部署 lockfile hash 可由固定 commit 的 LF 內容轉成 Windows CRLF 精確重現。不要為了符合雜湊而默默修改來源或 JSON。

若要獨立重現原 commit，可另建 checkout，以免覆寫現有工作：

```powershell
git worktree add --detach ..\dpl-original-build 535671d93eea7d3b1ee90ea6f6963cc0431460e5
cd ..\dpl-original-build
npm ci
npm run contracts:compile
```

保存原 commit 的 artifact、build-info input/output 與當時來源換行／路徑證據，再回到驗證工具 checkout 使用。artifact 路徑為 `artifacts/contracts/TeachingToken.sol/TeachingToken.json`，build-info 使用 artifact.buildInfoId 對應的 `.json` 及 `.output.json`。不要只複製 ABI；工具仍會檢查本機來源與輸出一致。重新編譯的成功不能代替鏈上完整比對。

## 安全與 Pages 隔離

工具程式只允許 `eth_chainId`、`eth_getBlockByNumber`、`eth_getTransactionReceipt`、`eth_getCode`、`eth_call` 五種方法。沒有 injected provider 探索或 Wallet Client，不呼叫帳號授權、eth_sendTransaction、eth_sendRawTransaction、personal_sign 或 typed-data 簽署。本機 RPC 參數只含公開地址、hash、區塊及唯讀 call data。

獨立 Vite root 使用 port 5175、loopback 綁定、Host 與連線來源檢查、`publicDir=false`、關閉跨來源 CORS；config 拒絕 build／preview，頁面另檢查 DEV 和 localhost hostname。不要將此服務綁定 LAN 或公開 tunnel。正式學生網站 build 的模組圖禁止引用 tools/verify、scripts/verify 或虛擬產物；Task 06 整合後，正式建置允許三個公開代幣地址及學生 transfer，但模組圖拒絕本機工具／artifact 匯入，dist 掃描兩工具的專用入口／產物標記、Solidity 來源及完整 creation/runtime bytecode，防止本機功能發佈到 Pages。五種唯讀方法的引擎與 transport 邊界保持不變。沒有變更 Pages 發佈流程或觸發正式發佈。

## 測試與交付

```powershell
npm run contracts:compile
npm run verify:test
npm run verify:test:ui
npm run lint
npm run typecheck
npm run contracts:typecheck
npm run contracts:test
npm run deploy:test
npm run deploy:test:ui
npm run build
npm test
```

瀏覽器未安裝時依既有流程執行 `npx playwright install chromium`。Linux 可設定 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`。所有驗證 UI 測試攔截外部 HTTPS，使用 mock JSON-RPC，不會連真實 Sepolia；整合測試僅在 in-process Hardhat EDR 建立／轉帳測試 fixture，送給驗證引擎的介面只允許上述讀取。測試鏈被標為 11155111 只為守門測試，不代表真實 Sepolia。

單元測試涵蓋輸入驗證、錯鏈停止、receipt null／revert、地址不符、bytecode 空值／metadata 差異、供給／名稱、mint、重組、缺產物與 RPC 失敗；EDR 整合驗證真實編碼的 receipt／logs／歷史 code 與降低後餘額。瀏覽器驗證無錢包、手動查詢、raw HTTP 證據、匯出、換檔清除、缺產物與 Host 阻擋。不以測試替身作為真實部署驗證結果。

2026-11-10（Asia/Taipei）在 Linux 雲端、Node 24.22.1／npm 11.9.0 完成本輪驗證：

| 檢查 | 結果 |
| --- | --- |
| npm ci | 通過；依賴與 lockfile 無變更 |
| lint／typecheck | 通過 |
| contracts:compile／contracts:typecheck | 通過；Solidity 0.8.38／Cancun |
| verify:test | 28/28，含純引擎、artifact/build-info、EDR 整合與 build/preview 拒絕測試 |
| verify:test:ui | 4/4，mock HTTP，無真實外部 RPC |
| contracts:test | 24/24，本機 EDR |
| deploy:test／deploy:test:ui | 16/16、3/3，既有本機／mock 回歸 |
| npm run build | 通過，含正式模組圖與 dist 隔離檢查 |
| npm test | 60/60，桌面／手機既有回歸 |

初次 npm ci 因雲端家目錄 cache 不可寫失敗，改用 `/tmp` 的 npm cache 後通過；既有部署 UI 測試首輪因 Hardhat 設定目錄不可寫而未啟動，使用 `/tmp` 的 XDG 設定後 3/3 通過。沒有修改 HOME、依賴版本或測試條件來略過錯誤。Build 仍有既有 viem 間接依賴 `node:worker_threads` browser externalization 提示，未造成失敗。所有 `/tmp` 暫存腳本、log 與 lockfile 副本均未加入 Git；Hardhat 產物與測試產物保持忽略。

Windows 實機、使用者 Chrome 對真實 RPC 的 CORS／可用性、三筆鏈上結果及 Etherscan 仍待使用者本機執行；本輪沒有任何新增的真實 Sepolia 成功證據。

匯出 JSON 的 `task06Ready` 固定為 false；後續需人工審查本機實際查詢的來源與結果，補完 09 報告未完成項目，再另行授權 Task 06。公開設定草案不是目前學生網站配置。
