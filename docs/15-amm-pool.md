# Task 08A：DPL AMM 常數乘積池

## 狀態與 A-07 決策

本次由已合併 PR #12 的 main 建立 Solidity 合約、EDR 本機測試及 Ignition 準備，沒有 Sepolia 部署、教師／學生真實資產移動或前端 UI。Pool 正式地址為 **null**。Task 08B 部署工具與 Task 08C 學生介面尚未完成，Liquidity 入口保持未開放。

A-07 採單一 DPLT／DPLT-A Constant Product Market Maker，`x * y = k`，18 decimals，輸入手續費 0.3%（30 basis points），全部留池供 LP 按份額間接受益。Pool 本身發行 ERC-20 LP；沒有 Factory、Router、Oracle、治理、挖礦、Proxy、owner、暫停或任意提領管理入口。只支援 constructor 明確指定的兩種經審查教學代幣，不支援 Fee-on-Transfer、Rebasing、未知代幣或 DPLT-B。

沿用 Solidity 0.8.38、OpenZeppelin 5.6.1、Hardhat 3.21.2 與原 lockfile；既有 TeachingToken／DPLFixedExchange 不修改。資產皆為無真實金融價值的 Sepolia 教學代幣，不保證收益。

## AMM 與固定匯率

| 項目 | DPLFixedExchange | DPLAMMPool |
| --- | --- | --- |
| 價格 | 六方向固定有理數比例 | DPLT／A 儲備決定，隨交易改變 |
| 資產來源 | 教師庫存 | LP 共同提供並按份額擁有 |
| 費率 | 0% | 輸入的 0.3%，留在池中 |
| 提領 | owner 管理庫存 | 持有人只能 burn 自己的 LP 換回對應資產 |
| 單筆限制 | 10 DPLT 等值 | 數學安全界限，沒有固定教學交易額度 |

令 `reserveIn`、`reserveOut` 為交易前儲備：

```text
amountInWithFee = amountIn * 997
amountOut = floor(reserveOut * amountInWithFee / (reserveIn * 1000 + amountInWithFee))
交易後：reserveIn += amountIn；reserveOut -= amountOut
```

全部輸入入池，並非只入 99.7%；不另轉出費用、不設 feeRecipient 或管理者分潤。`k` 因費用及向下取整而不下降，不是要求每次交換後精確相等。理論無費用輸出為 `floor(reserveOut * amountIn / (reserveIn + amountIn))`。

## 儲備、直接轉帳與 LP 帳務

`totalSupply() == 0` 時 `getReserves()` 回 `(0,0)`、quote／swap 拒絕；直接收到代幣不能初始化池或取得 LP。未初始化介面必須顯示「尚未提供初始流動性」，不能顯示假價格。

初始化後直接以兩種 ERC-20 的實際 `balanceOf(pool)` 作為儲備，沒有可過期的內部副本或 sync／skim 入口。操作完成發出 `ReservesUpdated`；直接轉帳不發出此 Pool 事件，查詢仍立即反映新餘額。**直接轉帳是不可撤回的捐贈，沒有 LP、沒有退回權**，會改變報價並提高現有 LP（含永久鎖定份額）的資產權益。不要以 transfer 取代 addLiquidity。

初始化前的捐贈在成功首次注資後一併歸初始 LP 與永久鎖定份額，不另外鑄造 LP；初始 LP 數量僅按本次實際要求轉入的兩個數量計算。因此教師首次注資前也必須核對既有 balanceOf，預先捐贈會使最終價格不同於輸入比例。捐贈可操縱即時價格，本池不是可信 Oracle。

LP 對應兩資產權益為 `floor(liquidity * reserve / totalSupply)`，含費用及捐贈。新 LP 按更新後的實際儲備計價，不能以舊儲備取得免費權益。一般操作檢查轉帳後實際餘額是否符合預期，不符則 UnexpectedTokenBalance；這是拒絕異常的防線，不是支援非標準代幣的保證。未知代幣與誤轉 LP 沒有救援入口，須避免誤轉。

