# Task 07A：DPL Exchange 固定匯率合約

## 狀態與教學概念

已建立合約、本機 EDR 測試、Ignition 模組與離線公開參數計畫，未部署 Sepolia、未轉移教師資產，首頁 Exchange 保持未開放。TeachingToken 與 Task 06 Token 功能不變。

DPLT 模擬 USD、DPLT-A 模擬 TWD、DPLT-B 模擬 CNY。固定比例為教學自訂，不連接市場、不代表真實金融價格。教師庫存提供交換所需資產；這是固定匯率交換，沒有 AMM 定價曲線或 LP 份額。

## 六方向與精度

| tokenIn | tokenOut | 分子 / 分母 |
| --- | --- | --- |
| DPLT | DPLT-A | 30 / 1 |
| DPLT-A | DPLT | 1 / 30 |
| DPLT-B | DPLT-A | 9 / 2 |
| DPLT-A | DPLT-B | 2 / 9 |
| DPLT | DPLT-B | 20 / 3 |
| DPLT-B | DPLT | 3 / 20 |

所有參數與回傳數量是 ERC-20 最小單位，18 decimals。`amountOut = amountIn * numerator / denominator`，整數除法向下取整，禁止浮點／近似比率。例：1 DPLT 換 B 得 `6666666666666666666`，再反換 DPLT 得 `999999999999999999`；捨入不能創造價值。A 輸入 29 個最小單位換 DPLT 得零，必須 ZeroOutput。

每筆最多 10 DPLT 等值，依輸入資產判斷：

| 輸入 | 最小單位上限 |
| --- | --- |
| DPLT | `10000000000000000000` |
| DPLT-A | `300000000000000000000` |
| DPLT-B | `floor(600000000000000000000 / 9) = 66666666666666666666` |

B 使用 `amountIn <= floor(600e18 / 9)`，等價於有理數交叉相乘比較，但不會在大輸入時溢位。超過邊界一最小單位與 uint256 max 均回 AmountExceedsLimit。所有乘法在限額驗證後執行，Solidity 0.8.38 保留整數溢位檢查。quote 與 swap 適用同一限額；此為單筆限制，不能防止多筆累積，無身分識別或每日額度。

## 合約架構、安全與管理

來源：[DPLFixedExchange.sol](../contracts/DPLFixedExchange.sol)。沿用 Hardhat 3.21.2、Solidity 0.8.38、OpenZeppelin Contracts 5.6.1、viem 2.57.17、npm lockfile；未升級依賴。

Constructor `(dplt, assetA, assetB, administrator)` 設定三個 immutable 地址與明確 Ownable 管理者。驗證非零、不同、有 code 且 `decimals() == 18`；後者僅防誤設，不是任意合約的安全認證。只接受經審查的三種標準 TeachingToken，不支援轉帳稅、rebasing 或未知 ERC-20。

SafeERC20 檢查轉帳結果；swap 與 withdrawReserve 共用 ReentrancyGuard。swap 驗證白名單、不同資產、正數與非零輸出、上限、minAmountOut、實際庫存後，從呼叫者取得輸入並支付輸出。任一步失敗，整筆回滾，包含輸入餘額及該 swap 內的 allowance 消耗；先前獨立的 approve 交易不會回滾。

只有 owner 能 pause／unpause／withdrawReserve；OpenZeppelin 發出 Paused／Unpaused／OwnershipTransferred。Ownable 可 transferOwnership 或 renounceOwnership，部署者沒有永久權限；放棄管理權後無人可再暫停／解除暫停／提領，操作前須人工審查。提領只來自合約庫存、只能指定三個資產、數量及 recipient 不得為零，暫停時仍可安全提領。管理者可撤走庫存，學生應理解庫存可用性依賴教師管理。

無 mint、burn、任意學生扣款、匯率修改、oracle、聚合器、借貸、槓桿、flash loan、proxy、跨鏈或治理。三代幣 totalSupply 不變。無 deposit；補庫存使用一般 ERC-20 transfer。

## ABI 與呼叫流程

編譯後完整 ABI：`artifacts/contracts/DPLFixedExchange.sol/DPLFixedExchange.json` 的 `abi`；產物不提交、不加入正式前端 bundle。Task 07C 整合時從經審查版本挑選必要 ABI，與 chain ID、實際部署地址及來源 commit 關聯；目前沒有正式 Exchange 地址。

| 方法 | 用途 |
| --- | --- |
| `dplt() / assetA() / assetB()` | 查詢 immutable 資產地址 |
| `owner() / paused()` | 管理者與暫停狀態 |
| `quote(address,address,uint256) → uint256` | 唯讀計算、驗證輸入與限額；不查庫存、不受 pause 影響 |
| `swap(address,address,uint256,uint256) → uint256` | 學生交易；最低收到量、庫存與原子交換 |
| `reserveOf(address) → uint256` | 查詢實際 ERC-20 balanceOf |
| `pause() / unpause()` | owner 管理交換狀態 |
| `withdrawReserve(address,uint256,address)` | owner 提領內部庫存 |

未來 viem 使用方式（文件範例，不會在本次執行）：

```ts
const amountIn = parseUnits('1', 18) // bigint，不使用 Number
const amountOut = await publicClient.readContract({
  address: exchangeAddress, abi: exchangeAbi, functionName: 'quote',
  args: [dpltAddress, assetAAddress, amountIn],
})
// 先顯示 spender／數量與摘要，學生明確同意後執行並確認 approve receipt。
await walletClient.writeContract({
  address: dpltAddress, abi: erc20Abi, functionName: 'approve',
  args: [exchangeAddress, amountIn], account,
})
// 重新核對帳號／鏈、allowance、餘額、Gas、庫存、paused，simulate 後另行確認 swap。
await walletClient.writeContract({
  address: exchangeAddress, abi: exchangeAbi, functionName: 'swap',
  args: [dpltAddress, assetAAddress, amountIn, amountOut], account,
})
```

