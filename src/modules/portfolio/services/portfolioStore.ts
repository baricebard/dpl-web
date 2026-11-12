import type { Address } from 'viem'
import { readPortfolio } from './portfolioService'
import type { PortfolioSnapshot } from './portfolioService'

export function createPortfolioStore(address: Address | null) {
  let state: { loading: boolean; data?: PortfolioSnapshot; error?: string; retryAt: number } = { loading: false, retryAt: 0 }
  const listeners = new Set<() => void>()
  const update = (next: typeof state) => { state = next; listeners.forEach(fn => fn()) }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    async refresh() {
      if (!address || state.loading || Date.now() < state.retryAt) return
      update({ loading: true, retryAt: 0 })
      try { update({ data: await readPortfolio(address), loading: false, retryAt: Date.now() + 30_000 }) }
      catch (error) { update({ loading: false, retryAt: Date.now() + 30_000, error: error instanceof Error && error.message.includes('RPC 網路') ? error.message : '查詢失敗：無法取得 Sepolia 區塊快照，請稍後手動重試。' }) }
      setTimeout(() => { update({ ...state, retryAt: 0 }) }, 30_000)
    },
  }
}
