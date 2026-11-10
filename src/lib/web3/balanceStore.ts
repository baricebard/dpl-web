import type { Address } from 'viem'
import { sepoliaRpc } from '../../config/rpc'
import { BalanceReadError, readSepoliaBalance } from './balance'
import type { BalanceSnapshot } from './balance'

export interface BalanceState {
  status: 'idle' | 'loading' | 'success' | 'error'
  data: BalanceSnapshot | null
  error: string | null
  retryAt: number
}
export function createBalanceStore(address: Address | null) {
  let state: BalanceState = { status: 'idle', data: null, error: null, retryAt: 0 }
  const listeners = new Set<() => void>()
  function update(next: BalanceState) { state = next; listeners.forEach(listener => listener()) }
  async function refresh() {
    if (!address || state.status === 'loading' || Date.now() < state.retryAt) return
    update({ status: 'loading', data: null, error: null, retryAt: 0 })
    try {
      const data = await readSepoliaBalance(address)
      update({ status: 'success', data, error: null, retryAt: Date.now() + sepoliaRpc.refreshIntervalMs })
    } catch (error) {
      update({ status: 'error', data: null, error: error instanceof BalanceReadError ? error.message : '餘額查詢失敗，請稍後重試。', retryAt: error instanceof BalanceReadError ? error.retryAt : Date.now() + sepoliaRpc.refreshIntervalMs })
    }
  }
  return { getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }, refresh }
}
