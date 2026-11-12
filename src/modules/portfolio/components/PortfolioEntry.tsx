import { useEffect, useState } from 'react'
import { PortfolioPanel } from './PortfolioPanel'

export function PortfolioEntry() {
  const [opened, setOpened] = useState(() => window.location.hash === '#portfolio')
  useEffect(() => {
    const visit = () => { if (window.location.hash === '#portfolio') setOpened(true) }
    window.addEventListener('hashchange', visit)
    return () => window.removeEventListener('hashchange', visit)
  }, [])
  return opened ? <PortfolioPanel /> : <section id="portfolio"><a className="primary-link" href="#portfolio">開啟投資組合 Dashboard</a></section>
}
