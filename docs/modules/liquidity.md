# Liquidity：流動性池與 AMM

Task 08A／08B 已合併；Task 08C 提供學生 AMM Swap、Add Liquidity、Remove Liquidity 與 LP 權益介面。此為 MVP 之外的後續教學模組；真實 Sepolia 兩帳號人工驗收與網站發布仍待完成。

A-07 已決定單一 DPLT／DPLT-A 常數乘積池、18 decimals ERC-20 DPL-LP、0.3% 輸入費用全部留池、永久鎖定 1000 LP 最小單位。無管理者任意提領、獎勵挖礦或收益保證；合約規則見 [Task 08A](../15-amm-pool.md)。

使用者提供 Pool `0x58841DBfDBa420B52fedbEe07AC9414E74E382F2`（Sepolia 11155111）。初始化紀錄不當作即時儲備；學生頁不提供首次初始化，也不部署合約。唯一前端設定為 [amm.ts](../../src/config/amm.ts)，最小 ABI 摘自合約，查詢核對資產／initialProvider／LP 精度。

## 操作與權益

- AMM Swap 兩方向正式報價來自 quoteSwap，精確本次 approve 與 swap 分別確認；提供滑價、最低量、價格、Fee、Price Impact、Gas 與獨立 Fixed Exchange 合約報價比較，不自動選路。
- Add 以目前儲備比例計算另一資產 desired 上限，再完全依 Solidity 整數分支估計實際量與 LP。兩種代幣各自授權，addLiquidity 才提供流動性；不以 transfer 代替。
- Remove 按個人 LP 的 25%、50%、75%、100% 或輸入數量，估計 `floor(liquidity * reserve / supply)`；不需 LP approve，只銷毀自己的 LP，不移除永久鎖定份額。
- LP 權益為持有量／totalSupply，包含費用與捐贈。交換改變池比例，移除數量可不同於注入；無常損失是相較持有原資產的價值差異，不因尚未提領而不存在，費用不保證彌補。

## 安全、測試與待辦

重用 Wallet TransactionSession、Public Client、Token ABI 與既有交易模式。金額使用 bigint，報價／摘要 2 分鐘有效，deadline 約 10 分鐘；送出前重新讀取、模擬、估算 Gas 與核對工作階段。Receipt success、至少一個區塊、canonical block／實際交易／事件核對後更新權益；未知交易保留原身份與 Hash，禁止重送，無 Hash 可從 MetaMask 補回並核對。查詢失敗不補零。

Mock 覆蓋報價、精度、比例、LP、授權／交易、拒簽、逾時恢復、切換、防重複及桌面／320px 手機。詳細公式、狀態、限制與兩帳號人工驗收見 [Task 08C 操作指南](../17-amm-frontend.md)。固定匯率 Exchange 維持獨立；Portfolio 已於 Task 09 開放唯讀資產／LP 估值，見 [Portfolio 規格](portfolio.md)。
