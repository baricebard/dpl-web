# Task 08B：AMM 本機部署與首次流動性

> 後續狀態：本文件保留當次任務紀錄。Task 08C 已依使用者提供的 Sepolia Pool 地址整合學生前端；最新操作、驗證與人工待辦見 [AMM 前端指南](17-amm-frontend.md)。下文「未部署／未開放」為當時狀態。

本工具僅供教師在自己的 Windows 電腦使用 localhost + MetaMask。PR #13 已合併，開發基底為最新 main `9c12a639d6eb6d63b1164d992ef8a3546990a3ab`。本次只開發與本機測試，沒有真實 Sepolia 部署、approve 或 addLiquidity。Pool 公開地址仍為 `null`；不修改既有合約、資產地址、公式或費率，不包含 Task 08C 學生操作。

## Windows 更新與啟動

安裝 Git for Windows、Node.js 24.22.1／npm 11.9.0、最新版 Chrome／Edge 及官方 MetaMask。已 Clone 者先保存自己的修改，於 PowerShell 執行：

```powershell
cd dpl-web
git fetch origin
git switch task-08b-amm-deployment
git pull --ff-only
npm ci
npm run contracts:compile
npm run deploy:local
```

未 Clone 者先 `git clone https://github.com/baricebard/dpl-web.git`。分支合併後可改用包含本工具的最新 main。PowerShell 若阻擋 npm.ps1，改用 `npm.cmd`。開啟 **http://127.0.0.1:5174/**，停止使用 Ctrl+C。固定同一 origin／瀏覽器 profile；不要使用公開 tunnel、LAN、雲端瀏覽器或 GitHub Pages 簽署。

頁面上方為「DPL AMM Pool — Deployment & Initial Liquidity」。已部署的三種 ERC-20 與 Fixed Exchange 舊工具收合在下方，**不要再次部署**。載入頁面只辨識 Provider，不要求連接、簽署或發送交易。不需要私鑰、助記詞或 RPC 金鑰。

## 連接教師 MetaMask 與部署

1. 手動選擇 Ethereum Sepolia，Chain ID **11155111**，教師帳號 **`0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`**。
2. 按「連接／核對 AMM 教師 MetaMask」。錯誤帳號、網路或 ETH 不足時停止。
3. 按「準備部署 DPLAMMPool」，核對固定 constructor：

| 參數 | 完整地址 |
| --- | --- |
| dplt | `0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e` |
| assetA | `0x53Ac929866423479c7C5746F76F398e8b3907d6E` |
| initialProvider | `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02` |

4. 核對 Hardhat 編譯器與來源 Commit、Contract Creation（無 to）、ETH Value = **0 Wei**、Gas 預估含 20% 餘裕、Gas Price 與上限費用。摘要 5 分鐘有效；費用增加須重新準備。
5. 勾選本筆確認框，按「確認部署 DPLAMMPool」，再親自核准 MetaMask。沒有自動部署、連續部署或背景重送。
6. 等待 Receipt，核對 Pool 完整地址、Hash、status、區塊及部署時間。工具核對原交易、receipt success、地址有合約，以及 dplt／assetA／initialProvider。只做必要唯讀檢查，沒有歷史 bytecode、metadata 或 Archive RPC 稽核。
7. 部署後查 totalSupply、getReserves 及兩種實際 balanceOf(Pool)。空池應全部為零。getReserves 未初始化時固定回零，**不能替代實際餘額檢查**。如已有 Token 捐贈，首次流程停止，提示價格可能受影響，由教師人工處理；不重新部署、不回收或轉移資產。
8. 保存地址及 Hash，匯出 JSON。重新整理會將部署成功狀態先降為結果未知；按「Reconcile AMM 部署原交易」核對後恢復。不能任意輸入 Pool 地址取代部署證據。

部署成功與「可首次注資」分別判斷：後續已初始化或收到捐贈不抹除原部署事實，但不再提供首次操作。

## 分別 approve 兩種代幣

1. 按「查詢 Pool／教師餘額及 allowance」。Pool 的 initialProvider 必須是指定教師，totalSupply／reserves／兩種實際 Token 餘額必須全零。
2. 教師需要 100 DPLT、3000 DPLT-A 及各筆操作的 Sepolia ETH。spender 固定為上述部署並驗證的 Pool 地址。
3. allowance 足夠時跳過該筆；不足時分別按「準備 approve 100 DPLT」與「準備 approve 3000 DPLT-A」。不串接操作。
4. 每筆核對代幣、精確數量、spender 完整地址、教師、網路、交易目標、Value 0 與 Gas，勾選確認並親自核准 MetaMask。
5. 保存 Hash，等 Receipt success，再重新讀 allowance，足夠後才顯示授權成功。**approve 成功不代表已注資**。

已審閱的 TeachingToken 使用標準 OpenZeppelin ERC20，非零但不足的 allowance 直接以本次精確值取代，不加上舊額度、不額外送清零交易。操作期間避免在其他頁面使用相同 spender；未知結果先查原交易，不能自動重試。工具沒有無限額授權。

## 首次 addLiquidity 與 LP 驗收

兩種 allowance 都足夠後，按「準備首次 addLiquidity」。工具重新核對教師、Sepolia、部署、initialProvider、未初始化、兩種實際池餘額為零、教師資產、allowance、ETH／Gas 與 simulateContract。失敗不提供確認。

