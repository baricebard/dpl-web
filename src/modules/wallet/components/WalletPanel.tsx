import { LearningIntro, LearningOutro } from '../../../shared/components/LearningJourney'
import { useState } from 'react'
import { useWallet } from '../hooks/useWallet'

export function WalletPanel() {
  const wallet = useWallet()
  const [copyResult, setCopyResult] = useState<{ address: string; message: string } | null>(null)
  const networkName = wallet.chainId === 11155111 ? 'Ethereum Sepolia' : wallet.chainId === 1 ? 'Ethereum Mainnet' : '其他／未知網路'
  async function copy() {
    if (!wallet.address) return
    const address = wallet.address
    try {
      await navigator.clipboard.writeText(address)
      setCopyResult({ address, message: '地址已複製' })
    } catch {
      setCopyResult({ address, message: '複製失敗，請手動選取地址複製。' })
    }
  }
  return (
    <section id="wallet" className="wallet-panel" aria-labelledby="wallet-panel-title">
      <p className="eyebrow">WALLET / METAMASK</p>
      <h2 id="wallet-panel-title">連接你的錢包</h2>
    <LearningIntro moduleId="wallet" />
      <p>使用 MetaMask 瀏覽器擴充功能。錢包連接不代表學生身分認證；地址與鏈上活動公開可查。</p>
      {wallet.connectionStatus === 'unavailable' ? <p>尚未偵測到 MetaMask。請至 <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">MetaMask 官方網站安裝擴充功能</a>，安裝並解鎖後重新整理。手機跨 App 與 WalletConnect 尚未支援。</p> : <>
        <p role="status">{wallet.connectionStatus === 'connecting' ? '連接中，請在 MetaMask 確認或解鎖…' : wallet.address ? '錢包已連接' : '尚未連接錢包；請先解鎖 MetaMask。'}</p>
        {!wallet.address && <button className="wallet-button" disabled={wallet.isBusy} onClick={() => void wallet.connect()}>連接錢包</button>}
      </>}
      {wallet.address && <>
        <dl><dt>錢包地址</dt><dd className="wallet-address">{wallet.address}</dd><dt>目前網路</dt><dd>{networkName} · Chain ID {wallet.chainId ?? '未知'}</dd></dl>
        <button className="wallet-button secondary" onClick={() => void copy()}>複製地址</button>
        <p role="status">{copyResult?.address === wallet.address ? copyResult.message : ''}</p>
        <p className={wallet.isSepolia ? 'wallet-ready' : 'wallet-warning'}>{wallet.isSepolia ? '已在 Sepolia 測試網路；可前往下一單元準備測試資源。' : '目前不是 Sepolia，無法進行教學交易。'}</p>
        {!wallet.isSepolia && <button className="wallet-button" disabled={wallet.isBusy} onClick={() => void wallet.switchToSepolia()}>{wallet.isBusy ? '請在 MetaMask 確認…' : '切換至 Sepolia'}</button>}
      </>}
      {wallet.error && <p role="alert" className="wallet-warning">{wallet.error}</p>}
      {(wallet.address || wallet.isBusy) && <button className="wallet-button secondary" onClick={wallet.disconnect}>中斷網站工作階段</button>}
      <p className="wallet-note">中斷工作階段只清除本頁連線狀態，不代表撤銷 MetaMask 中的網站授權。若要撤銷，請至 MetaMask 的網站連線權限管理；重新整理可能恢復既有授權。</p>
    <LearningOutro moduleId="wallet" />
  </section>
  )
}
