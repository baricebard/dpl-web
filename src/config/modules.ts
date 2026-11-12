// 僅描述教學規劃；不代表已啟用功能或已取得鏈上資料。
export const modules = [
  { id: 'wallet', name: 'Wallet', title: '認識你的錢包', description: '從帳號與網路開始，理解錢包如何成為進入 DeFi 的入口。', topic: '錢包連接・網路檢查' },
  { id: 'faucet', name: 'Faucet', title: '準備測試資源', description: '了解 Sepolia ETH 與教學代幣的用途，為未來實作做好準備。', topic: '測試 Gas・取得指引' },
  { id: 'token', name: 'Token', title: '探索教學代幣', description: '認識 ERC-20，學習查詢代幣餘額與理解轉帳流程。', topic: 'DPLT・DPLT-A・DPLT-B' },
  { id: 'exchange', name: 'Exchange', title: '理解資產交換', description: '透過 DPL Exchange，學習固定匯率報價、最小授權與鏈上交換。', topic: '報價・授權・交換' },
  { id: 'liquidity', name: 'Liquidity', title: '走進流動性池', description: '探索 AMM 與流動性的概念，理解資產池如何支援交換。', topic: 'AMM Swap・提供／移除流動性' },
  { id: 'portfolio', name: 'Portfolio', title: '建立投資組合觀點', description: '從資產配置到教學估值，逐步理解投資組合的組成。', topic: '資產彙整・配置觀察' },
] as const

export type ModuleId = (typeof modules)[number]['id']
export type ModuleDefinition = (typeof modules)[number]
