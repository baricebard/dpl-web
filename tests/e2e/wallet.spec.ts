import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { address, secondAddress, mockWallet, emit, calls } from '../helpers/wallet'

test.beforeEach(async ({ page }) => {
  await page.route('https://ethereum-sepolia-rpc.publicnode.com/**', route => {
    const request = route.request().postDataJSON()
    return route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result: request.method === 'eth_chainId' ? '0xaa36a7' : '0x0' } })
  })
})

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
