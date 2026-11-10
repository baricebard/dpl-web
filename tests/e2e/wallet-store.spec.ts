import { expect, test } from '@playwright/test'
import { createWalletStore } from '../../src/modules/wallet/providers/walletStore'
import type { WalletProvider } from '../../src/lib/web3/provider'

function mock() {
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  let chain = '0xaa36a7'
  const provider: WalletProvider = {
    request: async ({ method }) => method === 'eth_chainId' ? chain : ['0x1111111111111111111111111111111111111111'],
    on(event: string, listener: (value: never) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener as (value: unknown) => void)
    },
    removeListener(event: string, listener: (value: never) => void) { listeners.get(event)?.delete(listener as (value: unknown) => void) },
  }
  return { provider, count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0), emit(event: string, value: unknown) {
    if (event === 'chainChanged') chain = value as string
    listeners.get(event)?.forEach(listener => listener(value))
  } }
}

test('統一 API 的 canTransact 與生命週期：錯鏈、事件、取消訂閱、卸載與重掛', async () => {
  const wallet = createWalletStore()
  const provider = mock()
  let notifications = 0
  const unsubscribe = wallet.subscribe(() => { notifications++ })
  wallet.attach(provider.provider)
  await expect.poll(() => wallet.getSnapshot().canTransact).toBe(true)
  expect(provider.count()).toBe(3)
  provider.emit('chainChanged', '0x1')
  expect(wallet.getSnapshot().canTransact).toBe(false)
  provider.emit('chainChanged', '0xaa36a7')
  expect(wallet.getSnapshot().canTransact).toBe(true)
  provider.emit('accountsChanged', [])
  expect(wallet.getSnapshot().canTransact).toBe(false)
  unsubscribe()
  const before = notifications
  wallet.disconnect()
  expect(notifications).toBe(before)
  wallet.destroy()
  expect(provider.count()).toBe(0)
  wallet.attach(provider.provider)
  expect(provider.count()).toBe(3)
  wallet.attach(provider.provider)
  expect(provider.count()).toBe(3)
  wallet.destroy()
  expect(provider.count()).toBe(0)
  expect(wallet.getSnapshot().canTransact).toBe(false)
})

test('交易工作階段在 A → B → A 或網路切回後仍失效', async () => {
  const wallet = createWalletStore()
  const provider = mock()
  expect(() => wallet.captureTransactionSession()).toThrow()
  wallet.attach(provider.provider)
  await expect.poll(() => wallet.getSnapshot().canTransact).toBe(true)
  const session = wallet.captureTransactionSession()
  expect(session.isCurrent()).toBe(true)
  provider.emit('accountsChanged', ['0x2222222222222222222222222222222222222222'])
  provider.emit('accountsChanged', ['0x1111111111111111111111111111111111111111'])
  expect(session.isCurrent()).toBe(false)
  const second = wallet.captureTransactionSession()
  provider.emit('chainChanged', '0x1')
  provider.emit('chainChanged', '0xaa36a7')
  expect(second.isCurrent()).toBe(false)
  const third = wallet.captureTransactionSession()
  wallet.disconnect()
  expect(third.isCurrent()).toBe(false)
  wallet.destroy()
})
