import { useEffect, useState } from 'react'
import { LiquidityPanel } from './LiquidityPanel'

export function LiquidityEntry() {
  const [opened, setOpened] = useState(() => window.location.hash === '#liquidity')
  useEffect(() => {
    const visit = () => { if (window.location.hash === '#liquidity') setOpened(true) }
    window.addEventListener('hashchange', visit)
    return () => window.removeEventListener('hashchange', visit)
  }, [])
  return opened ? <LiquidityPanel /> : <section id="liquidity"><a className="primary-link" href="#liquidity">開啟 AMM Swap 與流動性介面</a></section>
}
