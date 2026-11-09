# dpl-web
DeFi Portfolio Lab Website

DeFi Portfolio Lab（去中心化金融投資組合實驗室）是供大學區塊鏈與 DeFi 課程使用的零真實資金教學平台，預計支援單班 30 人的實體與線上混合授課。

Repository：[baricebard/dpl-web](https://github.com/baricebard/dpl-web)。交易介面名稱為 **DPL Exchange**。

Task 02 已建立 React／TypeScript／Vite 前端基礎工程與響應式首頁。Wallet、Faucet、Token、Exchange、Liquidity、Portfolio 六個入口均標示「尚未開放」並停用；沒有錢包連接、RPC、合約或鏈上交易，也沒有模擬資產或交易結果。本次未發布 GitHub Pages。

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

`build` 先檢查型別再輸出 `dist/`；`test` 以 production preview 驗證桌面與手機的子路徑、重新整理、停用入口與鍵盤導覽，執行前須先 build。測試產物、依賴目錄與建置產物不提交。

## 結構與後續擴充

頁面位於 `src/app/pages/`，共用元件與 CSS 位於 `src/shared/components/`、`src/shared/styles/`，公開教學網路資訊與模組清單位於 `src/config/`。依 Task 01 目錄基線組織，不預先建立空的功能模組或 RPC 適配層。未來功能置於 `src/modules/<module>/`，由 App 組裝；共用層不依賴功能模組。

前端選型、範圍與部署操作見 [Task 02 前端基礎工程](docs/04-frontend-foundation.md)。此交付是路線圖階段 1 的基礎工程部分，尚未完成 Wallet 與 Faucet 指引功能。

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

前端已採 React、TypeScript、Vite；Ethereum Sepolia 整合與 Solidity／Hardhat 合約仍屬後續開發。
