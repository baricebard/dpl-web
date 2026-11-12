import { useEffect, useState } from 'react'
import { ExchangePanel } from './ExchangePanel'

export function ExchangeEntry() {
  const [opened, setOpened] = useState(() => window.location.hash === '#exchange')
  useEffect(() => {
    const visit = () => { if (window.location.hash === '#exchange') setOpened(true) }
    window.addEventListener('hashchange', visit)
    return () => window.removeEventListener('hashchange', visit)
  }, [])
  return opened ? <ExchangePanel /> : <section id="exchange"><a className="primary-link" href="#exchange">開啟 DPL Exchange 教材與交換介面</a></section>
}
