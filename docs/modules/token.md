# Token：ERC-20 餘額與轉帳

## 責任與範圍

MVP 負責 DPLT、DPLT-A、DPLT-B 的資產資料、餘額與單筆轉帳。名稱定義見[專案總覽](../00-project-overview.md)。依賴 Wallet 與共用鏈上讀寫層；原生 Sepolia ETH 僅獨立展示 Gas 餘額，不走 ERC-20 `transfer`。

## 讀取與轉帳流程

- 由公開設定載入三種經驗證的合約地址與 ABI，讀取／核對 symbol、decimals 及帳號餘額。缺地址、無合約或資料不符時停用該資產操作。
- 學生選擇資產、輸入收款地址與十進位金額。MVP 接受明確地址，不加入名稱解析或任意代幣匯入。
- 驗證地址格式、拒絕零地址、金額為正、精度不超過 decimals 且不超過代幣餘額；Gas 不足需獨立提示，預估費用不等於最終費用。
- 送出前顯示網路、代幣、收款地址與金額摘要，由錢包簽署。單純 ERC-20 轉帳無需 `approve`，不得要求無關授權。
- 依共用交易狀態追蹤 hash／receipt，成功後重新讀取餘額；失敗或結果未知不得假設資產已轉移。

## 模組介面

輸入資產設定、Wallet 狀態及轉帳表單；輸出具資產識別與精度的餘額、讀取狀態及交易結果。供未來 Portfolio 讀取資產資料，交換授權流程歸 Exchange，發幣邏輯歸合約與 Faucet 決策。

## 合約設計邊界

Task 05 已實作單一 `contracts/TeachingToken.sol`，繼承 OpenZeppelin ERC20，由 constructor 設定名稱、symbol、初始教師持有人及基礎單位供給。三個實例規格如下，皆以 Ethereum Sepolia（11155111）為未來部署目標，**尚未部署**：

| Name | Symbol | Decimals | 初始供給 |
| --- | --- | --- | --- |
| DeFi Portfolio Lab Token | DPLT | 18 | 1,000,000 |
| DeFi Portfolio Lab Asset A | DPLT-A | 18 | 1,000,000 |
| DeFi Portfolio Lab Asset B | DPLT-B | 18 | 1,000,000 |

A-03 已確定：每個實例 `1_000_000n * 10n ** 18n`，constructor 一次 `_mint()` 給明確指定、有效且非零的教師地址，地址／餘額／供給互相獨立。固定供給，無後續 mint、burn、owner、管理員、pause、proxy、稅費、黑名單或凍結；完全沿用 OpenZeppelin 標準餘額與授權邏輯。

A-04 已確定：教師使用一般 Sepolia transfer 分發三種教學代幣。沒有 ERC-20 自動 Faucet、批次合約或教師介面，原生 Sepolia ETH 領取指引不代表 ERC-20 領幣。A-05 最低原則為自行錢包確認、hash 不等於成功、至少 receipt status success；拒簽、失敗、RPC 逾時、未知分開呈現且不自動重送，切換帳號／網路不沿用授權。確認數、重組及替換策略於 Task 06 前決定。

工具版本、24 項本機測試、Ignition 模組、部署預檢與待部署紀錄見 [Task 05 合約文件](../06-token-contracts.md)。Token UI 仍未開放，本次沒有前端轉帳實作。

## 驗證與後續

前端驗證整數換算、極小／大額、超精度、非法地址、零餘額、舊帳號結果、拒簽、revert 與 RPC 錯誤。合約階段驗證選定供給規則、轉帳、餘額不足、事件及所有管理權限；本機通過後才安排 Sepolia 整合測試。批次轉帳、資產匯入與管理介面延後。