## 初始化與搶先風險

預定 Ethereum Sepolia（11155111）參數：

| 欄位 | 值 |
| --- | --- |
| DPLT／constructor dplt | `0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e` |
| DPLT-A／constructor assetA | `0x53Ac929866423479c7C5746F76F398e8b3907d6E` |
| initialProvider／constructor 第三參數 | `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`（教師公開錢包） |
| Pool 正式地址 | `null`（尚未部署） |
| 教師預計初始注資 | 100 DPLT + 3,000 DPLT-A |
| 預計初始即時價格 | 1 DPLT = 30 DPLT-A（無額外捐贈的前提） |

Constructor `(dplt, assetA, initialProvider)` 拒絕零 initialProvider，並以 immutable 儲存；Ignition 的 initialProvider 預設為上表教師公開地址，本機測試可明確覆寫成本機教師。此地址不是 owner，沒有修改、轉移角色、暫停、任意鑄幣或提領他人資產的權限。

`addLiquidity()` 在 `totalSupply() == 0` 時直接於鏈上檢查 `msg.sender == initialProvider`，不符回 UnauthorizedInitialProvider。部署者若不是指定教師也無法初始化，直接呼叫合約、繞過前端、預先 approve 或轉入代幣皆不能取得首次初始化權。首次注資成功後，永久鎖定份額確保 totalSupply 不會回到零，所有帳號皆可按原比例公式注資；正常 swap／移除不增加教師核准要求。

沒有另設可提前解鎖的初始化旗標：教師交易若失敗，LP mint、轉帳及供給全回滾，仍只有指定教師能重試。指定錯誤的非零地址無法從鏈上判斷是否真為教師，且 immutable 無法修正，因此部署前必須確認完整地址；零地址則由 constructor 拒絕。

教師能設定初始價格，**合約仍不自動保證 1:30**；預先捐贈政策維持原設計，可能改變最終儲備比例。此保護阻止其他帳號搶先呼叫 addLiquidity 初始化，不阻止 ERC-20 直接捐贈或後續市場交易。教師之後須逐筆核對 chain ID、帳號、兩資產／18 decimals、Pool 的 initialProvider getter、既有 balanceOf／totalSupply、數量、minima、deadline 與 Gas。部署只設定三參數，不自動扣款；不需要依賴前端隱藏按鈕或原子批次部署來保證首次呼叫者。Task 08B／08C 仍未實作，本次不執行上述真實操作。

## LP 發行、提供與移除

LP 名稱 **DPL AMM Liquidity Provider Token**、Symbol **DPL-LP**、18 decimals。首次：

```text
root = floor(sqrt(amountDPLT * amountDPLTA))
永久鎖定 = 1000 個 LP 最小單位，地址 0x000000000000000000000000000000000000dEaD
首次提供者取得 = root - 1000
root <= 1000 時拒絕
```

無公開 mint／burn，無人能僅靠直接轉帳鑄造 LP。永久鎖定不可由管理者收回，所有流通 LP 移除後仍有鎖定份額與對應資產。

後續先算 `optimalA = floor(desiredDPLT * reserveA / reserveDPLT)`，不超過 desiredA 就使用 desiredDPLT／optimalA；否則使用 `floor(desiredA * reserveDPLT / reserveA)`／desiredA。只扣實際使用量，不先扣再退款；兩項最小輸入量及 minLiquidity 驗證實際結果。

```text
liquidity = min(
  floor(actualDPLT * totalSupply / reserveDPLT),
  floor(actualA * totalSupply / reserveA)
)
```

比例及 LP 均向下取整，不會超發 LP；極小數量可能無法得到 LP 而拒絕。捨入造成的極小差額留池。初次 sqrt 也是整數演算法，後續比例與移除使用 OpenZeppelin Math.mulDiv。

