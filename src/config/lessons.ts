import type { ModuleId } from './modules'

type Lesson = { goal: string; task: string; steps: string[]; result: string; takeaways: string[] }
export const lessons: Record<ModuleId, Lesson> = {
  wallet: {
    goal: '認識區塊鏈帳號，以及錢包如何管理簽署權限。公開地址可收款，私鑰與助記詞必須保密。',
    task: '連接 MetaMask、核對公開地址，並確認 Ethereum Sepolia 測試網。',
    steps: ['由官方安裝 MetaMask 擴充功能，建立測試用錢包；不要分享私鑰或助記詞。', '按「連接錢包」，在 MetaMask 選擇帳號並確認網站連線權限。', '核對公開地址與網路；若不是 Sepolia，按切換並在 MetaMask 確認。'],
    result: '應看到目前地址與「已在 Sepolia」提示。這只代表連線與網路狀態，不代表資產已轉出。',
    takeaways: ['資產狀態記錄在區塊鏈上；錢包管理金鑰及簽署，不是傳統資產帳戶資料庫。', '公開地址可分享用於收款；私鑰與助記詞能控制資產，絕不提供給網站。', '連接網站不等於授權資產轉出，之後每筆操作仍需核對並確認。'],
  },
  faucet: {
    goal: '理解 Sepolia ETH 如何支付 Gas，以及測試資源與教學 ERC-20 的差別。',
    task: '閱讀外部 Faucet 規則，取得測試資源後返回查詢餘額。',
    steps: ['核對 Wallet 地址與 Sepolia，查看目前 ETH 餘額。', '複製公開地址，依外部 Faucet 的資格及規則領取；本平台不代領或發幣。', '返回按「重新查詢餘額」，依更新時間及 Etherscan 核對；未入帳時稍候或請教師協助。'],
    result: '應以最新查詢確認 ETH 餘額。外部領取訊息不代表已入帳，也不保證即時成功；DPLT 等代幣另由教師分發。',
    takeaways: ['Gas 是鏈上計算與網路資源費用，以 Sepolia ETH 支付。', 'DPLT、DPLT-A、DPLT-B 是 ERC-20，不能代替 Sepolia ETH 支付 Gas。', 'Faucet 是取得測試資源的方法，不是挖礦或投資收益；不要購買測試幣。'],
  },
  token: {
    goal: '認識 ERC-20 代幣的名稱、符號與數量，連結轉帳、Gas 及區塊確認。',
    task: '查詢三種代幣餘額，向核對過的同學地址轉帳，並判讀交易結果。',
    steps: ['查看餘額與查詢時間；選擇代幣、填寫收款公開地址及數量。', '按「檢查轉帳摘要」，核對收款人、數量、網路及預估 Gas。transfer 不需要 approve。', '按「確認並開啟 MetaMask」，親自核准；等待結果，再比較餘額並查看 Etherscan。'],
    result: '應在交易結果確認轉帳成功，再查看更新後餘額。Transaction Hash 只是交易識別；Receipt 是執行收據，區塊確認仍不等於最終確定性。',
    takeaways: ['名稱與符號方便辨識，合約地址才用來識別代幣。', '三種代幣皆為 18 decimals：1 枚 = 10 的 18 次方個最小單位，不表示必須轉整數枚。', '轉帳會改變收付款地址餘額並消耗 Gas；查詢餘額不需鏈上 Gas。'],
  },
  exchange: {
    goal: '以固定匯率模擬換匯，理解 ERC-20 approve 與 swap 是不同交易。',
    task: '取得報價、按需授權，再獨立確認交換並比較交換前後的資產。',
    steps: ['選擇支付／取得代幣與數量，查看餘額，再查詢合約報價。', '授權不足時檢查授權摘要，核對使用代幣的 Exchange 與本次額度，在 MetaMask 確認 approve。', '授權確認後另行檢查交換摘要並確認 swap；等待交換結果與餘額更新。'],
    result: '授權成功只更新可使用額度。應在 Swap 結果確認實際收到量，再比較支付代幣減少與取得代幣增加；兩筆交易各需 Gas。',
    takeaways: ['DPLT 模擬 USD、DPLT-A 模擬 TWD、DPLT-B 模擬 CNY，沒有真實貨幣價值。', '固定匯率：1 DPLT = 30 DPLT-A；1 DPLT-B = 4.5 DPLT-A，不是真實行情。', 'approve 允許合約使用指定代幣額度；swap 才執行交換，授權不等於交換。'],
  },
  liquidity: {
    goal: '從固定匯率走向 AMM，理解池中資產比例、流動性與 LP 權益。',
    task: '比較 AMM 報價，觀察提供兩種資產取得 DPL-LP，以及銷毀 LP 取回底層資產。',
    steps: ['選擇交換、提供或移除流動性，輸入數量及滑價容忍度，查看報價／估算。', '核對最低收到量、Price Impact、0.3% 費率與 Gas。提供流動性需依池比例投入兩種資產，可能需兩筆 approve。', '授權後另行確認 swap／addLiquidity；移除自己的 LP 無需 LP approve。等待 Receipt，核對實際資產與 LP 變化。'],
    result: '以已確認的交易事件及重新查詢的餘額為準。Add 成功才取得 DPL-LP；Remove 成功才銷毀自己的 LP 並取回兩種資產。估算與授權都不是注資成功。',
    takeaways: ['常數乘積 x*y=k 描述 AMM 曲線；池中資產比例決定即時價格，費用留池可使 k 增加，價格不固定為 1:30。', '0.3% 輸入費留池。Price Impact 是交易造成的價格影響；Slippage Tolerance 是允許成交相對報價的不利偏差。', 'DPL-LP 代表底層資產份額。相對價格變化會造成無常損失，移除所得可能不同於投入；費用不保證彌補風險。'],
  },
  portfolio: {
    goal: '以統一的 DPLT 教學估值單位，解讀目前持倉、LP 底層權益與配置百分比。',
    task: '唯讀觀察三種 ERC-20、LP 份額、教學總估值及固定參考價與 AMM 現貨價的差異。',
    steps: ['連接 Sepolia 帳號後查看三種代幣數量、LP 底層資產及最後更新時間。', '比較五類配置百分比；LP 先拆解為底層 DPLT／DPLT-A，面額不再加總。', '比較固定參考價與 AMM 現貨價；操作後可手動重新整理，冷卻 30 秒，無需 MetaMask 交易確認。'],
    result: '應看到同一區塊快照的持倉、配置與 DPLT 教學總額；資料失敗時顯示不可計算，不當作資產歸零。此頁不會發送交易。',
    takeaways: ['DPLT、DPLT-A、DPLT-B 以固定參考價 1、1/30、3/20 DPLT 估值，不是真實金融市場價值。', 'LP 是底層資產權益，拆解後不再重複加上 LP 面額；Sepolia ETH 另列作 Gas。', '配置百分比描述本次快照。AMM 現貨價來自池比例，只供比較，不影響固定教學估值，也不是歷史績效。'],
  },
}
