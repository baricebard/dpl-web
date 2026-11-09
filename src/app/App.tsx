import { WalletProvider } from '../modules/wallet'
import { HomePage } from './pages/HomePage'
import { SiteHeader } from '../shared/components/SiteHeader'

export function App() {
  return (
    <WalletProvider><div className="site-shell" id="top">
      <a className="skip-link" href="#main">跳至主要內容</a>
      <SiteHeader />
      <HomePage />
      <footer className="site-footer">
        <span>DeFi Portfolio Lab</span>
        <span>為學習而建構 · 僅限測試網教學</span>
        <a href="#top">回到頂端 ↑</a>
      </footer>
    </div></WalletProvider>
  )
}
