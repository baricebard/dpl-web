# Liquidity：流動性池與 AMM

## 責任與階段

Task 08A 已建立 DPLAMMPool Solidity 合約、EDR 本機測試與 Ignition 模組。未部署 Sepolia，正式 Pool 地址為 `null`；Task 08B 部署工具與 Task 08C UI 尚未實作，Liquidity 入口保持未開放。本模組不屬於原 MVP，既有 DPL Exchange 固定匯率功能保持獨立。

## A-07 已決定機制

單一 DPLT／DPLT-A 常數乘積池 `x * y = k`，兩種資產 18 decimals。預計教師初始注入 100 DPLT + 3,000 DPLT-A；初次提供者實際設定價格，合約不保證 1:30。Constructor 增加非零 immutable initialProvider，預定教師為 `0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02`；totalSupply 為零時只有此地址能在鏈上執行首次 addLiquidity，成功後所有帳號皆可注資，失敗不解鎖。詳見 [Task 08A 初始化政策](../15-amm-pool.md#初始化與搶先風險)。此一次性限制不賦予 owner、任意提領或正常 swap 管理權。

輸入費率 0.3%，全留池，無平台分潤。Pool 本身為 ERC-20 DPL-LP，18 decimals；首次 `floor(sqrt(x*y))` 扣 1000 最小 LP 單位永久鎖定，其餘給提供者。後續依實際儲備比例提供，僅扣實際用量，按兩邊比例較小值向下鑄造 LP；移除只 burn 呼叫者自己的 LP，按總供給／實際資產份額向下取整。無 Factory、Router、Oracle、挖礦、治理、Proxy、管理員提款或任意公開 mint。

初始化前直接轉入不能建立價格或取得 LP；成功首次注入後，既有捐贈歸初始 LP 與鎖定份額。初始化後儲備直接讀兩種 balanceOf，費用與不可退回的直接捐贈立即反映在報價及既有 LP 權益，新注資不能使用過期儲備。transfer 不等於 addLiquidity。兩儲備上限為 `2^112-1` 個最小單位，遠大於既有教學資產總供給。

## 介面與學習流程

`getReserves()`、`quoteSwap(tokenIn, amountIn)` 提供儲備與雙向報價；ERC-20 totalSupply／balanceOf 提供 LP 份額資料。swap 支援 minAmountOut／deadline；addLiquidity 支援兩資產最低用量／minLiquidity／deadline；removeLiquidity 支援兩最低收到量／deadline。三操作皆 nonReentrant、SafeERC20、失敗完整回滾。

未初始化顯示「尚未提供初始流動性」，不能顯示假價格。後續 UI 觀察交易前後儲備／即時價格、執行均價、Price Impact、費用、LP 份額與資產權益；區分 Price Impact 與使用者設定的 Slippage Tolerance，並解釋無常損失。教學代幣無真實金融價值，LP 收費不保證獲利。

## 本機驗證與未完成項目

EDR 測試涵蓋首次／後續注資、比例／精度／捨入、永久鎖定、LP 移轉與移除、雙向報價／交易、費用與 k、輸入／期限／最低量保護、上限、回滾／重入、直接捐贈及混合多 LP 操作。完整 API、公式、風險、驗證結果及 Task 08B／08C 人工待辦見 [DPL AMM 規格](../15-amm-pool.md)。本機通過不代表已部署或完成 MetaMask／Sepolia 驗收。
