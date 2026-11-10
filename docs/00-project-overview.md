# 專案總覽

## 目的與使用情境

DeFi Portfolio Lab（去中心化金融投資組合實驗室）服務大學區塊鏈與去中心化金融課程。單班預計 30 人，支援實體示範、線上同步操作與課後練習；先完成可驗收的 MVP，再逐步支援一學期課程。

學生透過自己的測試用錢包觀察資產、發送交易，進而理解交換、流動性與投資組合。教師負責課前資源準備、示範及故障替代流程。初期不提供帳號、學生名冊、成績或班級管理系統。

## 名稱與資產定義

| 名稱 | 定義 |
| --- | --- |
| DeFi Portfolio Lab | 平台名稱 |
| DPL Exchange | 未來代幣交換介面名稱 |
| DPLT | DeFi Portfolio Lab Token，教學 ERC-20 代幣 |
| DPLT-A | 教學資產 A，ERC-20 代幣 |
| DPLT-B | 教學資產 B，ERC-20 代幣 |
| Sepolia ETH | Ethereum Sepolia 的原生測試網 Gas 資產，並非自訂 ERC-20 |

三種代幣已有任務提供的 Ethereum Sepolia 部署地址（見 [Token](modules/token.md)，本次新的 RPC 核對仍受阻），皆不具真實金融價值；代幣名稱不暗示價格、兌換比率、治理權或供給機制。平台不處理真實資產、法幣買賣、主網交易或收益承諾。

## 已確認原則

- 前端使用 React、TypeScript、Vite，部署於 GitHub Pages。
- 初期無獨立後端伺服器與資料庫；鏈上狀態透過 RPC 讀取。
- 區塊鏈為 Ethereum Sepolia；智能合約採 Solidity，規劃使用 Hardhat 開發與測試。
- 學生自行連接錢包；網站不得取得、保管或要求輸入私鑰與助記詞。
- 功能依模組逐步擴充，未完成模組不得呈現為可交易功能。

## 文件責任與閱讀順序

先讀本文件，再讀[系統架構](01-system-architecture.md)、[MVP 範圍](02-mvp-scope.md)與[路線圖](03-development-roadmap.md)。模組文件負責各自的使用流程、介面契約、錯誤與驗收；跨模組技術決策集中在系統架構，避免在各處複製。

本文只定義背景與固定原則，不承擔功能驗收或合約機制選型。文件描述的是目標規格；實作及部署狀態以 [README](../README.md) 為入口。
