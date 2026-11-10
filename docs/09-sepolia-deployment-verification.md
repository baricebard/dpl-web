# Task 05C-3：Sepolia 部署唯讀驗證報告

> 本文件保留首次雲端查核的歷史證據與受阻結論。後續已新增[Windows 本機唯讀驗證工具](10-local-readonly-verifier.md)，不再從雲端重試 RPC；工具測試不代表真實部署通過。以下時間、checkout 與未執行測試等敘述，均指首次雲端查核當時。

## 結論與範圍

檢查日期：2026-11-10，Asia/Taipei（UTC+08:00）。本輪實際網路探測為 21:15–21:18；精確 UTC 時間見[原始探測紀錄](09-sepolia-verification-evidence.json)。

**驗證受阻，三種代幣均未完成獨立鏈上驗證，不能標記通過或作為 Task 06 啟用依據。** Sepolia PublicNode RPC、Etherscan API 與三個合約頁皆無法存取；HTTP CONNECT 隧道遭環境代理回覆 `403 Forbidden`，沒有取得節點 JSON-RPC 結果或 Etherscan 合約資料。這不是 receipt reverted、合約不存在或 Etherscan 未驗證的證據。

本次僅讀取檔案、GitHub 固定 commit 與外部唯讀端點。未簽署、未發送交易、未要求私鑰、未重新部署、未提交原始碼驗證、未開始 Task 06、未合併 main。沒有安裝套件或重編譯；本地 checkout 仍是 Task 04 基線 `91ba9de6c60ae86d10b3ec2c5d114fdbc4c6247c`，未切換或更新其應用程式。

## 輸入與證據分級

