# Task 05C-1：Sepolia 部署準備指南

> Task 05C-2 更新：已提供[本機 MetaMask 部署工具](08-local-deployment-tool.md)，固定部署者與 initialHolder 為 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`。以下保留先前準備紀錄；使用本機工具時以 08 指南的固定地址、產物檢查與安全流程為準。此句為工具開發當時的狀態；最新使用者提供紀錄及獨立驗證限制見下方 Task 06 補記。

## Task 06 現況補記

本指南是 Task 05C-1 的歷史部署準備成果，不是實際部署證據。Task 06 已取得使用者提供的三個 Sepolia 合約地址與初始教師公開地址，見 [Token 設定與驗收狀態](modules/token.md)。下方待部署範本保留作為當時未填的歷史紀錄，不能視為現在需要重新部署。main 現已保留使用者提供的部署 Hash／receipt 欄位紀錄，來源與獨立驗證限制見 [09 報告](09-sepolia-deployment-verification.md)；原始 artifact／build-info 封存仍缺，不虛構補填；Etherscan 原始碼驗證與歷史 runtime bytecode 比對仍未完成。Task 06 僅整合已提供地址，不發送部署或轉帳。

## Task 05C 歷史狀態與操作邊界

本次從最新 `origin/main`（`f9f108c946d0bcb51004da14bb7dd392b41244a0`）建立 `task-05c-deployment-prep`，只準備文件。**尚未部署、未發送任何公用區塊鏈交易，沒有合約地址或交易 Hash，也未開始 Task 06。** 以下部署、簽署與 Etherscan 操作，留給日後另行授權後由使用者親自執行。

先讀 [合約規格](06-token-contracts.md)、[Token 模組](modules/token.md)與 [README](../README.md)。同一份 [TeachingToken.sol](../contracts/TeachingToken.sol) 部署三次，沒有 owner、後續 mint 或供給修正功能；參數填錯無法在原實例更正。初始教師持有人可以與部署者不同，必須由使用者在部署時提供、核對並確認控制權；不能用範例地址代替。

全程只使用公開地址與編譯產物。MetaMask 在使用者自己的瀏覽器內簽署；不要求、貼上、匯出或交給 Codex 私鑰、助記詞、錢包匯出檔，也不將其放入 `.env`、終端機、Repository 或任何網站。三種代幣均無真實金融價值；ERC-20 不能支付部署 Gas，需事先備妥 Sepolia ETH。

## 1. 固定版本與可重現性門檻

| 項目 | 必須使用的值 |
| --- | --- |
| Solidity pragma / Hardhat / npm solc | `0.8.38`，三者一致 |
| 完整 compiler build | `0.8.38+commit.1835d247.Emscripten.clang`；Remix 選單通常顯示 `0.8.38+commit.1835d247` |
| OpenZeppelin Contracts | `5.6.1`，`package.json` 與 `package-lock.json` 鎖定 |
| Optimizer | enabled，runs `200` |
| EVM version | `cancun`，不可沿用 Remix 的預設值 |
| viaIR / metadata / remappings | 以當次 Hardhat Standard JSON input 的 `settings` 為準；未啟用 viaIR，不任意調整 metadata hash 或刪除 remappings |
| 工具鏈 | Node.js `24.22.1`、npm `11.9.0`、Hardhat `3.21.2`；見 `.nvmrc`、lockfile、[設定](../hardhat.config.ts) |

2026-11-10 已核對 npm metadata 的 `solc@0.8.38`、`@openzeppelin/contracts@5.6.1`，及 [Solidity 官方 solc-bin 清單](https://raw.githubusercontent.com/ethereum/solc-bin/gh-pages/bin/list.json)的 `soljson-v0.8.38+commit.1835d247.js`。版本存在不代表 Remix 或 Etherscan 當下已提供該 build，必須在操作時重新確認。

Remix **不讀取本專案 npm lockfile**。原始碼的 `@openzeppelin/contracts/...` 未帶版本 import，不能直接假設會解析為 5.6.1；只在 Remix 另改成帶版本 URL 也會改變來源路徑／metadata，不能宣稱與 Hardhat bytecode 相同。本指南不修改合約、不建議 flatten 後當成相同編譯。

可重現必須同時固定 compiler build、全部來源的內容與 source-unit 路徑、完整 settings，並比對 **creation bytecode 及 deployed bytecode（包含 metadata）**。ABI 相同、編譯成功或功能測試通過，都不能取代 bytecode 比對。Remix 尚未實機驗證；未通過以下門檻時，停止 Remix 的 Deploy，採第 3 節替代方案，不能自行降版或換依賴。

## 2. Remix 編譯準備（不簽署、不發交易）

以下在使用者自己的乾淨 checkout 執行，恢復 lockfile 的既有依賴，沒有新增套件：

```sh
nvm use
npm ci
npm run contracts:compile
npm run contracts:typecheck
npm run contracts:test
```

1. 保存此次 Git commit、`package-lock.json`，以及 `artifacts/build-info/` 中對應 TeachingToken 的 build info 與其 output 檔案。Hardhat 3 可能將 input 與 output 分開保存；依實際 JSON 欄位及 artifact 的關聯找出，不假設所有版本只有單一檔案。TeachingToken artifact 在 `artifacts/` 下，應含 ABI、creation `bytecode`、`deployedBytecode`。不要選 OpenZeppelin 的 ERC20 artifact。
2. 找出 Standard JSON input 中包含 TeachingToken 的 `sources` 與 `settings`。逐一取用 **`sources` 每個 key 作為來源路徑、`content` 作為檔案內容**，包含完整 OpenZeppelin 傳遞依賴；不可僅複製 ERC20.sol。若來源以 URL 表示，先解析為確定內容並驗證，再取得完整 content input。保存完整 input、output、solc 長版本及 artifact 在外部交付封存，不提交 artifacts／cache。
3. 在 [Remix IDE](https://remix.ethereum.org/) 建立乾淨 workspace，匯入上述檔案，保留來源路徑與所有原文，包括未改動的 TeachingToken。不要讓網路 import 再下載另一版 OpenZeppelin。檢查 Remix File Explorer 中實際解析的依賴，內容必須等於 lockfile 安裝的 5.6.1；若 Remix 無法表達 input 的路徑或 remappings，直接使用第 3 節。
4. 開啟 **Solidity Compiler**，選精確的 `0.8.38+commit.1835d247`，Language 為 Solidity；Advanced Configurations 設 Optimizer enabled／200、EVM Cancun。若使用 compiler configuration file，採該版 Remix 支援的格式，匯入 input 的完整 `settings`，再從 Compilation Details 確認實際生效值；不要將整份 Standard JSON 誤當 settings 貼上。
5. 編譯 TeachingToken，檢查無錯誤，選擇 `TeachingToken` 而非 `ERC20`。保存 Compilation Details 的 ABI、Bytecode、Runtime Bytecode、metadata 與編譯設定。將 Bytecode 的 `object` 與 Hardhat artifact 的 `bytecode`、Runtime Bytecode 的 `object` 與 `deployedBytecode` 比對；只允許統一 `0x` 前綴與大小寫，**不可去掉 metadata 再宣稱一致**。本合約不需要外部 library address linking。
6. 比對失敗時，先查 compiler、optimizer、Cancun、viaIR、來源內容／路徑、remappings、metadata 設定；保存差異。不以換合約、改 pragma、改 import 或重新部署來試錯。全部相同才可進入第 5 節。

## 3. Remix 無法重現時：使用已驗證的 Hardhat 產物與 MetaMask

這是替代部署途徑，**不是目前已有的 Hardhat Sepolia 部署命令**。現有 Hardhat 只有本機 EDR 網路；Ignition 的 `TeachingTokens.initialHolder` 是必填參數，三組名稱／symbol／供給由 `scripts/contracts/spec.ts` 固定，但尚無公用網路 signer。不要直接執行 Ignition 公用鏈部署，也不新增私鑰設定。

先在本機通過第 2 節檢查。用 lockfile 的 npm solc 重新對同一份 Standard JSON input 編譯，檢查 error severity，將 output 中 TeachingToken 的 `evm.bytecode.object` 及 `evm.deployedBytecode.object` 與 Hardhat artifact 完整比對；可用 `node` 載入 `solc` 並呼叫 `solc.compile(JSON.stringify(input))`。若仍不一致，停止並請維護者診斷，不送交易。

使用既有 viem **離線**產生每個實例的 deployment data。下列程式只編碼，不連線、不簽署；操作者須先把 `artifactPath` 指向實際 TeachingToken JSON，把 `holder` 填成自己的教師公開地址：

```js
// 在專案內以 Node ESM 執行；下列兩個空字串必須由操作者填入。
import fs from 'node:fs'
import { encodeDeployData, getAddress, zeroAddress } from 'viem'
import { INITIAL_SUPPLY, TOKENS } from './scripts/contracts/spec.ts'
const artifactPath = ''
const holder = ''
const initialHolder = getAddress(holder)
if (initialHolder === zeroAddress) throw new Error('Zero initial holder')
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
for (const token of TOKENS) {
  const args = [token.name, token.symbol, initialHolder, INITIAL_SUPPLY]
  const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args })
  fs.writeFileSync(`${token.id}-deployment-data.txt`, data)
}
```

由操作者在已連接 MetaMask 的 Remix 頁面開啟瀏覽器開發者 Console（不是 Node 終端機），僅在理解程式且完成第 5 節逐項核對後執行以下流程。若網站或瀏覽器禁止 Console 貼上，不繞過保護，請維護者提供經審查的本機錢包介面。

```js
// 一次只處理一種代幣；data 從自己離線生成並核對的檔案完整複製。
const data = ''
const provider = window.ethereum
if (!provider?.isMetaMask) throw new Error('Select MetaMask first')
const chainId = await provider.request({ method: 'eth_chainId' })
if (chainId !== '0xaa36a7') throw new Error('Expected Sepolia 11155111')
const accounts = await provider.request({ method: 'eth_accounts' })
if (!accounts.length || !/^0x[0-9a-fA-F]+$/.test(data)) throw new Error('Missing account/data')
// 在這一行之前再次人工核對 accounts[0]、chainId、data 與四個 constructor args。
// 以下會要求 MetaMask 確認並在使用者批准後真正發送，僅日後授權部署時執行。
const hash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{ from: accounts[0], value: '0x0', data }],
})
```

多錢包同時注入、provider 不明確或帳號不符時停止，先在瀏覽器停用其他錢包擴充功能再重新連接、核對；`isMetaMask` 不是身分安全證明。這是無 `to` 的 contract creation 交易，MetaMask 自行估 Gas，使用者親自確認。編碼檔須對應正確代幣並保存摘要；不得貼入別人提供的未知 data。送出後仍須完成 receipt、鏈上讀取與 Etherscan 驗證。此替代方案的本機編譯／編碼可以驗證；真實 MetaMask 送出與 Etherscan 相容性本次均未測試。

## 4. 三組 Constructor 參數

順序固定為 `name_ (string), symbol_ (string), initialHolder (address), initialSupply (uint256)`。下表的說明文字**不是可以直接貼入的地址**，部署時必須以使用者核對的教師公開地址取代；三個實例依規格由同一教師持有。

| 實例 | name_ | symbol_ | initialHolder | initialSupply（最小單位） |
| --- | --- | --- | --- | --- |
| DPLT | `DeFi Portfolio Lab Token` | `DPLT` | 部署時由使用者提供有效非零教師地址 | `1000000000000000000000000` |
| DPLT-A | `DeFi Portfolio Lab Asset A` | `DPLT-A` | 部署時由使用者提供有效非零教師地址 | `1000000000000000000000000` |
| DPLT-B | `DeFi Portfolio Lab Asset B` | `DPLT-B` | 部署時由使用者提供有效非零教師地址 | `1000000000000000000000000` |

三者均為 18 decimals，`1,000,000 × 10^18 = 1000000000000000000000000`。這是 wei-like ERC-20 最小單位，不是要發送的 ETH。展開 Remix Deploy 的四個獨立欄位，字串欄貼名稱／symbol 原文，address 貼實際教師地址，uint256 貼整數全文，不使用逗號、科學記號、浮點數或 `10^18` 表達式；Remix 的 **Value 必須為 0 Wei**。

可先執行既有離線準備命令，核對四個參數（`teacher_public_address` 由操作者設定）：

```sh
TOKEN_CHAIN_ID=11155111 TEACHER_ADDRESS="$teacher_public_address" npm run contracts:prepare
```

## 5. 日後實際部署：Remix + MetaMask

1. 由 [MetaMask 官方網站](https://metamask.io/download/)安裝、開啟測試用帳號；在設定開啟顯示測試網路並選擇 **Ethereum Sepolia**。確認部署帳號有 Sepolia ETH；初始教師持有人可不同，但必須確認其控制權。不要使用 Ethereum Mainnet 或其他 Sepolia L2。
2. 在 Remix **Deploy & Run Transactions → Environment** 選 **Injected Provider - MetaMask**（部分版本稱 Browser Extension 並要求選 MetaMask）。在錢包授權正確帳號；只連接帳號不等於部署授權。不要選 Remix VM 或陌生 External HTTP Provider。
3. 核對 Remix Account、MetaMask 地址與預定部署者完全一致。用 MetaMask 網路詳細資料及唯讀 `eth_chainId` 同時確認：十進位 **11155111**、十六進位 **0xaa36a7**。可在 Remix 頁面的瀏覽器 Console 執行 `await window.ethereum.request({ method: 'eth_chainId' })`；多錢包時依第 3 節先解決 provider 歧義。只看網路名稱不夠，錯鏈或讀取失敗立即停止。
4. 選已通過第 2 節比對的 `TeachingToken`，逐一輸入第 4 節四個欄位。一次只部署一種，完成 receipt、讀取與紀錄後再處理下一種，避免部署重複實例。
5. 點 Deploy 前及 MetaMask 確認前，**每一筆**重新核對下列清單；任何不符即拒絕，不自動重試。

| 必核對項目 | 期望 |
| --- | --- |
| 網站／帳號／鏈 | 官方 Remix 網域、正確部署帳號、11155111；若切帳號／鏈，重新核對整筆 |
| 交易用途／目標 | Contract deployment／contract creation；無既有 `to` 地址，不是 transfer、approve 或呼叫陌生合約 |
| 合約與產物 | TeachingToken、正確 commit／compiler／依賴、已比對的 creation bytecode；不是 ERC20 基底或其他 artifact |
| Constructor | 此次實例的名稱、symbol、使用者指定非零 initialHolder、完整整數供給；保存實際四參數 |
| ETH Value | 0 Wei；供給不是 ETH Value |
| Gas／費用 | Sepolia ETH 足夠、預估正常、錢包未警告模擬失敗；不以任意拉高 Gas 掩蓋錯誤 |
| 簽署要求 | 只有這一筆部署交易，沒有額外 token allowance／無限授權或秘密資料要求 |

6. 日後取得部署授權後才由使用者在 MetaMask 確認。記下返回的 hash，暫記「已送出／等待 receipt」，不是成功。拒簽時沒有部署；RPC 逾時或未知先查原 hash／錢包活動，不重新點 Deploy。若替換交易，保存原與替換 hash 的關聯，以實際 receipt 為準；不要把兩個 pending 當兩次成功部署。

## 6. Transaction Receipt 與部署後唯讀核對

在 Remix 終端展開交易結果，並從 MetaMask 活動以 **Sepolia** Explorer 開啟 [Sepolia Etherscan](https://sepolia.etherscan.io/)。也可對已知 hash 使用 `eth_getTransactionReceipt`；回傳 `null` 代表尚無 receipt，不能認定失敗或成功。

- Receipt `transactionHash` 必須與送出的 hash 一致，`status` 為 `0x1`（工具可能顯示 `1` 或 `success`）；`0x0`／Fail／Reverted 是鏈上失敗，即使已花 Gas 也不算部署成功。
- 核對 `from`、contract creation 的 `to`（通常為 null）、非空的 `contractAddress`、`blockNumber`、`blockHash`、`gasUsed`、`effectiveGasPrice`；記錄實際手續費及查詢時的 confirmations。區塊高度／hash 要與 Etherscan 一致；有 receipt 前不要填成功地址。
- 到 `contractAddress` 查看鏈上 code 非空，與已保存的 deployed bytecode 完整比對。本合約無 immutable／外部 library linking，可直接核對 runtime（不能僅看合約名稱）。三個地址應各自不同。
- 使用 Remix **At Address** 載入 TeachingToken ABI 或 Etherscan Read Contract；只讀取 `name()`、`symbol()`、`decimals() = 18`、`totalSupply() = 1000000000000000000000000`、`balanceOf(實際 initialHolder) = 1000000000000000000000000`（尚未分發時）。若部署者不同，初始供給仍應屬 initialHolder。
- Receipt logs 應有該合約的 `Transfer` mint 事件：來源為零地址語意、目的為實際 initialHolder、數量為完整供給。此處零地址是事件語意，不可當 initialHolder 使用。

至少成功 receipt 才能標記「鏈上執行成功」；另記 confirmations／檢查時間，不把一次 receipt 宣稱不可逆 finality。A-05 已由 Task 06 決定至少 1 個區塊與實際交易／canonical block 核對（見 [Token](modules/token.md)）；部署紀錄與教學啟用前需再查 receipt／code 是否仍在主鏈。查詢失敗、資料不一致或重組時改列「待確認」，不分發、不填入前端。

## 7. Sepolia Etherscan 原始碼驗證

原始碼驗證是公開來源與 bytecode 的匹配，不是另一筆部署交易，也不應要求 MetaMask 交易簽署或私鑰。三個地址都需各自完成驗證，名稱相同不代表自動全部完成。

1. 打開 Sepolia Etherscan，貼入 receipt 的實際合約地址，進入 **Contract → Verify and Publish**。確認網址仍為 `sepolia.etherscan.io`。
2. Compiler Type 選 **Solidity (Standard-Json-Input)**，精確版本選 `v0.8.38+commit.1835d247`，License 選 MIT。若選單無此 build，停止並記錄不支援，不改用其他 compiler 或重新部署碰運氣。
3. 上傳**真正生成部署 bytecode 的完整 Standard JSON input**，包含所有來源內容與原始路徑、optimizer 200、Cancun、viaIR／metadata／remappings。Remix 路徑部署用其已比對的實際輸入；替代方案用 Hardhat 輸入。不用 output／artifact 代替 input，不用單檔 TeachingToken 遺漏 OpenZeppelin，也不要 flatten 改變 metadata。
4. 若表單要求 Constructor Arguments，輸入四個參數的 **ABI 編碼 hex（不含 creation bytecode，依欄位要求去掉 0x）**，不是逗號文字或整份 deployment data。可離線使用既有 viem：`encodeAbiParameters([{type:'string'},{type:'string'},{type:'address'},{type:'uint256'}], [實際名稱, 實際symbol, 實際教師地址, 1000000000000000000000000n])`。每一種的名稱／symbol 不同，不能共用同一份編碼；自動偵測的參數也須人工核對。
5. 提交後確認 **exact/full match** 與來源、compiler、settings、constructor args；若僅是 similar match，另查完整匹配狀態，不直接記完成。再用 Read Contract 核對第 6 節各欄，保存驗證結果與實際 Contract Code 頁連結。
6. 失敗時依錯誤核對來源路徑／content、compiler build、optimizer、Cancun、metadata、constructor args 與目標鏈／地址。記錄錯誤與待辦，維持「未驗證」，不因此發新交易。若 Etherscan 尚不支援此 compiler，可保存 input／output／receipt／runtime 比對證據並等待支援，但不能宣稱 Etherscan 已驗證。

瀏覽器表單可能需要帳號／驗證碼。若另選 API 驗證，API Key 只在操作者自己的安全環境使用，不放在 `VITE_*`、Git 或聊天中；本次沒有設定 API、Hardhat verify 插件或執行驗證。

## 8. 三合約部署結果紀錄範本

以下保留真實欄位待填，不含虛構地址或 Hash。日後逐筆從錢包、receipt、編譯封存及 Etherscan 填寫；目前全部仍是「待部署」。

| 欄位 | DPLT | DPLT-A | DPLT-B |
| --- | --- | --- | --- |
| 狀態 | 待部署 | 待部署 | 待部署 |
| Network / Chain ID | Ethereum Sepolia / 11155111 | Ethereum Sepolia / 11155111 | Ethereum Sepolia / 11155111 |
| name_ | DeFi Portfolio Lab Token | DeFi Portfolio Lab Asset A | DeFi Portfolio Lab Asset B |
| symbol_ | DPLT | DPLT-A | DPLT-B |
| initialHolder | 待使用者提供 | 待使用者提供 | 待使用者提供 |
| initialSupply（最小單位） | 1000000000000000000000000 | 1000000000000000000000000 | 1000000000000000000000000 |
| Decimals | 18 | 18 | 18 |
| 部署者公開地址 | 待填 | 待填 | 待填 |
| 合約地址／鏈上 code 比對 | 待部署 | 待部署 | 待部署 |
| 原始／替換交易 Hash | 待部署 | 待部署 | 待部署 |
| Receipt status／區塊高度／block hash | 待部署 | 待部署 | 待部署 |
| Gas used／effective gas price／費用 | 待部署 | 待部署 | 待部署 |
| 查詢時間（含時區）／confirmations | 待部署 | 待部署 | 待部署 |
| 來源 Git commit／lockfile 摘要 | 待填 | 待填 | 待填 |
| Compiler／OpenZeppelin | 0.8.38+commit.1835d247 / 5.6.1 | 0.8.38+commit.1835d247 / 5.6.1 | 0.8.38+commit.1835d247 / 5.6.1 |
| Optimizer／EVM／完整 settings 封存 | enabled 200 / cancun；待封存 | enabled 200 / cancun；待封存 | enabled 200 / cancun；待封存 |
| Standard JSON input／output／artifact 封存位置與摘要 | 待填 | 待填 | 待填 |
| 實際 ABI constructor args／deployment data 摘要 | 待填 | 待填 | 待填 |
| name／symbol／supply／holder balance／mint log 核對 | 待部署 | 待部署 | 待部署 |
| Etherscan 驗證狀態／Code 頁連結 | 未部署、未驗證 | 未部署、未驗證 | 未部署、未驗證 |
| 異常、重組、後續處置 | 待填 | 待填 | 待填 |

## 9. 尚待確認與檢查紀錄

Remix UI 實際提供的 compiler／config 格式、完整 bytecode 重現、多錢包注入、真實 MetaMask 簽署與 receipt、Sepolia RPC 可用性，以及 Etherscan 對此 build 的支援，皆須由日後部署操作者實測。本次未連接錢包或公用鏈 RPC，未簽署、發交易或驗證已部署合約。替代流程不更改 TeachingToken，但也未執行公用鏈部署。這是 Task 05C 當時的紀錄；Task 06 現況與公開地址見本文件開頭補記。

本次工作區未安裝 node_modules，執行 `npm run contracts:compile` 回報 `hardhat: not found`，另外嘗試 lint、typecheck、build、contracts:typecheck、contracts:test，也分別因缺少 eslint、tsc 或 hardhat 未能本機執行。依 AGENTS.md 文件工作不安裝套件；既有合約 CI 會在 PR 以 `npm ci` 執行 compile、型別與 24 項本機測試，結果以 PR checks 為準，不沿用 Task 05 結果當成本次通過。文件結構、相對連結、無虛構地址／Hash、版本／三組參數一致性與 `git diff --check` 均已通過。

參考：[Remix 編譯文件](https://remix-ide.readthedocs.io/en/latest/compile.html)、[Remix 部署文件](https://remix-ide.readthedocs.io/en/latest/run.html)、[Solidity Standard JSON](https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description)、[Etherscan 驗證說明](https://docs.etherscan.io/contract-verification/verify-with-remix)。介面文字可能隨版本變更；以精確設定與實際產物核對為準。
