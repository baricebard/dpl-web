import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { createBalanceStore } from '../../lib/web3/balanceStore'

// 可供 Token 等模組重用；不依賴 Wallet 內部，address／chainId 改變即換 store。
export function useSepoliaBalance(address: Address | null, chainId: number | null) {
  const store = useMemo(() => createBalanceStore(chainId === 11155111 ? address : null), [address, chainId])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => { void store.refresh() }, [store])
  return { ...state, refresh: store.refresh }
}