approve 只允許 spender 在 allowance 內使用 transferFrom，不轉移資產、不等於成交。swap 才原子移動兩種代幣，不需教師逐筆授權；預設只 approve 本次 amountIn，無限授權不是必要條件。固定報價可直接作 minAmountOut，輸入／鏈／地址／版本需一致，報價不保證庫存或未暫停。receipt success 並完成 Task 06 確認策略後才顯示成功；失敗／未知不自動重送。

事件：

```solidity
event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
event ReserveWithdrawn(address indexed token, address indexed recipient, uint256 amount);
```

預期錯誤：InvalidToken、DuplicateToken、UnsupportedToken、SameToken、InvalidAmount、ZeroOutput、InsufficientReserve、AmountExceedsLimit、InsufficientOutputAmount、InvalidRecipient，以及 Ownable／Pausable／ReentrancyGuard／SafeERC20／底層 ERC-20 的 custom errors。前端應區分 allowance、餘額、庫存、暫停與最低輸出失敗。

## 庫存與部署準備

[公開計畫](12-fixed-exchange-plan.json) 記錄 Ethereum Sepolia 11155111、三個既有地址及管理者 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。Exchange 真實地址為 `null`（待填），既有代幣地址只用於後續規劃，本機測試全部部署獨立實例。

| 資產 | 後續計畫注入量 |
| --- | --- |
| DPLT | 1,000 |
| DPLT-A | 30,000 |
| DPLT-B | 6,666 |

約為相同 DPLT 等值，B 庫存並非精確相同；沒有執行注入。庫存不足時拒絕交換，不會超額支付或鑄幣。

離線檢查：

```sh
node scripts/contracts/prepare-exchange.ts
```

此命令驗證 chain ID、四個有效非零地址與三資產不同，輸出 constructor／Ignition 參數，不連 RPC 或載入 signer。模組 [DPLFixedExchange.ts](../ignition/modules/DPLFixedExchange.ts) 使用必要參數、沒有 deployer 預設，不 approve、不注入庫存。沿用 [Token 部署紀錄](06-token-contracts.md) 的 chain ID、來源 commit、版本、constructor、地址、transaction hash、receipt block／status 及驗證欄位；Exchange 部署資料仍待填。

未來執行前須重新確認 RPC 實際 `eth_chainId == 11155111`、三代幣 code／18 decimals／來源、教師與部署帳號、管理權及 Gas；離線 chain ID 不能取代 RPC 預檢。現有 Hardhat 僅 EDR，沒有遠端網路或 signer；本次不新增 HTTP 部署命令、不索取私鑰、不連教師 MetaMask。未來遠端執行器需另行設計不可繞過的 chain ID 檢查。

## 本機驗證

使用本機 EDR／Node Test Runner、viem assertions，測試檔 [DPLFixedExchange.test.ts](../test/contracts/DPLFixedExchange.test.ts)。`contracts/test/ExchangeTestToken.sol` 僅是故障／重入測試 fixture，不是支援資產或部署計畫。

2026-11-11 本機結果：

| 檢查 | 結果 |
| --- | --- |
| `npm ci` | 通過，沿用 lockfile；環境預設快取不可寫，使用 `--cache /tmp/dpl-npm-cache` |
| `npm run contracts:compile` | 通過，Solidity 0.8.38／Cancun |
| `npm run contracts:typecheck` | 通過 |
| `npm run contracts:test` | **80 passing、0 failing**：Exchange 48、TeachingToken／原部署準備 24、Runtime Manifest 8 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run build` | 通過，含正式產物隔離檢查；保留既有前端 chunk 超過 500 kB 的提示 |
| `git diff --check` | 通過 |
| 離線 Exchange 參數檢查 | 通過 |

Hardhat 在本環境以 `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache XDG_DATA_HOME=/tmp/dpl-data` 執行，避免使用不可寫的預設家目錄，不變更 Repository 設定。

新增來源使 Hardhat 合併編譯輸入；Runtime Manifest 工具現明確投影到原本 TeachingToken 的完整六檔依賴閉包。新增回歸測試確認無關合約不影響指紋、缺少／修改依賴仍拒絕。既有 manifest、TeachingToken、compiler 設定與 lockfile 均未變，完整 runtime hash 仍為 `0x88419e5ba519f7ec9b3ec0b822a04597f18b0f1a08b0afe611f3bdae6bbe3105`。未做歷史 Archive RPC 或 Etherscan 查詢。

新增測試涵蓋六方向精確報價與小數、六方向往返、每方向限額內正常交換與一單位超限、零輸入／輸出、所有身份與權限、庫存／餘額／allowance／minAmountOut 不足、資產與供給守恆、事件、pause／unpause、暫停提領、輸出失敗完整回滾、swap／withdraw 重入阻擋、真正 Ignition 模組本機部署、離線參數驗證。

## 後續任務與人工確認

- Task 07B：另行授權部署；確認參數／管理者、遠端 chain guard、教師簽署流程、來源／產物追溯、Sepolia receipt 與 Etherscan 驗證，填正式地址；教師自行確認庫存 transfer，鏈上核對庫存及權限。
- Task 07C：另行授權前端；報價、精確最小授權、swap 摘要／模擬／receipt、庫存提示、錯網路／切換帳號／拒簽／未知結果、剩餘 allowance 撤銷說明，以及兩帳號人工驗收。
- 本次到 Task 07A 停止，未啟用 Exchange UI、未部署、未做 Sepolia approve 或轉帳。
