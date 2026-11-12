# Task 08C：AMM Swap 與學生流動性操作

## 範圍與部署資料

Task 08A PR #13、08B PR #14、08C PR #15 均已合併。Task 08C-UX 從最新 main 建立 `fix/amm-ux-workflow`，只改善 Liquidity 學生操作流程與結果呈現，沿用既有交易服務及安全檢查。沒有修改／部署智能合約、真實 Sepolia 交易或發布網站；Portfolio 不在本次範圍。

使用者提供 Ethereum Sepolia（11155111）Pool：`0x58841DBfDBa420B52fedbEe07AC9414E74E382F2`。DPLT `0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e`、DPLT-A `0x53Ac929866423479c7C5746F76F398e8b3907d6E`；initialProvider `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。本次地址採任務提供紀錄，不宣稱獨立完成真實鏈上核對。

初始化紀錄為 100 DPLT／3000 DPLT-A，LP 總供給 `547722557505166113456`、教師持有 `547722557505166112456`、永久鎖定 1000 個最小單位。**這些歷史值不作為畫面預設儲備或報價**。畫面只呈現當前 RPC 查詢；空池與查詢失敗分開，不提供學生初始化入口。

## 學生操作速查（08C-UX）

先在 Wallet 連接 MetaMask，確認 Ethereum Sepolia 與足夠 Gas，再進入 Liquidity。三種操作分頁各有步驟、輸入、估算、授權、摘要、最終確認及結果；目前步驟以文字及色彩突出，摘要與結果會取得焦點，方便投影及手機操作。

- **Swap**：選「交換代幣（AMM Swap）」→ 設定支付代幣與數量 →「查詢交換報價」並查看匯率、0.3% 費用、Price Impact、最低收到量 → 必要時按「授權 X 代幣」，查看摘要並確認授權 →「查看交換摘要」→ 核對後按「確認交換」→ 在 MetaMask 確認 → 等待「交換成功」。
- **Add Liquidity**：選「提供流動性（Add Liquidity）」→ 輸入一種代幣數量 →「計算提供流動性」查看另一種數量及預估 LP → 分別完成不足的 DPLT／DPLT-A 授權 →「查看注資摘要」→「確認提供流動性」→ 在 MetaMask 確認 → 等待「提供流動性成功」。
- **Remove Liquidity**：選「移除流動性（Remove Liquidity）」→ 查看目前 LP 與份額 → 選 25%、50%、75%、100% 或自行輸入 LP →「計算移除流動性」查看兩種預計取回量 →「查看移除摘要」→「確認移除流動性」→ 在 MetaMask 確認 → 等待「移除流動性成功」。不需要授權 LP。

**授權完成 ≠ 交易完成。** 授權只允許 Pool 使用指定代幣；畫面會顯示「授權完成，但尚未交換／提供流動性」，重讀 allowance 後標示各代幣是否已授權。額度足夠就不再要求 approve，突出查看交易摘要的下一步；仍須明確確認真正的 Swap／Add，網站不會自動送出。兩種代幣皆未授權時，Add 最多需要三筆獨立交易。

真正完成須核對對應 Receipt、交易身分及 Swap／AddLiquidity／RemoveLiquidity 事件。結果在同一操作區顯示實際支付／投入／取回量、鑄造／銷毀 LP、錢包餘額、LP 持有量、池中份額、Pool 儲備前後變化及 Hash（可開啟 Sepolia Etherscan）。LP Token 名稱為 DPL-LP；持有量及份額也可在操作區下方的池資訊查看。

前後比較使用確認送出前重新檢查的單區塊快照，以及 Receipt 確認後重查且區塊不早於 Receipt 的快照，隨該筆交易保存，不拿之後的全域餘額代替。快照間其他交易也可能影響餘額／儲備；本筆實際數量以事件為準。缺可靠快照、帳號已切換或 RPC 更新失敗時顯示「尚無法確認前後餘額」，不以估算補值。可按「查詢原交易」重查；未知結果保存 Hash 並停止送出，不要重複交易。

切換操作或修改輸入後，已完成結果移到「本頁較早交易」，不沿用至新操作；帳號／網路切換使未送出摘要失效。紀錄僅存本頁記憶體，重新整理前請保存 Hash。

## AMM Swap

1. Wallet 連接 MetaMask 並切換 Sepolia，開啟首頁 Liquidity。
2. 選擇 AMM Swap、支付代幣與數量。支援 DPLT ↔ DPLT-A，Max 使用已讀取錢包餘額；不套用固定匯率 Exchange 的額度。
3. 按「查詢交換報價」。正式輸出只取自 `quoteSwap(tokenIn, amountIn)`，同時顯示輸出資產儲備、價格、Fee、Price Impact、Minimum Received。
4. allowance 不足時檢查對應代幣授權摘要，核對 Pool spender、精確本次數量、原帳號、Sepolia 與 Gas，明確確認，再親自核准 MetaMask。
5. Receipt 成功後重新查詢 allowance，保留報價流程，另行查看交換摘要並按「確認交換」。已有足夠 allowance 時略過 approve。
6. swap 成功需 Receipt success、至少一個區塊、canonical block、原帳號／目標／calldata／value 與 Swap 事件核對；畫面將事件結果標示為實際成交量。

`swap(tokenIn, amountIn, minAmountOut, deadline)` 的 ETH value 為零。報價／摘要有效 2 分鐘；deadline 準備時計算約 10 分鐘 Unix 秒，確認前再次檢查且至少保留 15 秒。輸入、操作、帳號或網路變更使未送出摘要失效。

## Fee、Price Impact 與 Slippage

所有代幣金額使用 `bigint`／`parseUnits`／`formatUnits`，18 decimals。不以 JavaScript Number 計算鏈上金額。

令 `x`、`y` 為輸入／輸出儲備，`a` 為輸入：

```text
合約報價 = floor(y * a * 997 / (x * 1000 + a * 997))
理論 Fee = a * 3 / 1000（全部輸入入池，費用不另轉走）
交易前即時價格 = y / x
預期平均成交價格 = quotedOut / a（含費用）
交易後預估價格 = (y - quotedOut) / (x + a)
Price Impact = (a * 997) / (x * 1000 + a * 997) * 100%
```

Price Impact 顯示曲線造成的平均價格下降，排除 0.3% Fee；整數捨入另有極小影響。價格與份額顯示向下截斷至六位小數，極小差異可能顯示為零；金額與鏈上保護仍保留完整整數精度。價格是池比例教學資訊，不是可信 Oracle 或真實市價。

Slippage Tolerance 是允許實際執行結果相對報價的最大不利偏差，與 Price Impact 不同。預設 0.5%；快捷 0.1%、0.5%、1.0%，自訂 0% 至 5%，最多兩位小數：

```text
slippageBps = 百分比 * 100
minAmountOut = floor(quotedOut * (10000 - slippageBps) / 10000)
```

最低量為零則拒絕。確認時重新查詢與模擬，保留原摘要的最低量與 deadline，不悄悄降低保護。新報價低於原最低量、Gas 上升、餘額／allowance 不足或工作階段失效會阻擋送出。

## 固定匯率 Exchange 比較

相同輸入呼叫 `0xd0bc9E38a7fA59C9ee306Ef28D1Fa5B001957e3B` 的 `quote()`，並檢查 `reserveOf()`／`paused()`；顯示固定輸出、AMM 輸出、AMM 減固定的差額、AMM Fee／Price Impact。超過單筆額度、庫存不足、暫停或 RPC 失敗時明確顯示比較不可用，AMM 本身仍可操作。兩機制獨立，不自動選路或跳轉。

## Add Liquidity

選擇提供 DPLT 或 DPLT-A 並輸入數量，另一資產 desired 上限按即時儲備比例**向上取整**，再依 Solidity 原始分支計算實際預估：

```text
optimalA = floor(desiredDPLT * reserveA / reserveDPLT)
若 optimalA <= desiredA：actual = (desiredDPLT, optimalA)
否則 actual = (floor(desiredA * reserveDPLT / reserveA), desiredA)
LP = min(floor(actualDPLT * supply / reserveDPLT), floor(actualA * supply / reserveA))
兩項最低注入量 = floor(actual * (10000 - bps) / 10000)
最低 LP = floor(LP * (10000 - bps) / 10000)
本次 LP 份額 = LP / (supply + LP)
預計帳號總份額 = (原持有 LP + LP) / (supply + LP)
```

向上取整只用於計算另一資產的 desired 上限；合約實際使用量與 LP 估算仍遵照合約向下取整。畫面同時顯示 desired、預計實際使用、最低兩項數量、預計／最低 LP、份額與 Gas。零輸出、超過 reserve 上限、空池皆拒絕。

兩代幣各自查 allowance，不足時各自只授權本次 calldata desired 上限，標準 ERC-20 approve 直接覆寫既有額度。最多三筆 MetaMask 獨立交易：approve DPLT、approve A、addLiquidity。approve 成功不是注資成功；不自動串接。

呼叫 `addLiquidity(desiredDPLT, desiredA, minDPLT, minA, minLiquidity, deadline)`；禁止以 transfer 代替。模擬不能取代實際結果；成功按 AddLiquidity 事件顯示實際兩種數量與 LP，重新讀 LP、supply、reserves、兩項餘額與 allowance。

## Remove Liquidity 與 LP 權益

LP Token 為 DPL AMM Liquidity Provider Token／DPL-LP／18 decimals。即時持有份額為 `lp / totalSupply`，對應資產為 `floor(lp * reserve / totalSupply)`；包含池內累積費用與捐贈，並不保證收益。

輸入 LP 或選 25%、50%、75%、100%，各按**自己的 LP 餘額**乘百分比向下取整。預期取回各資產 `floor(liquidity * reserve / totalSupply)`，最低量以同一滑價公式計算。只 burn msg.sender 持有 LP，不需 approve LP 給 Pool；另外限制不可涉及永久鎖定的 1000 LP 最小單位。

呼叫 `removeLiquidity(liquidity, minDPLT, minA, deadline)`。Receipt 與 RemoveLiquidity 事件通過後重查權益、總供給、儲備、兩項餘額。輸入超過個人 LP 或任何輸出／最低量為零均拒絕。

LP 提供兩種資產維持比例；交換改變比例，移除時取得量可能不同。0.3% Fee 留池由 LP 按份額間接受益。無常損失是相較單純持有原資產的價值差異，尚未提領仍承受差異，費用不一定能補償。直接轉帳至 Pool 是不可撤回捐贈，不能取得 LP。

## 共用交易與 RPC 策略

沿用 Wallet `captureTransactionSession()`／`assertSession()`、既有 Public Client、Token ABI／錯誤分類及 Exchange 交易模式。狀態包含 idle、validating、awaiting-wallet、submitted、confirming、success、failed、unknown。

- 每個快照固定單一區塊讀取 Pool getters、兩資產餘額／allowance、LP 與 ETH；核對 dplt、assetA、initialProvider、LP decimals。正式 quote 也使用該快照區塊。
- 同帳號進行中查詢去重；成功快取 30 秒。報價與送出檢查繞過成功快取，手動更新按鈕冷卻 30 秒，沒有背景餘額輪詢。
- 準備與確認各重新檢查工作階段、鏈別、餘額、allowance、最低量、期限、simulateContract 與 Gas。Gas limit／gasPrice 各加 20% 緩衝，ETH 不足禁止送出。
- 每筆紀錄原帳號、chain ID、操作、目標、calldata 與原 Hash。送出中切換帳號不丟棄原交易，查詢原交易不依賴當前錢包帳號。
- 已送出最多追蹤 60 秒、8 秒間隔，至少一個確認。逾時保留原 Hash、阻止新操作，手動查詢原交易；不自動重送、不自動接受替換 Hash。
- 發送未知且無 Hash 時保留送出意圖，學生從 MetaMask 活動補回 Hash；只在 from／to／input／value 核對成功後採用。錯誤 Hash 不覆寫原紀錄。
- 已成功交易的後續 RPC 更新失敗只顯示更新錯誤，不偽造餘額；交易未知不冒稱成功。Receipt reverted 與使用者拒簽分開提示。
- 紀錄只有本頁記憶體；重新整理前必須保存 Hash。不保證跨分頁或重載防重送；未知時先從錢包核對，不能用重載繞過。
- approve 可能在 swap／add 失敗後仍存在。撤銷需另行核對代幣與 Pool spender，手動 `approve(spender, 0)` 並支付 Gas。

## 兩帳號 Sepolia 人工驗收（尚未執行）

使用官方 MetaMask 與兩個測試帳號 A／B，自行準備少量兩種代幣與 Sepolia ETH；不要提供私鑰或助記詞。本次自動化僅用 Mock，不以以下清單宣稱已完成鏈上驗收。

1. 唯讀核對 Pool 完整地址、11155111、dplt／assetA／initialProvider／18 decimals、目前 reserves／supply／A、B LP；不要重部署或初始化。
2. A 查兩方向 quote，與瀏覽器唯讀合約結果核對；改動滑價，逐最小單位核對 minOut、Fee、Price Impact 與價格。驗證 Fixed 超額／不可用不阻擋 AMM。
3. A 小量 approve → 確認 Receipt／allowance → 另行 swap；拒絕一次簽署，核對每筆 spender／amount／value／Gas／deadline／事件。不可將 approve 視為 swap。
4. B 分別授權兩種資產 → 小額 add；保存三筆 Hash，核對實際兩種使用量、LP、總供給與份額。A 既有 LP 權益應依鏈上變化更新。
5. B 測 25%／50%／75%／100% 預估；實際少量 remove，確認不需 LP approve，不能移除 A 的 LP／鎖定份額。核對事件與兩種餘額。
6. 人工測錯鏈、帳號 A→B→A、期限／摘要過期、餘額與 Gas 不足、拒簽、revert；送出前必須重新確認。
7. 暫停 RPC 或模擬逾時，保存原 Hash，用「查詢原交易」恢復；必要時從 MetaMask 補回原 Hash。禁止為測試未知狀態而重送。
8. 桌面與 320px 起手機檢視三種操作、錯誤、長地址與完整數量。檢查 Wallet／Token／Faucet／Fixed Exchange。
9. 記錄兩帳號、公開 Hash、區塊、實際結果、RPC/CORS、日期與未解決問題；所有鏈上操作由另行人工驗收執行。

## 本機驗證

依 [README](../README.md) 的 Node／npm 版本執行：

```sh
npm ci
npm run contracts:compile  # build 的既有 artifact 隔離檢查需要，本機編譯不部署
npm run lint
npm run typecheck
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test tests/e2e/amm-service.spec.ts tests/e2e/amm.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test tests/e2e/wallet.spec.ts tests/e2e/wallet-store.spec.ts tests/e2e/exchange.spec.ts tests/e2e/exchange-service.spec.ts tests/e2e/token.spec.ts tests/e2e/token-service.spec.ts tests/e2e/faucet.spec.ts tests/e2e/faucet-utils.spec.ts tests/e2e/home.spec.ts
git diff --check
```

使用 Playwright 的桌面／手機專案。正式建置既有 checker 檢查 Hardhat artifact、bytecode 與 localhost 部署／驗證工具隔離；不匯入完整 ABI artifact 或 Solidity。本次不執行完整歷史合約或 metadata 稽核。

Task 08C 原始本機結果（08C-UX 驗證另列於下方）：

| 檢查 | 結果 |
| --- | --- |
| npm ci | 通過，依賴與 lockfile 未修改 |
| contracts:compile | 通過；僅產生既有 build 隔離檢查需要的本機 artifact，不部署 |
| lint／typecheck／build | 全通過，正式產物隔離通過 |
| AMM Playwright | **124 passing、0 failing**（52 個服務案例、10 個 UI 案例，各跑桌面／手機） |
| Wallet／Token／Faucet／Fixed Exchange／首頁回歸 | **292 passing、0 failing** |
| Markdown 本機連結／git diff --check | 通過 |

另驗證只有永久鎖定 LP 的已初始化池仍可 Swap／Add；所有可流通 LP 移除不應讓前端誤判成尚未初始化。建置保留既有 worker_threads 外部化與大於 500 kB chunk 提示。沒有修改合約或依賴，不執行真實 Sepolia 交易；GitHub Actions 結果以 PR 為準。

## Task 08C-UX 驗證

2026-11-12（Asia/Taipei）：lint、typecheck、build（含既有正式產物隔離）及 `git diff --check` 通過。AMM Mock **140 passing**（57 個服務案例、13 個 UI 案例，各跑桌面／手機）；Wallet、Token、Faucet、Fixed Exchange 與首頁回歸 **292 passing**。最後摘要文案／收合調整後另重跑全部 AMM UI **26 passing**。

新增覆蓋授權後無自動交易、兩種授權不等於注資、足夠 allowance 不出現 approve、正確成功／失敗／未知結果、實際 LP／取回量、操作切換結果隔離、交易前最新快照、交易後 RPC 失敗及落後區塊不提供假餘額。已檢視桌面／手機摘要與結果截圖，320px 無水平溢出。僅為既有 build checker 本機編譯 artifact，未改合約或執行 Solidity 測試；無真實 Sepolia 交易、部署或 30 人人工課堂驗收。
