# dpl-web
DeFi Portfolio Lab Website

DeFi Portfolio Lab（去中心化金融投資組合實驗室）是供大學區塊鏈與 DeFi 課程使用的零真實資金教學平台，預計支援單班 30 人的實體與線上混合授課。

Repository：[baricebard/dpl-web](https://github.com/baricebard/dpl-web)。交易介面名稱為 **DPL Exchange**。

Task 02 已建立 React／TypeScript／Vite 前端與響應式首頁。Task 03 已開放 MetaMask Wallet 連接與 Sepolia 網路檢查；Task 04 已開放 Faucet，新增獨立 viem Public Client、Sepolia ETH 餘額查詢與 Gas 教材；其餘四張模組卡片保持未開放。RPC 真實可用性與 CORS 尚未驗證，沒有合約、資產交易或模擬連線結果。本次未發布 GitHub Pages。

## 本機開發與驗證

使用 Node.js `24.22.1`（見 `.nvmrc`）與 npm `11.9.0`。直接依賴使用精確版本，完整依賴由 `package-lock.json` 鎖定。

```sh
nvm use
npm ci
npm run dev
```

開啟 Vite 顯示的 `/dpl-web/` 網址。首次建立或有意更新依賴時使用 `npm install`，並一併審查 lockfile。

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm test
npm run preview
```

Linux 若缺少瀏覽器系統依賴，依執行環境規則安裝，或在允許的環境使用 `npx playwright install --with-deps chromium`。已有 Chromium 時可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`。

`build` 先檢查型別再輸出 `dist/`；`test` 以 production preview 驗證桌面與手機的子路徑、重新整理、未開放入口、Wallet Mock Provider 流程與鍵盤導覽，執行前須先 build。測試產物、依賴目錄與建置產物不提交。

## 結構與後續擴充

頁面位於 `src/app/pages/`，共用元件與 CSS 位於 `src/shared/components/`、`src/shared/styles/`，公開教學網路資訊與模組清單位於 `src/config/`。依 Task 01 目錄基線組織，Wallet 位於 `src/modules/wallet/`，Provider 發現適配位於 `src/lib/web3/`。未來功能置於 `src/modules/<module>/`，由 App 組裝；共用層不依賴功能模組。

前端選型、範圍與部署操作見 [Task 02 前端基礎工程](docs/04-frontend-foundation.md)。此交付是路線圖階段 1 的基礎工程部分，Wallet 已由 Task 03 完成，Faucet 指引與 Sepolia ETH 餘額已由 Task 04 加入。

## Wallet 操作指引

1. 由 [MetaMask 官方網站](https://metamask.io/download/)安裝瀏覽器擴充功能，使用測試用錢包並解鎖。網站不會要求私鑰或助記詞。
2. 首頁 Wallet 卡片點擊「開啟錢包介面」，再點擊「連接錢包」，於 MetaMask 選擇帳號並授權。重新整理只檢查既有授權，不自動彈出授權要求。
3. 確認地址、複製地址及目前 Chain ID；非 Sepolia 時點擊「切換至 Sepolia」並於錢包確認。若未啟用測試網，依提示在 MetaMask 開啟「顯示測試網路」後選擇 Sepolia。
4. 「中斷網站工作階段」只清除本頁狀態，不撤銷 MetaMask 中的網站授權；請在錢包權限管理另外撤銷。授權仍存在時重新整理可恢復連線。

拒絕、未解鎖、請求進行中或切換失敗時，依畫面指引處理後重試。本階段不提供交易或簽章，錢包連接不代表學生身分認證。暫不支援 WalletConnect QR Code 與手機跨 App。

選型、公開 API 與測試限制見 [Wallet 規格](docs/modules/wallet.md)；A-01、A-02 已確定本階段範圍，Task 04 的 Public RPC 策略與待人工驗證限制見 [Faucet 規格](docs/modules/faucet.md)。自動化使用 Mock Provider，尚未進行真實 MetaMask 授權、解鎖與切換網路驗證。

## Sepolia ETH 與 Faucet

首頁 Faucet 入口提供目前地址、複製、Sepolia ETH 餘額／完整精度／更新時間、安全 Etherscan 連結與 Gas 教材。先在 Wallet 連接並切換 Sepolia，依外部 Faucet 指引領取後返回點「重新查詢餘額」。網站不代領、不簽名、不轉帳；查詢失敗不顯示為零。

公開 RPC 候選為 PublicNode Sepolia，無金鑰、無自動備援；本環境真實請求遭代理 403，鏈別、餘額與 CORS **尚未驗證**。讀取層每請求 8 秒逾時、最多重試一次；限流不自動重試，至少冷卻 30 秒，一般手動更新間隔最少 10 秒，無輪詢。

[PoW Faucet](https://sepolia-faucet.pk910.de/) 需瀏覽器運算；[Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) 需登入且其他限制待確認；[Alchemy](https://www.alchemy.com/faucets/ethereum-sepolia) 有主網資產／活動門檻，不適合零主網資產新手。候選均未實際領幣，不能保證全班可用。完整資格與教師 30 人課前準備見 [Faucet 規格](docs/modules/faucet.md)，驗證結果見 [Task 04 紀錄](docs/05-task-04-validation.md)。

## GitHub Pages

預計網址：<https://baricebard.github.io/dpl-web/>。Vite `base` 固定為 `/dpl-web/`，單頁使用錨點導覽，無須 history rewrite。

工作流程為 `.github/workflows/deploy-pages.yml`。未來經審查合併至 main 後，push main 會自動執行；也可在 main 手動觸發。其他分支即使手動觸發，也會略過部署。流程依序執行 `npm ci`、lint、build（含型別檢查）、瀏覽器測試，使用官方 Pages Actions 上傳 `dist` 並部署。

首次發布前，需由維護者在 Repository **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**，並確認 `github-pages` environment 的分支限制與審核規則。本次僅建立設定，未變更遠端 Pages 設定、推送 main 或觸發發布；實際發布仍須另行授權。

## 文件入口

| 文件 | 責任 |
| --- | --- |
| [專案總覽](docs/00-project-overview.md) | 教學目標、名詞與固定原則 |
| [系統架構](docs/01-system-architecture.md) | 模組邊界、資料流、部署與跨模組待決事項 |
| [MVP 範圍](docs/02-mvp-scope.md) | 第一版交付邊界與驗收條件 |
| [開發路線圖](docs/03-development-roadmap.md) | 分期順序、依賴與進入條件 |
| [前端基礎工程](docs/04-frontend-foundation.md) | Task 02 實作範圍、選型、驗證與部署設定 |
| [Codex 開發規範](AGENTS.md) | 目錄管理、測試與安全要求 |

模組規格：[Wallet](docs/modules/wallet.md) · [Faucet](docs/modules/faucet.md) · [Token](docs/modules/token.md) · [Exchange](docs/modules/exchange.md) · [Liquidity](docs/modules/liquidity.md) · [Portfolio](docs/modules/portfolio.md) · [Layer 2](docs/modules/layer2.md)。

前端已採 React、TypeScript、Vite、viem 2.57.17；Sepolia ETH 餘額已實作；ERC-20 讀寫與 Solidity／Hardhat 合約仍屬後續開發。
