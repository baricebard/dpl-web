import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const address = '0x1111111111111111111111111111111111111111'
const secondAddress = '0x2222222222222222222222222222222222222222'
interface MockOptions { authorized?: boolean; chain?: string; connectError?: number; switchError?: number; delay?: number; legacy?: boolean }
async function mockWallet(page: Page, options: MockOptions = {}) {
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
async function emit(page: Page, event: string, value: unknown) {
  await page.evaluate(({ event, value }) => {
    (window as unknown as { walletMock: { emit(event: string, value: unknown): void } }).walletMock.emit(event, value)
  }, { event, value })
}
async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { walletMock: { calls: string[] } }).walletMock.calls)
}
async function open(page: Page) {
  await page.goto('./#wallet')
}

test('未安裝顯示官方指引，保留六張卡片', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('link', { name: 'MetaMask 官方網站安裝擴充功能' })).toHaveAttribute('href', 'https://metamask.io/download/')
  await expect(page.locator('.module-card')).toHaveCount(6)
})

test('明確點擊才連接，EIP-6963 選對 Provider、複製地址並中斷工作階段', async ({ page }) => {
  await mockWallet(page)
  await open(page)
  await expect(page.getByRole('button', { name: '連接錢包', exact: true })).toBeEnabled()
  expect(await calls(page)).not.toContain('eth_requestAccounts')
  await page.getByRole('button', { name: '連接錢包', exact: true }).click()
  await expect(page.locator('.wallet-address')).toHaveText(address)
  await expect(page.getByText('Ethereum Sepolia · Chain ID 11155111')).toBeVisible()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { Object.assign(window, { copiedAddress: text }) } } }))
  await page.getByRole('button', { name: '複製地址' }).click()
  await expect(page.getByText('地址已複製', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { copiedAddress: string }).copiedAddress)).toBe(address)
  await page.getByRole('button', { name: '中斷網站工作階段' }).click()
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(page.locator('.wallet-address')).toHaveCount(0)
  await expect(page.getByText(/不代表撤銷 MetaMask 中的網站授權/)).toBeVisible()
})

for (const [code, message] of [[4001, '已拒絕連接錢包'], [4100, '錢包尚未授權或未解鎖'], [-32002, '錢包已有請求進行中'], [4900, '錢包連線中斷']] as const) {
  test(`連接錯誤 ${code}`, async ({ page }) => {
    await mockWallet(page, { connectError: code })
    await open(page)
    await page.getByRole('button', { name: '連接錢包', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.locator('.wallet-address')).toHaveCount(0)
  })
}

test('非 Sepolia 警告，不自動切換，點擊後成功切換', async ({ page }) => {
  await mockWallet(page, { authorized: true, chain: '0x1' })
  await open(page)
  await expect(page.getByText('Ethereum Mainnet · Chain ID 1')).toBeVisible()
  await expect(page.getByText('目前不是 Sepolia，無法進行教學交易。')).toBeVisible()
  expect(await calls(page)).not.toContain('wallet_switchEthereumChain')
  await page.getByRole('button', { name: '切換至 Sepolia' }).click()
  await expect(page.getByText('Ethereum Sepolia · Chain ID 11155111')).toBeVisible()
})

for (const [code, message] of [[4001, '已拒絕切換網路'], [4902, 'MetaMask 尚未啟用 Sepolia'], [-32603, '切換 Sepolia 失敗']] as const) {
  test(`切換失敗 ${code} 保留原網路`, async ({ page }) => {
    await mockWallet(page, { authorized: true, chain: '0x1', switchError: code })
    await open(page)
    await page.getByRole('button', { name: '切換至 Sepolia' }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByText('Ethereum Mainnet · Chain ID 1')).toBeVisible()
    expect(await calls(page)).not.toContain('wallet_addEthereumChain')
  })
}

test('帳號、網路、空帳號及 disconnect 事件立即更新', async ({ page }) => {
  await mockWallet(page, { authorized: true })
  await open(page)
  await expect(page.locator('.wallet-address')).toHaveText(address)
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(page.locator('.wallet-address')).toHaveText(secondAddress)
  await emit(page, 'chainChanged', '0x1')
  await expect(page.getByText('Ethereum Mainnet · Chain ID 1')).toBeVisible()
  await emit(page, 'chainChanged', 'invalid')
  await expect(page.getByText('其他／未知網路 · Chain ID 未知')).toBeVisible()
  await emit(page, 'accountsChanged', [])
  await expect(page.locator('.wallet-address')).toHaveCount(0)
  await emit(page, 'disconnect', { code: 4900 })
  await expect(page.getByRole('alert')).toContainText('錢包連線中斷')
})

test('重複點擊只發出一次連接，結束工作階段後忽略延遲結果', async ({ page }) => {
  await mockWallet(page, { delay: 500 })
  await open(page)
  await page.getByRole('button', { name: '連接錢包', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByRole('button', { name: '連接錢包', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '中斷網站工作階段' }).click()
  await expect.poll(async () => (await calls(page)).filter(method => method === 'eth_accounts').length).toBeGreaterThan(1)
  await expect(page.locator('.wallet-address')).toHaveCount(0)
  expect((await calls(page)).filter(method => method === 'eth_requestAccounts')).toHaveLength(1)
})

test('重新載入只讀既有授權，支援單一 legacy MetaMask', async ({ page }) => {
  await mockWallet(page, { authorized: true, legacy: true })
  await open(page)
  await expect(page.locator('.wallet-address')).toHaveText(address)
  await page.reload()
  await expect(page.locator('.wallet-address')).toHaveText(address)
  expect(await calls(page)).not.toContain('eth_requestAccounts')
})