- 使用者提供的[部署紀錄](09-sepolia-deployment-record.json)，版本 1，9,230 bytes，SHA-256：`1225d914b6e56086d61431898bd18a1ecb1e89a0004b72a68faf587099f0404b`。其中 `status`、`receiptStatus`、`checkedAt` 及成功訊息是既有工具的紀錄，並非本輪獨立驗證結果。
- GitHub 可讀取 JSON 指定的 [commit 535671d93eea7d3b1ee90ea6f6963cc0431460e5](https://github.com/baricebard/dpl-web/commit/535671d93eea7d3b1ee90ea6f6963cc0431460e5)。已讀取該 commit 的 `contracts/TeachingToken.sol`、`hardhat.config.ts`、`docs/06-token-contracts.md` 與 `package-lock.json`。這些只證明原始碼／預期規格，尚未與實際鏈上程式碼建立對應。
- 原部署時封存的 Hardhat artifact、build-info input/output 未提供；JSON 只有其雜湊與設定，不能由雜湊還原完整產物。
- RPC 沒有回傳 chain ID、receipt、block、code、logs 或 eth_call 值；本輪不存在可引用的鏈上快照區塊、確認數或 finality 結果。

## 三筆待驗證部署

下列數值全部來自部署 JSON；連結為查核入口，不代表已成功取得頁面證據。

| 項目 | DPLT | DPLT-A | DPLT-B |
| --- | --- | --- | --- |
| 記錄 ID | DPLT | DPLTA | DPLTB |
| 預期 name | DeFi Portfolio Lab Token | DeFi Portfolio Lab Asset A | DeFi Portfolio Lab Asset B |
| contractAddress | `0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e` | `0x53Ac929866423479c7C5746F76F398e8b3907d6E` | `0xA8E2854c62A46329838f9922587adBbEb007072f` |
| 部署交易 hash | `0x8b057767a283f111f9864b83c7ea99fa41c188f13468c0feea6d976c0f8f4a00` | `0x6ce8ce167eee21220602a9a3192c082a9e6ccfd147b002b8b6541aa7a4d48453` | `0x6a901e28718ddc46c27b916ce8f6336ea85b9cc806af43dbe496937a94b657cd` |
| 記錄的部署區塊 | 12104800 | 12104807 | 12104809 |
| 記錄的 receiptStatus | success | success | success |
| 記錄的檢查時間（台北） | 2026-11-10 21:02:52.149 | 2026-11-10 21:04:15.347 | 2026-11-10 21:09:22.591 |
| Etherscan | [合約頁](https://sepolia.etherscan.io/address/0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e#code) | [合約頁](https://sepolia.etherscan.io/address/0x53Ac929866423479c7C5746F76F398e8b3907d6E#code) | [合約頁](https://sepolia.etherscan.io/address/0xA8E2854c62A46329838f9922587adBbEb007072f#code) |

三種預期 decimals 均為 **18**（由固定 commit 的規格取得；部署 JSON 本身沒有 decimals 欄位）。每種預期 totalSupply 均為 **`1000000000000000000000000`**，即 1,000,000 tokens。記錄中的 deployer 與 initialHolder 同為 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。

## 十項驗證矩陣

「未驗證」表示缺少獨立證據，不表示檢查值符合或不符合。

| # | 檢查與預期 | DPLT | DPLT-A | DPLT-B | 本輪證據／限制 |
| --- | --- | --- | --- | --- | --- |
| 1 | `eth_chainId = 11155111`（`0xaa36a7`） | 未驗證 | 未驗證 | 未驗證 | 實際發出 eth_chainId 請求，但 CONNECT 403；JSON chainId 只作輸入 |
| 2 | Receipt status success（RPC 原始值 `0x1`） | 未驗證 | 未驗證 | 未驗證 | 三個 hash 的 eth_getTransactionReceipt 批次查詢遭 CONNECT 403 |
| 3 | Receipt contractAddress 與 JSON 一致 | 未驗證 | 未驗證 | 未驗證 | 沒有取得 receipt；不能引用記錄中的同一地址作自我驗證 |
| 4 | 三個地址有非空 bytecode | 未驗證 | 未驗證 | 未驗證 | chain ID 尚未確立，後續 eth_getCode 未執行；不能將無回應視為 `0x` |
| 5 | name／symbol／decimals 符合上表與 18 | 未驗證 | 未驗證 | 未驗證 | eth_call 未執行；名稱與參數的離線一致性不等於鏈上 metadata |
| 6 | totalSupply 為指定整數 | 未驗證 | 未驗證 | 未驗證 | 無 eth_call 結果；constructorArgs 的供給僅為預期 |
| 7 | mint 持有人、初始／目前餘額與後續變動 | 未驗證 | 未驗證 | 未驗證 | 無 receipt logs、歷史餘額、完整 Transfer logs 或目前餘額 |
| 8 | 部署 runtime 與原始 Hardhat artifact 一致 | 未驗證 | 未驗證 | 未驗證 | 缺原始 artifact/build-info，亦無部署區塊 code；雜湊不是 runtime 本身 |
| 9 | Etherscan exact／similar／未驗證 | 狀態未知 | 狀態未知 | 狀態未知 | 三個合約頁 CONNECT 403；另以網頁讀取工具逐頁嘗試也均不可存取 |
| 10 | 無非預期管理權限 | 未驗證 | 未驗證 | 未驗證 | 僅完成入口原始碼設計檢視；尚無鏈上 bytecode 身分證據 |

## 已完成的離線核對

JSON 可解析，三個 token ID 與三筆 record 對應；三個合約地址、三個交易 hash 各自不同，符合 20-byte 地址與 32-byte hash 的十六進位長度／格式。未將此項宣稱為 EIP-55 checksum 驗證。

每種 `constructorArgs` 均依序等於其 name、symbol、共同 initialHolder 與指定供給字串。各 token 的 `deploymentDataHash` 與 record 相同；三筆 record 的 provenance 均與頂層 provenance 一致。這是紀錄內部一致性，沒有重新計算 deployment data keccak256，因為缺少原始 creation bytecode。

固定 commit 的 Hardhat 設定符合記錄的 Solidity 0.8.38、optimizer enabled／runs 200、Cancun。JSON 記載完整 compiler 為 `0.8.38+commit.1835d247.Emscripten.clang`、OpenZeppelin 5.6.1；本輪未執行該編譯器或核對原始依賴封存。

另獨立取得固定 commit 的 `package-lock.json`：Git blob SHA-1 `6de5eaa2132409a020b4e5fc6a2c55a9af2fbd93` 與回傳 metadata 相符，LF 內容的 SHA-256 為 `1e05da64a5745c6fcd61c4e97a3ce5134e441523c3cfa5e3e9c6833f366e7ece`。將 LF 改為 Windows CRLF 後，SHA-256 為 `4152782b32115016d0eacdfecc733e51c28aa05268f16b482fec5588a95e6304`，**精確符合 JSON 的 lockfileSha256**。此結果支持換行格式可解釋雜湊差異，不證明部署環境的所有檔案或 bytecode 正確。

原始產物待核對值：

| 項目 | JSON 宣告值（未獨立核對原始檔） |
| --- | --- |
| artifactSha256 | `4fde06100e81c9ae80dad2d301535fb5f847e89fbd3e78611656162de3d2e284` |
| inputSha256 | `4ea312520c129ac53d723197799bbc3d87bf04e858f6cb9878a8292a1f707731` |
| buildInfoId | `solc-0_8_38-d97106e1c05dd988503605fd6aa6b0abbd7a656a` |

## 持有人與事件補驗方式

恢復 RPC 後先取得並核對 chain ID，再核對每筆 canonical receipt 與區塊 hash；不可直接信任 JSON 的部署區塊。將後續所有「目前」讀取固定在同一個已取得的區塊 H，記錄 H 的 number/hash、時間、確認數及 finality 狀態。

對每種代幣檢查部署 receipt 中由該合約發出的 `Transfer(address(0), initialHolder, 1000000000000000000000000)`。同時讀取部署區塊末的 metadata、totalSupply、initialHolder balance；區塊末餘額可能含同區塊的後續交易，不能直接視為部署交易剛結束的狀態。必要時依 transactionIndex/logIndex 還原順序。

從部署區塊到 H 分頁、分區塊查詢完整 Transfer logs，去除重複並檢查範圍完整，按 blockNumber／transactionIndex／logIndex 排序。初始持有人在 H 的預期餘額為所有 mint／轉入減轉出之和，應等於 H 的 balanceOf；自轉帳淨額為零。追查任何後續零地址 mint／burn，並核對 H 的 totalSupply。未取得完整 logs 不可宣稱「沒有轉帳」或「餘額仍為初始供給」。所有數量使用整數，不用浮點數。

## Runtime 與權限補驗方式

需要原部署當時的 `artifacts/contracts/TeachingToken.sol/TeachingToken.json`、對應 build-info JSON／output 與 Standard JSON input。先以原始 bytes 計算 artifact/input 雜湊，保留 Windows 換行差異的證據，不默默修改檔案來符合雜湊。核對完整來源、依賴、compiler build、optimizer、EVM 版本與 metadata 設定。日後重新編譯只能作為可重現性佐證，不可冒充當時產物。

以 `eth_getCode(address, receipt.blockNumber)` 取得部署區塊末 runtime，與 artifact.deployedBytecode 及 build-info 的 deployedBytecode 完整逐 byte 比較，包含 metadata。也核對 H 的 code，記錄長度與 keccak256。若有 linkReferences／immutableReferences，須依編譯輸出與實際參數解析，不能任意刪去不符區段；不得把去除 metadata 的比較稱為完整相同。原交易另讀取 from、to=null、value=0 與 input，核對 constructor 編碼與 deploymentDataHash。

固定 commit 的 [TeachingToken.sol](https://github.com/baricebard/dpl-web/blob/535671d93eea7d3b1ee90ea6f6963cc0431460e5/contracts/TeachingToken.sol) 只繼承 OpenZeppelin ERC20，在 constructor 執行一次 `_mint(initialHolder, initialSupply)`，沒有自行加入其他函式、modifier 或額外繼承。依[該 commit 的規格](https://github.com/baricebard/dpl-web/blob/535671d93eea7d3b1ee90ea6f6963cc0431460e5/docs/06-token-contracts.md)，預期無 owner／角色管理、外部 mint／burn、pause、升級、稅費、黑名單或凍結。

**這只是入口來源與預期設計檢視，不能證明三個實際地址無管理權限。** 完成結論須核對封存 input 中的實際繼承來源、完整 ABI／method identifiers、bytecode 與無代理轉發／升級入口，再與三個鏈上 runtime 建立對應；不能只憑 owner() revert 或沒有某個 selector 就排除所有權限。標準 approve／transferFrom 的 allowance 屬使用者授權，不是教師管理權。

## Etherscan 分類

| 分類 | 可接受的證據 |
| --- | --- |
| exact match | 該地址的驗證結果明確標示完整／精確匹配，並核對來源、compiler/settings、constructor 與本次產物；保存頁面或 API 原始結果及時間 |
| similar match | 該地址明確被 Etherscan 標示為相似匹配，記錄參照地址與限制；不能改寫為 exact match |
| 未驗證 | 成功取得該地址的 Etherscan 資料，且其明確顯示未驗證 |
| 狀態未知／未完成查詢 | 403、逾時、API Key 錯誤、頁面不可讀或其他缺資料；本次三種代幣全部屬此類 |

首次 Etherscan V2 `getsourcecode` 連線探測也遭 CONNECT 403，未到達能判斷地址或 API Key 的階段；當時尚未讀取上傳檔，因此該探測未帶地址。讀取檔案後另逐一查詢上述三個地址的合約頁，均失敗。沒有提交驗證請求。

## Task 06 公開設定提案（未啟用）

[公開設定候選 JSON](09-task-06-public-config.proposed.json) 僅供審查與後續整合準備，不被 src 引用。三個地址是使用者紀錄值；name／symbol 取自 JSON 與固定 commit，decimals 18 取自規格，均尚未經本輪鏈上核對。`enabled=false`、`verificationStatus=blocked` 不可在未完成驗證時移除。

候選包含 chain ID 11155111、各代幣地址／名稱／符號／18 decimals、供給整數字串、部署 hash／commit／artifact hash、Etherscan URL、公開 RPC 候選及 ERC-20 ABI 子集提案。ABI 以 human-readable signature 表示，未假裝是從封存 artifact 抽取的 ABI；Task 06 前須核對產物再選擇適用的 ABI 表示法。ERC-20 的 transfer 只描述將來介面，本次沒有呼叫。

公開前端不需要私鑰、部署 bytecode、完整 compiler input、RPC 秘密或 Etherscan API Key。資產鍵使用 `(chainId, address)`，不能以 symbol 代替；Sepolia ETH 不列為 ERC-20。RPC 瀏覽器 CORS／配額與 30 人課堂可用性仍未驗證。

## 尚待解除的阻礙與交付檢查

1. 在環境網路設定允許 `ethereum-sepolia-rpc.publicnode.com`、`sepolia.etherscan.io`，如使用 API 再允許 `api.etherscan.io`；目前 restricted policy 已生效，但無上述主機。這是環境網路規則，不是鏈上交易授權問題。
2. 提供原部署封存的 artifact、build-info input/output；現有 JSON 與 Git commit 不足以完成原始產物比較。
3. 重新執行十項唯讀查核並保存成功的原始回應，再決定是否具備 Task 06 前置條件。本報告沒有授權或開始 Task 06；後續確認數／重組與替換策略亦需在整合階段確定。

本輪已完成 JSON 解析／內部一致性檢查、固定 commit 原始碼／設定查閱、lockfile LF／CRLF 雜湊核對及五組唯讀探測。文件與 JSON 檢查不等於智能合約或前端整合測試通過；本次沒有執行前端 build 或合約測試。
