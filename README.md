# dpl-web
DeFi Portfolio Lab Website

DeFi Portfolio Lab（去中心化金融投資組合實驗室）是供大學區塊鏈與 DeFi 課程使用的零真實資金教學平台，預計支援單班 30 人的實體與線上混合授課。

Repository：[baricebard/dpl-web](https://github.com/baricebard/dpl-web)。交易介面名稱為 **DPL Exchange**。

目前儲存庫僅有規劃文件，尚未建立應用程式、安裝依賴、建立或部署智能合約，也未發布 GitHub Pages 網站。下列功能均為規劃，不代表已可使用。

## 文件入口

| 文件 | 責任 |
| --- | --- |
| [專案總覽](docs/00-project-overview.md) | 教學目標、名詞與固定原則 |
| [系統架構](docs/01-system-architecture.md) | 模組邊界、資料流、部署與跨模組待決事項 |
| [MVP 範圍](docs/02-mvp-scope.md) | 第一版交付邊界與驗收條件 |
| [開發路線圖](docs/03-development-roadmap.md) | 分期順序、依賴與進入條件 |
| [Codex 開發規範](AGENTS.md) | 目錄管理、測試與安全要求 |

模組規格：[Wallet](docs/modules/wallet.md) · [Faucet](docs/modules/faucet.md) · [Token](docs/modules/token.md) · [Exchange](docs/modules/exchange.md) · [Liquidity](docs/modules/liquidity.md) · [Portfolio](docs/modules/portfolio.md) · [Layer 2](docs/modules/layer2.md)。

技術方向為 React、TypeScript、Vite、GitHub Pages、Ethereum Sepolia，以及 Solidity／Hardhat；開發指令將在實際建立工具鏈後補充。
