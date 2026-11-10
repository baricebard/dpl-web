# Task 06 審查修正：完整 Runtime Bytecode 完整性

## 審查發現與修正邊界

PR #8 初版的「Code／Metadata 核對」只包含 code 非空，以及 ERC-20 name、symbol、decimals、totalSupply 值比對。這不足以辨識 runtime 身分，也未檢查 Solidity 編譯 metadata。不得把初版結果描述為已完成 bytecode 完整性驗證。

本次加入**完整 runtime 的 Keccak-256 與 byte 長度比對**：全部 runtime bytes 均納入，包含末尾 Solidity CBOR metadata 與其長度欄，不剝除、重寫或忽略 metadata。這是基於 Keccak-256 抗碰撞性的完整資料指紋核對，不是逐 byte 迴圈比對。hex 大小寫不影響 bytes。空值、奇數長度／非法 hex、長度不符、可執行碼不同、僅 metadata 不同均拒絕。

已檢查 production JS bundle：存在預期指紋，不包含完整 runtime hex、Hardhat artifact 格式標記或 TeachingToken Solidity 原始碼。正式前端只包含 [精簡 manifest](../src/config/teachingTokenRuntime.ts)與[比對函式](../src/lib/web3/runtimeIntegrity.ts)，沒有匯入 Hardhat artifact、runtime 全文、Solidity 原始碼或 Standard JSON 編譯資料。測試的真實編譯 runtime fixture 只由 Node 端讀取本機 artifact，沒有打包進網站。

## 可追溯的預期值

| 項目 | 固定值 |
| --- | --- |
| 來源 commit | `1ed599aef60bc3a110c52910700d843e1081ec9b`（Task 05C-1） |
| 合約 | `contracts/TeachingToken.sol:TeachingToken` |
| Compiler | `0.8.38+commit.1835d247.Emscripten.clang` |
| OpenZeppelin | `5.6.1` |
| Optimizer / EVM | enabled / 200 runs / Cancun；viaIR 未啟用；Solidity 預設 metadata 設定 |
| 完整 runtime 大小 | `1764` bytes（含 metadata） |
| 完整 runtime Keccak-256 | `0x88419e5ba519f7ec9b3ec0b822a04597f18b0f1a08b0afe611f3bdae6bbe3105` |

[離線產生／檢查工具](../scripts/contracts/runtime-manifest.ts)的步驟：

1. 比對目前 TeachingToken 原始碼、Hardhat 設定、lockfile 與指定 Git commit 原文完全一致；package.json 比對 dependencies、devDependencies、engines、packageManager，允許加入本機工具的 npm scripts，而不放寬依賴與 compiler 基線。這個 commit 必須存在於 checkout 歷史中；工具不自動連線取檔或改用其他基線。
2. 由 TeachingToken artifact 的 buildInfoId 載入其 Standard JSON input，確認 artifact 引用與 build-info 內的 id 相同；buildInfoId 含本機 compiler 絕對路徑，只用作檔案定位，不納入可攜 manifest。核對精確 compiler build、optimizer、EVM、viaIR、metadata 預設與 remapping。逐份比對來源單位內容與本機原始碼／lockfile 安裝的 OpenZeppelin，拒絕未知 source-unit 路徑。
3. 以 lockfile 的 npm solc **重新編譯整份 input**（保留 source-unit 路徑與全部設定），要求重新生成的 deployedBytecode 與 Hardhat artifact 全文一致。拒絕 link／immutable references；TeachingToken 沒有需要替換的 runtime 欄位，三個 constructor 名稱與供給是 storage 初始化，runtime 本身相同。
4. 要求存在 Solidity metadata 尾段，對包含尾段的完整 runtime 產生 Keccak-256／長度。manifest 同時記錄來源 commit、compiler、lockfile／Standard JSON input／soljson.js 的 SHA-256，可供審查追溯；不把那些完整資料放進前端。
5. `--check` 在記憶體重建 manifest，要求已提交檔案逐字一致，失敗即非零退出，不會自行改寫預期值。產生新值需要明確執行不帶 `--check` 的工具，且需人工審查差異，不是從 RPC 返回值學習可信 bytecode。

重現命令（先使用專案 Node/npm 版本；完整 Git checkout，既有依賴未安裝時先 `npm ci`）：

```sh
npm run contracts:compile -- --force
node scripts/contracts/runtime-manifest.ts --check
npm run contracts:typecheck
npm run contracts:test
npm run lint
npm run typecheck
npm run build
npm test
```

若要審閱產生結果可執行 `node scripts/contracts/runtime-manifest.ts`，然後檢查 Git diff；**不能為了讓實際部署地址通過而任意換摘要、去掉 metadata 或降級成非空 code 檢查**。編譯依賴／設定變更時必須重新審查來源 commit 與 manifest，本工具刻意拒絕自動跟隨新基線。

