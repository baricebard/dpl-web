import { FaucetPanel } from '../../modules/faucet'
import { WalletPanel, useWallet } from '../../modules/wallet'
import { modules } from '../../config/modules'
import { teachingNetwork } from '../../config/network'
import { ModuleCard } from '../../shared/components/ModuleCard'

export function HomePage() {
  const wallet = useWallet()
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="small-square" /> A SPACE TO LEARN DEFI</p>
          <h1 id="hero-title">DeFi Portfolio <span>Lab<span className="title-period">.</span></span></h1>
          <p className="hero-subtitle">去中心化金融投資組合實驗室</p>
          <p className="hero-description">在測試網探索 DeFi 的運作原理。<br />從錢包、代幣到投資組合，讓金融概念成為可理解的學習路徑。</p>
          <a className="primary-link" href="#modules">探索學習模組 <span aria-hidden="true">↓</span></a>
        </div>
        <aside className="network-panel" aria-labelledby="network-title">
          <div className="panel-heading"><span>THE LEARNING ENVIRONMENT</span><span aria-hidden="true">↗</span></div>
          <div className="network-symbol" aria-hidden="true"><svg viewBox="0 0 100 140" fill="none"><path d="m50 8 37 61-37 23L13 69 50 8Z" /><path d="M50 8v84M13 69l37-17 37 17M13 79l37 53 37-53-37 23-37-23Z" /></svg></div>
          <p className="network-label">目標教學網路</p>
          <h2 id="network-title">{teachingNetwork.name}</h2>
          <p className="chain-id">TESTNET / CHAIN ID {teachingNetwork.chainId}</p>
          <div className="panel-footer"><span>教學測試網</span><span>{wallet.address ? (wallet.isSepolia ? '已連接 Sepolia' : '目前非 Sepolia') : '尚未連接網路'}</span></div>
        </aside>
      </section>
      <div className="education-notice">
        <span className="notice-icon" aria-hidden="true">i</span>
        <p><strong>零真實資金，專注理解。</strong>本平台僅供教學使用；Sepolia ETH 與教學代幣不具真實金融價值，不涉及主網交易或收益承諾。</p>
      </div>
      <section className="modules-section" id="modules" aria-labelledby="modules-title">
        <div className="section-heading">
          <div><p className="eyebrow">THE LEARNING MODULES</p><h2 id="modules-title">你的 DeFi 學習地圖</h2></div>
          <p>六個模組，逐步探索。<br /><span>Wallet 與 Faucet 已開放，其餘功能建置中。</span></p>
        </div>
        <div className="module-grid">{modules.map((module, index) => <ModuleCard key={module.id} module={module} index={index} />)}</div>
      </section>
      <WalletPanel />
      <FaucetPanel />
      <section className="about-section" id="about" aria-labelledby="about-title">
        <div><p className="eyebrow">BUILT FOR THE CLASSROOM</p><h2 id="about-title">從理解開始，循序實踐。</h2></div>
        <div><p>為大學區塊鏈與去中心化金融課程打造，支援課堂示範與自主學習。本階段先建立學習入口，後續依序加入經驗證的測試網功能。</p><p className="about-note">目前提供錢包連接、Sepolia ETH 餘額查詢與 Faucet 指引，尚未提供鏈上交易。</p></div>
      </section>
    </main>
  )
}