兩種代幣先各自 approve Pool，預設只授權該次需要的數量，再明確執行 addLiquidity；approve 不是注資。移除只 burn `msg.sender` 的 LP，不需 LP approve 或教師核准。LP 可以標準 transfer 或 approve + transferFrom，權益隨 LP 移轉；被授權者必須先合法取得 LP，不能用 removeLiquidity 燒掉原持有人 LP。移除結果逐項向下取整，任一為零或不足最低數量即拒絕。

## API、精度與安全界限

來源 [DPLAMMPool.sol](../contracts/DPLAMMPool.sol)；編譯後 ABI 位於不提交的 `artifacts/contracts/DPLAMMPool.sol/DPLAMMPool.json`。未加入正式前端 ABI／地址。

| 方法 | 輸入／回傳 |
| --- | --- |
| `dplt / assetA / initialProvider` | immutable 兩種資產與首次提供者地址 |
| `getReserves()` | `(reserveDPLT, reserveDPLTA)`，已初始化時為實際餘額 |
| `quoteSwap(tokenIn, amountIn)` | `(tokenOut, amountOut)`，兩方向、自動推導 tokenOut |
| `swap(tokenIn, amountIn, minAmountOut, deadline)` | 回 amountOut，approve + swap |
| `addLiquidity(desiredDPLT, desiredA, minDPLT, minA, minLiquidity, deadline)` | 回實際兩數量與 LP 數量 |
| `removeLiquidity(liquidity, minDPLT, minA, deadline)` | 回兩種實際轉出量 |
| ERC-20 查詢 | totalSupply、balanceOf、allowance、decimals、name、symbol |

三種資產操作 nonReentrant；任一步失敗則整筆回滾，包含 LP mint／burn、輸入轉帳與該操作消耗的 allowance，先前獨立 approve 不回滾。deadline 使用 Unix 秒，等於 block.timestamp 可執行，小於時拒絕。swap／add／remove 各發對應事件，另發操作完成的 ReservesUpdated。

所有數值 uint256／最小單位，不用浮點。兩儲備與 desired 金額不超過 `MAX_RESERVE = 2^112 - 1`，swap 輸入也不超過該上限減輸入儲備。先檢查界限，再乘法；初次積小於 2^224，報價分子小於 2^234、分母小於 2^123。極大輸入回 ReserveLimitExceeded，非隱含算術 panic。這遠大於既有兩種教學代幣各 1,000,000 tokens 的總供給；若不按部署清單而使用可超量鑄幣的未知資產，超限捐贈可能令池無法操作，不提供救援權。

具名錯誤含 InvalidInitialProvider、UnauthorizedInitialProvider、InvalidToken、DuplicateToken、UnsupportedToken、InvalidAmount、UninitializedPool、InsufficientReserve、ZeroOutput、ReserveLimitExceeded、ExpiredDeadline、InsufficientMinimumAmount、InsufficientLiquidity、UnexpectedTokenBalance，另有 ERC20／SafeERC20／ReentrancyGuard 錯誤。constructor 的 code／18 decimals 檢查只防誤設，不認證任意 ERC-20 安全性。

## 價格影響、滑價與無常損失

DPLT 以 A 計價的即時價格為 `reserveA / reserveDPLT`，反向取倒數；報價平均成交價為 `amountOut / amountIn`。Task 08C 應用 bigint 有理數／固定顯示精度呈現交易前後儲備、即時價、平均價、預估／最終量、費率與 LP 份額。

Price Impact 是交易沿曲線對即時價格的影響；若顯示相對當前現貨價的成交差異，須說明該比較是否含 0.3% 費用。可用扣費後輸入 `a = amountIn * 997 / 1000` 的有理數計算曲線影響 `a / (reserveIn + a)`，不可先把 a 截為整數再聲稱精確。Slippage Tolerance 是使用者允許相對報價的執行偏差，反映在 minAmountOut；兩者不同。報價查詢到成交之間他人交換或捐贈都可能改變結果，deadline 並不鎖定價格。

費用的精確輸入資產等值為 `amountIn * 3 / 1000`（有理數，可不足一個最小單位），不是實際另行扣轉、也不是每次先 floor fee 再套公式。學生可從完整輸入增加儲備、k 與每 LP 對應資產變化觀察留池費用。

