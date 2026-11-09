export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="DeFi Portfolio Lab 首頁">
        <span className="brand-mark" aria-hidden="true">D<span>↗</span></span>
        <span>DeFi Portfolio Lab<span className="brand-caption">LEARN. EXPLORE. UNDERSTAND.</span></span>
      </a>
      <nav aria-label="主要導覽">
        <a href="#modules">探索模組</a>
        <a href="#about">關於實驗室 <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
  )
}