合約 PR CI 與 Pages build 加入 `--check` 門檻，checkout 取得完整歷史；Pages build 先本機編譯及核對 manifest，再建置網站。這只是工作流程修改，本次沒有觸發 Pages 或發布。前端測試現在需要事先生成 Hardhat artifact 作為 Node 測試 fixture，上述命令與 Pages 工作流程均包含這一步。

## 執行時拒絕策略與 RPC／錢包隔離

[verifyToken()](../src/modules/token/services/tokenService.ts)先使用設定的 Sepolia Public Client 核對 chain ID，取得未快取的區塊高度，在該高度讀取 Code 及 ERC-20 metadata。順序為：固定 allowlist → chain ID → 完整 runtime 指紋 → name／symbol／decimals／totalSupply。任一例外或不符均拒絕，沒有「code 非空便放行」的備援。這是對設定 RPC 回傳資料的核對，不是對任意 RPC 的共識證明，也不是安全審計。

初次餘額讀取失敗時該代幣沒有可用餘額，表單停用；準備摘要與真正發送前也會重新執行驗證，不信任先前成功值。驗證結果不快取為全域安全旗標。RPC 拒絕、逾時、回傳壞資料或重查時 code 改變，都不會進入錢包發送。

verifyToken 本身只負責帳號無關的合約資料。prepareTransfer 在核對前、核對結束後及前置程序結束前重查原 MetaMask 工作階段與 eth_accounts／eth_chainId。切換帳號、網路、Provider 或 A → B → A 事件都使原 session 失效；舊回應不能生成可發送摘要。餘額 store 依帳號／鏈隔離，舊查詢的失敗不能覆蓋新帳號資料。完整性判斷只使用設定 Public Client 的 Code 與預期指紋，不讀取錢包自行宣稱的「合約安全」狀態。

## 證據限制與發布前獨立驗收

上述結果是**以 Task 05C Git 基線重建的本機預期 runtime**，不是已取得當時操作者封存的歷史部署產物。初始 Task 06 基線只有操作指南；最終 main 整合已有[使用者部署紀錄](09-sepolia-deployment-record.json)與[受阻報告](09-sepolia-deployment-verification.md)，但仍沒有原始 Standard JSON／artifact 封存及新的獨立鏈上 full-match 證據；不能因本機重編成功而補稱這些歷史驗收已完成。

此環境先前對 PublicNode 的唯讀請求遭代理 403，沒有新的三地址鏈上匹配證據。三個地址完全不變，未重新部署。發布前必須在允許的環境執行：

```sh
node scripts/contracts/runtime-manifest.ts --check
node scripts/contracts/read-deployed.ts
```

逐一保存 chain ID、查詢區塊、合約 code 的實際摘要／長度、ERC-20 metadata 與預期值比對結果，並補齊原部署紀錄、Etherscan 原始碼 full match／歷史 runtime 封存對照及人工 MetaMask 流程。若正式部署使用不同 Remix source-unit 路徑或設定導致 metadata 不同，即使可執行碼相似，也維持停用；由維護者取得實際產物證據並另行審查，不以移除 metadata 或重新部署解決。

Mock 核對、EDR 本機部署及指紋重現都不等於真實 Sepolia 三地址通過驗收。這個限制在 PR 說明中獨立列出，不宣稱 Etherscan 或歷史 bytecode 驗證完成。

## 本次驗證

- 強制 Hardhat 重編與 manifest `--check` 通過；當時跨目錄測試重用同一份 node_modules，完整 runtime 與 buildInfoId 一致，但未涵蓋獨立安裝路徑；後續 CI 因 buildInfoId 不可攜失敗，已由 [CI 修正紀錄](10-task-06-ci-reproducibility.md)補正；三種本機 EDR 實例完整 runtime 均符合指紋，24 項合約回歸通過。
- 新增 executable code 竄改、僅 Solidity metadata 尾段竄改、非法／缺漏 Code、摘要後核對失敗、RPC 例外、核對中切帳號、舊帳號 Code 錯誤回應隔離等測試。ERC-20 name／symbol／decimals／supply 不符測試繼續保留。
- `npm run lint`、`npm run typecheck`、`npm run contracts:typecheck`、`npm run build` 全部通過。build 保留既有 viem/ox externalization 與 >500 kB bundle 提示，未隱藏。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- --workers=4`：**186/186 通過**（93 個案例各跑桌面／手機，含 Wallet／Faucet 回歸）。
- `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache npm run contracts:compile -- --force`、`node scripts/contracts/runtime-manifest.ts --check` 及同 XDG 設定的 `npm run contracts:test`：通過，合約測試 **24/24**。
- `git diff --check` 與文件相對連結檢查通過。未新增依賴或修改 lockfile、TeachingToken.sol、三個公開合約地址。
- 未執行真實 ERC-20 轉帳、合約部署、Pages 發布或 PR 合併。

目前 CI 可重現性與最新測試結果見 [CI 修正紀錄](10-task-06-ci-reproducibility.md)，本節先前本機結果不代表當時 GitHub Actions 已通過。
