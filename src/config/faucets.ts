// 2026-11-10 核對官方清單與服務公開頁；未實際領幣，授課前須重新查核。
export const faucets = [
  { name: 'Sepolia PoW Faucet', url: 'https://sepolia-faucet.pk910.de/', details: '免費測試幣；需以瀏覽器運算換取，會耗時耗電。公開指引為輸入地址後開始運算；帳號、主網持幣、社群及其他資格的完整限制、額度與冷卻時間尚未確認。' },
  { name: 'Google Cloud Web3 Faucet', url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia', details: 'Sepolia 候選服務，需 Google 帳號登入。費用、主網持幣要求、社群或其他資格、額度與冷卻時間尚未確認；請教師登入查核後使用。' },
  { name: 'Alchemy Sepolia Faucet', url: 'https://www.alchemy.com/faucets/ethereum-sepolia', details: '免費發送、不需 Alchemy 帳號；公開頁列每 24 小時 0.1 ETH。需至少 0.001 主網 ETH、足夠主網交易活動，且測試幣餘額不能過高；社群或其他驗證尚未確認。不適合零主網資產新手，請勿為領測試幣購買主網資產。' },
] as const
