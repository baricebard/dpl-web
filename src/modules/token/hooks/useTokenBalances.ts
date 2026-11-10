import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { readTokenBalances } from '../services/tokenService'
import type { TokenSnapshot } from '../types'

function createStore(address: Address | null) {
  let state: { data?: TokenSnapshot; loading: boolean; retryAt: number } = { loading: false, retryAt: 0 }
  const listeners = new Set<() => void>()
  const update = (next: typeof state) => { state = next; listeners.forEach(listener => listener()) }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refresh(afterTransaction = false) {
      if (!address || state.loading || (!afterTransaction && Date.now() < state.retryAt)) return
      update({ loading: true, retryAt: 0 })
      const data = await readTokenBalances(address)
      update({ data, loading: false, retryAt: Date.now() + 30_000 })
    },
  }
}
export function useTokenBalances(address: Address | null, chainId: number | null) {
  const store = useMemo(() => createStore(chainId === 11155111 ? address : null), [address, chainId])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => { void store.refresh() }, [store])
  return { ...state, refresh: store.refresh }
}