| 參數／預期量 | 精確最小單位 |
| --- | --- |
| amountDPLTDesired、amountDPLTMin | `100000000000000000000` |
| amountDPLTADesired、amountDPLTAMin | `3000000000000000000000` |
| root／LP totalSupply | `547722557505166113456` |
| minLiquidity／教師 LP | `547722557505166112456` |
| 永久鎖定 LP | `1000` |

使用精確 bigint 整數平方根 `floor(sqrt(x*y))`；LP 18 decimals。預計總 LP 為 **547.722557505166113456**，教師取得 **547.722557505166112456**，另有 1000 個 LP 最小單位永久鑄造至 `0x000000000000000000000000000000000000dEaD`。初始價格 **1 DPLT = 30 DPLT-A**。

摘要顯示 Pool、兩種 desired／min、minLiquidity、Gas 與 Deadline（Unix 秒及 UTC ISO 時間）。Deadline 在準備時計算約 10 分鐘；摘要仍採 5 分鐘有效期。重新準備會產生新 Deadline。勾選完整摘要確認後才呼叫 MetaMask；送出前再次檢查帳號、網路、狀態、資產、allowance、Gas、模擬與期限。不能用 ERC-20 transfer(Pool) 代替 addLiquidity。

Receipt success 且至少 1 個區塊確認後，工具核對原交易及 Pool 的 AddLiquidity／兩筆 LP mint Transfer 事件，查詢 reserves、totalSupply、教師 LP、鎖定地址 LP 與兩種 Pool 實際餘額。預期 reserve 為 100／3000，實際餘額與 reserves 相等，LP 數值如上。畫面顯示完整最小單位。

後續正常 swap、LP 移轉或捐贈可能改變目前餘額。工具保留 Receipt 與首次鑄造事件證據，不單憑目前儲備不同宣告原注資失敗；會提示人工核對後續活動。只要鏈上 totalSupply 已非零，就關閉首次初始化入口，即使清空 journal 也無法重新初始化該 Pool。

## 未知結果與手動 Reconcile

沿用 [localhost 部署安全機制](08-local-deployment-tool.md)及 [Exchange 的 Journal 原則](13-exchange-deployment.md)。同頁 busy、同 origin Web Locks 與送出前同步 localStorage 持久紀錄共同阻擋重複點擊／多分頁。AMM 部署鍵為原 `JOURNAL_KEY:amm`；授權與注資使用 `dpl-amm-initial-v1:<教師地址>`，每筆有獨立 operation／Hash／receipt 狀態。

- 明確 4001 拒簽記為 rejected，可重新準備；不會自行再要求簽署。
- 不確定送出、RPC timeout、Receipt 或後續查詢失敗皆保留 unknown，禁止新操作。
- 有 Hash 時按該筆 Reconcile，核對原交易 from／to／data／value，查原 Receipt，並重新查 allowance、supply、LP 與兩種池餘額。沒有 Hash 時先從 MetaMask 活動找回原 Hash，再填入查詢。錯誤 Hash 不覆蓋原紀錄。
- Receipt revert 且必要狀態已讀取後才能重新準備；新操作仍需獨立摘要確認。部署嘗試本身不解除重部署鎖。
- 請勿清除 localStorage、換 origin、無痕視窗或另一台電腦繞過未知交易；跨電腦／不同瀏覽器的 Web Locks 不互通。只在單一教師瀏覽器操作。
- 替換、取消、長期 pending 或重組交由教師人工調查，不自動追蹤替換或重送。

## 匯出公開 JSON

按「匯出 AMM 公開部署與流動性 JSON」，下載 `dpl-amm-deployment-liquidity.json`：

- deployment：chain ID、教師、三個 constructor、來源 commit／完整 Solidity compiler、artifact／input／lockfile SHA-256、部署 Hash、Pool 地址、Receipt、block number／hash、Gas、部署時間（區塊 UTC ISO）。尚未取得欄位不補假資料。
- liquidity：兩種精確目標、預期 LP、分開的 approveDPLT／approveA／addLiquidity attempts、原始 Hash／calldata／Deadline／Receipt／區塊、事件核對及最近成功讀到的 Pool／教師餘額、allowance、LP 與查詢時間。
- bigint 為十進位字串；紀錄只有公開資料。JSON 是工具觀察紀錄，不是獨立稽核證明；匯出後自行保存。

## 本機驗證與人工待辦

```powershell
npm run lint
npm run typecheck
npm run build
npm run contracts:compile
npm run deploy:test
npm run deploy:test:ui
npx hardhat test nodejs test/contracts/DPLAMMPool.test.ts
git diff --check
```

測試只用 Mock Provider／本機 EDR；EDR 配置 chain ID 11155111 測試守門不代表存取 Sepolia。Pages 正式建置排除兩種 localhost 工具；掃描另外禁止 AMM artifact、Journal 標記與完整 bytecode，部署工具拒絕 build／preview，server 僅接受 loopback／localhost。

人工待辦：Windows 實機、官方 MetaMask、指定教師控制權、真實 RPC／Gas 核對；未來教師依指南逐筆部署、approve 與注資，保存 Pool 地址及 JSON。本次沒有發送任何真實鏈上交易，也沒有合併 main、發布網站或開始 Task 08C。

2026-11-12（Asia/Taipei）本機結果：`npm ci`、lint、typecheck、build（含 Pages 隔離）、contracts:compile、deploy:test **74 passing**（其中新增 AMM 31 項）、deploy:test:ui **6 passing**、AMM 合約測試 **38 passing**、Markdown 相對連結與 git diff --check 全部通過。build 保留既有 worker_threads 外部化及大於 500 kB chunk 提示。依賴／lockfile 與三份既有合約均未修改；測試沒有存取 Sepolia。
