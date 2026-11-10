import { useEffect, useState } from 'react'
import { TokenPanel } from './TokenPanel'

// 首次開啟入口才讀取 ERC-20；離開入口仍保留已廣播交易供追蹤。
export function TokenEntry() {
  const [opened, setOpened] = useState(() => window.location.hash === '#token')
  useEffect(() => {
    const visit = () => { if (window.location.hash === '#token') setOpened(true) }
    window.addEventListener('hashchange', visit)
    return () => window.removeEventListener('hashchange', visit)
  }, [])
  return opened ? <TokenPanel /> : <section id="token"><a className="primary-link" href="#token">開啟 Token 教材與轉帳介面</a></section>
}