無常損失是價格相對初始比例改變時，LP 相較直接持有兩資產的價值差異；「無常」不代表必定恢復或只要不退出就沒有風險。費用不保證抵銷價格變化／損失，本池無市場 Oracle 或真實估值，不能宣稱 LP 一定獲利。

## 本機驗證與後續驗收

測試 [DPLAMMPool.test.ts](../test/contracts/DPLAMMPool.test.ts) 使用 Hardhat EDR、兩個獨立本機 TeachingToken；[AMMTestToken.sol](../contracts/test/AMMTestToken.sol) 僅用於測試拒絕轉帳、少轉與輸入／輸出 callback 重入，不能用於部署參數。

涵蓋 constructor、空池、指定教師首次定價、非教師／部署者初始化拒絕、零 initialProvider、失敗後權限維持、整數 sqrt 與永久鎖定、第二位 LP／超額 desired 不多扣、六組報價精度界限、後續 LP／移除捨入、LP 轉移與合法授權、非持有人拒絕、雙向交換與無費用參照、費用／k／即時價格、最低收到量／最小注資／LP、期限、餘額／allowance、極大 uint256／儲備上限、輸入／輸出失敗完整回滾、三操作交叉重入、直接捐贈前後政策、多 LP 混合交換、ABI 入口白名單及真正 Ignition 本機空池部署。

2026-11-12（Asia/Taipei）本機結果：

| 檢查 | 結果 |
| --- | --- |
| `npm ci --cache /tmp/dpl-npm-cache` | 通過；原 lockfile／依賴版本未修改 |
| `npm run contracts:compile` | 通過，Solidity 0.8.38／Cancun |
| `npm run contracts:typecheck` | 通過 |
| `npm run contracts`（連續三次） | 三次 compile／typecheck／test 全通過，每次 **118 passing、0 failing**，其中 AMM 38 項、既有 80 項 |
| `npm run lint` | 通過，0 warnings |
| `npm run typecheck` | 通過 |
| `npm run build` | 通過，含正式產物隔離檢查 |
| `git diff --check` | 通過 |
| 變更 Markdown 的本機連結目標 | 全部存在 |

Hardhat 使用 `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache XDG_DATA_HOME=/tmp/dpl-data`，避免不可寫的預設家目錄。build 保留既有前端 chunk 大於 500 kB 及依賴 node:worker_threads 外部化提示；建置成功。未新增歷史 bytecode／metadata 或 Archive RPC 驗證工作；既有 contracts:test 的 80 項回歸照既定命令執行。測試不是正式審計或 Sepolia 人工驗收。

Task 08B 待辦：核對 immutable initialProvider 為上表教師地址、沿用 localhost + MetaMask 工具、核對 Sepolia 與資產參數、教師初始數量／既有捐贈、最小收到量／LP／deadline、逐筆授權與簽署、保存合約地址／來源 commit／constructor／交易與 receipt。部署模組 [DPLAMMPool.ts](../ignition/modules/DPLAMMPool.ts) 需要顯式兩資產地址，第三參數 initialProvider 預設為指定教師，部署前須核對，不內建遠端 signer、approve 或注資。

Task 08C 待辦：池狀態與兩方向 quote／swap、精確 approve、加減流動性與 LP 餘額／份額、費用與價格影響教材、Slippage 設定與交易摘要、模擬／Receipt／未知結果、帳號／網路切換及真實兩帳號人工測試。未初始化、查詢失敗與零餘額需分開呈現，不新增假資料。Task 08A 不開始上述兩任務。

## Task 08B 本機教師工具

已沿用 localhost + MetaMask 工具提供部署、兩筆精確 approve 與首次 addLiquidity，包含實際 balanceOf 捐贈阻擋、bigint LP 計算、未知交易 Reconcile 與公開 JSON。Windows 操作及人工驗收見 [AMM 部署指南](16-amm-deployment.md)。沒有真實 Sepolia 交易；正式 Pool 地址仍為 null，Task 08C 未實作。
