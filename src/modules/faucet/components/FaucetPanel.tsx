import { LearningIntro, LearningOutro } from '../../../shared/components/LearningJourney'
import { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { faucets } from '../../../config/faucets'
import { displayEther, sepoliaAddressUrl } from '../../../lib/web3/display'
import { useWallet } from '../../wallet'
import { useFaucetBalance } from '../hooks/useFaucetBalance'

export function FaucetPanel() {
  const wallet = useWallet()
  const balance = useFaucetBalance()
  const [copyResult, setCopyResult] = useState<{ address: string; message: string } | null>(null)
  const [now, setNow] = useState(0)
  // 僅倒數按鈕冷卻，不進行 RPC 輪詢。
  useEffect(() => {
    if (balance.retryAt === 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, balance.retryAt - Date.now()) + 10)
    return () => window.clearTimeout(timer)
  }, [balance.retryAt])
  const explorerUrl = sepoliaAddressUrl(wallet.address)
  const ready = !!wallet.address && wallet.isSepolia && wallet.connectionStatus === 'connected'
  const cooling = balance.retryAt > now
  async function copy() {
    const address = wallet.address
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopyResult({ address, message: 'Faucet 地址已複製' })
    } catch { setCopyResult({ address, message: '複製失敗，請手動選取上方地址。' }) }
  }
  return <section id="faucet" className="wallet-panel faucet-panel" aria-labelledby="faucet-panel-title">
    <p className="eyebrow">FAUCET / TEST ETH</p>
    <h2 id="faucet-panel-title">準備你的 Sepolia ETH</h2>
    <LearningIntro moduleId="faucet" />
    <p>連接錢包 → 查詢餘額 → 前往外部 Faucet → 返回更新餘額。只使用測試網資產，網站不要求私鑰、助記詞或簽名。</p>
    <div className="faucet-grid">
      <div className="faucet-step">
        <h3>1. 領取前準備</h3>
        <p>收款網路：Ethereum Sepolia<br />Chain ID：11155111</p>
        {!wallet.address ? <p>尚未連接錢包。請先到 <a href="#wallet">Wallet 連接錢包</a>，再回來查詢餘額。</p> : <>
          <p>目前錢包地址</p><p className="faucet-address">{wallet.address}</p>
          <button className="wallet-button secondary" onClick={() => void copy()}>複製 Faucet 收款地址</button>
          <p role="status">{copyResult?.address === wallet.address ? copyResult.message : ''}</p>
          {!wallet.isSepolia && <p className="wallet-warning">目前錢包不是 Sepolia，已清除餘額。請到 <a href="#wallet">Wallet 切換網路</a>。</p>}
          {explorerUrl && <p><a href={explorerUrl} target="_blank" rel="noopener noreferrer">在 Sepolia Etherscan 查看地址</a></p>}
        </>}
        <p className="balance-label">Ethereum Sepolia Test ETH 餘額</p>
        <div aria-live="polite" aria-busy={balance.status === 'loading'}>
          {ready && balance.status === 'loading' && <p>餘額查詢中…</p>}
          {ready && balance.data && <><p className="balance-value">{displayEther(balance.data.wei)} <span>Sepolia ETH</span></p><details><summary>查看精確 ETH 餘額</summary><p>完整金額：{formatEther(balance.data.wei)} ETH</p></details><p>最後更新：<time dateTime={new Date(balance.data.updatedAt).toISOString()}>{new Date(balance.data.updatedAt).toLocaleString('zh-TW')}</time></p></>}
          {ready && balance.error && <p role="alert" className="wallet-warning">{balance.error}</p>}
          {!ready && <p>尚無可顯示的 Sepolia 餘額。</p>}
        </div>
        <button className="wallet-button" disabled={!ready || balance.status === 'loading' || cooling} onClick={() => void balance.refresh()}>{balance.status === 'loading' ? '查詢中…' : '重新查詢餘額'}</button>
        {cooling && <p>為避免頻繁請求，請於 {new Date(balance.retryAt).toLocaleTimeString('zh-TW')} 後再查詢。</p>}
        <p className="wallet-note">RPC 實際連線與 CORS 尚未驗證。查詢失敗不代表餘額為零；目前沒有自動備援。</p>
      </div>
      <div className="faucet-step">
        <h3>2. 選擇外部 Faucet</h3>
        <p>以下為經公開頁查核的候選服務，尚未實際領幣，也未確認有適合所有學生的服務。資料核對：2026-11-10。</p>
        <p>來源：<a href="https://ethereum.org/developers/docs/networks/" target="_blank" rel="noopener noreferrer">Ethereum 官方 Sepolia Faucet 清單</a>。</p>
        <ul className="faucet-list">{faucets.map(faucet => <li key={faucet.name}><a href={faucet.url} target="_blank" rel="noopener noreferrer">{faucet.name} ↗</a><p>{faucet.details}</p></li>)}</ul>
        <p className="wallet-note">教師請於課前以全新測試地址確認資格與供給，提前準備全班 Gas。資格不足或服務故障時，由教師依課前核對流程分發測試 ETH；本網站不代為轉帳。</p>
      </div>
    </div>
    <div className="faucet-step"><h3>3. 返回並確認餘額</h3><p>複製地址 → 在外部服務確認 Ethereum Sepolia 並依規則領取 → 返回本頁點「重新查詢餘額」。外部頁面顯示成功不等於鏈上入帳；以最新查詢與 Sepolia Etherscan 結果確認，尚未入帳時稍後再查。</p></div>
    <aside className="gas-guide" aria-labelledby="gas-title"><h3 id="gas-title">Gas Fee 是什麼？</h3>
      <p>Gas 是執行區塊鏈操作所需的計算工作量；Gas Fee 是支付這些工作與網路資源的費用，也用來降低垃圾交易。費用會隨操作與網路狀況改變，沒有固定價格。</p>
      <p>Ethereum Sepolia 使用原生的 Sepolia ETH 支付 Gas。它不具有主網 ETH 的實際金融價值，請勿購買測試幣。</p>
      <p>DPLT 等 ERC-20 教學代幣是合約管理的資產，不是 Gas Token。即使只轉帳 DPLT，也需要 Sepolia ETH 支付 Gas；持有 DPLT 不能代替 Gas。</p>
      <p>本頁查詢餘額一般不需要支付鏈上 Gas，因為只是讀取資料，沒有送出交易。教學代幣由教師透過一般 transfer 分發，網站不提供公開 Mint 或自助領取。</p>
    </aside>
    <LearningOutro moduleId="faucet" />
  </section>
}
