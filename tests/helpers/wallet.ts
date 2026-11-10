import type { Page } from '@playwright/test'

export const address = '0x1111111111111111111111111111111111111111'
export const secondAddress = '0x2222222222222222222222222222222222222222'
interface MockOptions { authorized?: boolean; chain?: string; connectError?: number; switchError?: number; delay?: number; legacy?: boolean }
export async function mockWallet(page: Page, options: MockOptions = {}) {
  await page.addInitScript(({ options, address }) => {
    const listeners = new Map<string, Set<(value: unknown) => void>>()
    let accounts = options.authorized ? [address] : []
    let chain = options.chain ?? '0xaa36a7'
    const calls: string[] = []
    const emit = (event: string, value: unknown) => {
      if (event === 'accountsChanged') accounts = value as string[]
      if (event === 'chainChanged') chain = value as string
      listeners.get(event)?.forEach(listener => listener(value))
    }
    const provider = {
      isMetaMask: true,
      async request({ method }: { method: string }) {
        calls.push(method)
        if (method === 'eth_accounts') return accounts
        if (method === 'eth_chainId') return chain
        if (method === 'eth_requestAccounts') {
          await new Promise(resolve => setTimeout(resolve, options.delay ?? 0))
          if (options.connectError) throw { code: options.connectError }
          accounts = [address]
          return accounts
        }
        if (method === 'wallet_switchEthereumChain') {
          if (options.switchError) throw { code: options.switchError }
          chain = '0xaa36a7'
          emit('chainChanged', chain)
          return null
        }
        throw new Error('Unexpected RPC: ' + method)
      },
      on(event: string, listener: (value: unknown) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(listener)
      },
      removeListener(event: string, listener: (value: unknown) => void) { listeners.get(event)?.delete(listener) },
    }
    Object.assign(window, { walletMock: { emit, calls, count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) } })
    if (options.legacy) Object.assign(window, { ethereum: provider })
    else {
      // An unrelated injected wallet must never be selected over announced MetaMask.
      Object.assign(window, { ethereum: { isMetaMask: true, request: () => { throw new Error('Wrong provider selected') } } })
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'com.other' }, provider: { request: () => { throw new Error('Wrong announcement selected') } } } }))
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.metamask' }, provider } }))
      })
    }
  }, { options, address })
}
export async function emit(page: Page, event: string, value: unknown) {
  await page.evaluate(({ event, value }) => {
    (window as unknown as { walletMock: { emit(event: string, value: unknown): void } }).walletMock.emit(event, value)
  }, { event, value })
}
export async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { walletMock: { calls: string[] } }).walletMock.calls)
}
