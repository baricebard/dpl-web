# Task 06：GitHub Actions Runtime Manifest 可重現性修正

## 實際失敗與根本原因

已讀取 [Local contract checks Run 42836456941](https://github.com/baricebard/dpl-web/actions/runs/42836456941) 的 job `129899846199` 實際日誌。該 run 驗證 PR #8 的 `e43c07709cb51f55daf4342a4d162279e582df03`（Actions checkout 為暫時 merge commit `ca50f43`），npm ci 與 Hardhat compile 成功，manifest 檢查失敗，後續 contracts:typecheck／contracts:test 被跳過。

錯誤為 `AssertionError [ERR_ASSERTION]: Runtime manifest is stale or modified; regenerate and review`，差異只有：

- 已提交 buildInfoId：`solc-0_8_38-fc8a1dc7c4a9e654cb264cd82d11067983981c07`。
- CI 重建 buildInfoId：`solc-0_8_38-e08cc92be176b176b25a3a5d7409cb96065980c3`。

Runtime Keccak-256、1764 bytes 長度、Standard JSON input SHA-256、lockfile SHA-256、soljson.js SHA-256 全部一致。不是 runtime 或 Solidity metadata 不同，也不是失敗步驟使用了不同 Solidity 版本。

Hardhat 3.21.2 的 `CompilationJobImplementation.#computeBuildId()` 將 `normalizedSolcConfig` 加入 build ID preimage；這個 config 保留本專案 `require.resolve('solc/soljson.js')` 得到的**絕對路徑**。因此 build-info ID 是含本機環境資訊的 Hardhat 產物索引，不是僅由 solc input 或 runtime 決定的可攜內容摘要。前次跨目錄重建測試共用 node_modules，compiler 仍解析到相同路徑，未測到獨立安裝情境。

## 乾淨 checkout 重現

使用獨立 Git clone `/tmp/dpl-ci-repro`，checkout 上述失敗 commit；起始沒有 node_modules、artifacts、cache，也沒有把原工作區 node_modules 連過去。執行 `npm ci --cache /tmp/dpl-npm-cache`，8 秒完成安裝 306 個套件，接著執行 Hardhat compile 與原版 `runtime-manifest.ts --check`。

成功重現相同 assertion：新 clone 的 buildInfoId 為 `solc-0_8_38-fbad6fa23f408bdc0a3a349e5d910e8d7455bdbc`，其餘內容摘要與完整 runtime 均與已提交版本相同。npm cache 只重用下載內容，安裝目錄獨立，不重用產物。Node 24.22.1、npm 11.9.0；原 CI Node 同版、npm 11.19.1，根因已由 Hardhat build ID preimage 與路徑差異確認，不將 npm 版本差異當成未證實的原因。

## 修正與不變的安全門檻

只移除 manifest 內不可攜的 buildInfoId 欄位，繼續以該 ID 找到本機 build-info，並**新增 artifact 引用 ID 與 build-info 內 id 一致的 assertion**。可攜的內容識別仍為完整 Standard JSON input SHA-256、compiler binary SHA-256、lockfile SHA-256、來源 commit、完整 runtime Keccak-256 與 byte 長度。

完整 runtime 指紋保持 `0x88419e5ba519f7ec9b3ec0b822a04597f18b0f1a08b0afe611f3bdae6bbe3105`，1764 bytes，包含全部 Solidity CBOR metadata 與尾段長度。沒有修改 Solidity、三個已部署地址、供給設定或任何金額；沒有剝除 metadata、採納新的未知 bytecode、改成非空 code 檢查、略過 assertion 或停用 CI。

原有 Git 基線／來源／compiler／設定核對、完整 input 獨立重編、與 Hardhat runtime 全文比對、metadata 存在性、manifest 逐字 `--check`、前端執行時完整指紋檢查均保留。

## 回歸測試與驗證

新增 `test/contracts/RuntimeManifest.test.ts`，在自有暫存 fixture 中執行真正的產生器：

1. build-info 名稱／ID 改變，但 compiler input、來源與 runtime 相同 → `--check` 通過。
2. 僅修改 artifact runtime 的 Solidity metadata byte → 重編全文比對失敗。
3. artifact 引用與 build-info id 不同 → 失敗。
4. 已提交預期 runtime 指紋被修改 → `--check` 失敗。

修正檔案套用至上述獨立安裝的 checkout 後重新執行完整驗證。第一次 Playwright 有 185 項通過、手機鍵盤案例因 React 初次 render 前送出 Tab 而失敗；已加入主標題可見的就緒條件，保留鍵盤焦點斷言並重跑全套，不使用略過或自動忽略失敗。合約測試 fixture 為離線測試且不修改原工作樹；僅該 fixture 重用依賴，與先前真正獨立 npm ci 重現情境不同。

| 檢查 | 結果 |
| --- | --- |
| 獨立 checkout / npm ci / Hardhat compile | 通過；原版 manifest 失敗成功重現 |
| 修正後 `node scripts/contracts/runtime-manifest.ts --check` | 通過，原 runtime／metadata 指紋不變 |
| lint / typecheck / contracts:typecheck | 通過 |
| contracts:test | 28/28 通過（原 24 項加 4 項 manifest 回歸） |
| build | 通過，既有 viem/ox externalization 與 >500 kB 提示仍保留 |
| Playwright（production preview，桌面／手機） | 最終完整重跑 186/186 通過 |
| git diff --check | 通過；保護檔案無差異與文件相對連結亦已檢查 |

本環境對 Hardhat 使用可寫的 `XDG_CONFIG_HOME=/tmp/dpl-config XDG_CACHE_HOME=/tmp/dpl-cache`，Playwright 使用 `/usr/bin/chromium`，測試限制與原 Task 06 相同。此處本機結果不能替代遠端 CI；最新 commit 的 GitHub Actions run 與終態在 PR #8 與完成報告中另行記錄，只有所有必要步驟完成且 run conclusion 為 success 才稱遠端 CI 成功。

PR #8 保持 Draft，不合併 main、不發布或發送真實 Sepolia 交易。真實三地址的鏈上 runtime 匹配、Etherscan 與歷史部署證據等獨立驗收限制仍見 [完整性說明](09-task-06-runtime-integrity.md)。
