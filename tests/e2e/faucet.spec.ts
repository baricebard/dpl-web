import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { address, secondAddress, mockWallet, emit } from '../helpers/wallet'

const rpc = 'https://ethereum-sepolia-rpc.publicnode.com/**'
function panel(page: Page) { return page.locator('#faucet') }
async function result(route: Route, value: string) {
  await route.fulfill({ json: { jsonrpc: '2.0', id: route.request().postDataJSON().id, result: value } })
}
async function setup(page: Page, balance = '0x0') {
  await mockWallet(page, { authorized: true })
  await page.route(rpc, route => result(route, route.request().postDataJSON().method === 'eth_chainId' ? '0xaa36a7' : balance))
}

test('未連接可讀指引、安全 Faucet 連結、無 RPC 與手機無水平溢出', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('publicnode')) requests.push(request.url()) })
  await page.goto('./#faucet')
  await expect(panel(page).getByText(/尚未連接錢包/)).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '重新查詢餘額' })).toBeDisabled()
  const urls = ['https://sepolia-faucet.pk910.de/', 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia', 'https://www.alchemy.com/faucets/ethereum-sepolia']
  for (const url of urls) {
    const link = panel(page).locator(`a[href="${url}"]`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect(requests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const [wei, display, exact] of [
  ['0x0', '0', '0'],
  ['0x112210f47de98115', '1.234567', '1.234567890123456789'],
  ['0x1', '< 0.000001', '0.000000000000000001'],
]) {
  test(`wei 精度與餘額 ${wei}`, async ({ page }) => {
    await setup(page, wei)
    await page.goto('./#faucet')
    await expect(panel(page).locator('.balance-value')).toHaveText(`${display} Sepolia ETH`)
    await panel(page).getByText('查看精確 ETH 餘額', { exact: true }).click()
    await expect(panel(page).getByText(`完整金額：${exact} ETH`, { exact: true })).toBeVisible()
    await expect(panel(page).locator('time')).toHaveAttribute('datetime', /T/)
    await expect(panel(page).getByRole('link', { name: '在 Sepolia Etherscan 查看地址' })).toHaveAttribute('href', `https://sepolia.etherscan.io/address/${address}`)
  })
}

test('複製地址、外部 Faucet 返回手動更新，去重且無輪詢', async ({ page }) => {
  await setup(page)
  let reads = 0
  await page.route(rpc, async route => {
    if (route.request().postDataJSON().method === 'eth_chainId') return result(route, '0xaa36a7')
    reads++
    return result(route, reads === 1 ? '0x0' : '0xde0b6b3a7640000')
  })
  await page.goto('./#faucet')
  await expect(panel(page).locator('.balance-value')).toHaveText('0 Sepolia ETH')
  const initialUpdatedAt = await panel(page).locator('time').getAttribute('datetime')
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { Object.assign(window, { faucetCopy: text }) } } }))
  await panel(page).getByRole('button', { name: '複製 Faucet 收款地址' }).click()
  await expect(panel(page).getByText('Faucet 地址已複製')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { faucetCopy: string }).faucetCopy)).toBe(address)
  // 不依外部頁面成功訊息更新；模擬離開／返回頁面焦點。
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')) })
  expect(reads).toBe(1)
  await expect(panel(page).getByRole('button', { name: '重新查詢餘額' })).toBeEnabled({ timeout: 12_000 })
  expect(reads).toBe(1)
  await expect(panel(page).locator('time')).toHaveAttribute('datetime', initialUpdatedAt!)
  await panel(page).getByRole('button', { name: '重新查詢餘額' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(panel(page).locator('.balance-value')).toHaveText('1 Sepolia ETH')
  expect(reads).toBe(2)
  const refreshedAt = await panel(page).locator('time').getAttribute('datetime')
  expect(Date.parse(refreshedAt!)).toBeGreaterThan(Date.parse(initialUpdatedAt!))
})

test('RPC 錯誤重試一次，失敗不是零', async ({ page }) => {
  await setup(page)
  let reads = 0
  await page.route(rpc, async route => {
    if (route.request().postDataJSON().method === 'eth_chainId') return result(route, '0xaa36a7')
    reads++
    await route.fulfill({ json: { jsonrpc: '2.0', id: route.request().postDataJSON().id, error: { code: -32603, message: 'Internal error' } } })
  })
  await page.goto('./#faucet')
  await expect(panel(page).getByRole('alert')).toContainText('餘額查詢失敗')
  await expect(panel(page).locator('.balance-value')).toHaveCount(0)
  expect(reads).toBe(2)
})

for (const mode of ['http', 'json'] as const) {
  test(`RPC 限流 ${mode} 不自動重試`, async ({ page }) => {
    await setup(page)
    let requests = 0
    await page.route(rpc, async route => {
      requests++
      if (mode === 'http') await route.fulfill({ status: 429, headers: { 'Retry-After': '60' }, body: 'Too many requests' })
      else await route.fulfill({ json: { jsonrpc: '2.0', id: route.request().postDataJSON().id, error: { code: -32005, message: 'Rate limit' } } })
    })
    await page.goto('./#faucet')
    await expect(panel(page).getByRole('alert')).toContainText('RPC 請求過多')
    await expect(panel(page).getByRole('button', { name: '重新查詢餘額' })).toBeDisabled()
    await expect(panel(page).locator('.balance-value')).toHaveCount(0)
    expect(requests).toBe(1)
  })
}

test('RPC 逾時最多兩次，不顯示零', async ({ page }) => {
  test.setTimeout(45_000)
  await setup(page)
  let requests = 0
  await page.route(rpc, () => { requests++ })
  await page.goto('./#faucet')
  await expect(panel(page).getByText('餘額查詢中…', { exact: true })).toBeVisible()
  await expect(panel(page).getByRole('alert')).toContainText('餘額查詢逾時', { timeout: 25_000 })
  await expect(panel(page).locator('.balance-value')).toHaveCount(0)
  expect(requests).toBe(2)
})

test('RPC 回傳其他鏈時停止讀取餘額', async ({ page }) => {
  await setup(page)
  const methods: string[] = []
  await page.route(rpc, route => { methods.push(route.request().postDataJSON().method); return result(route, '0x1') })
  await page.goto('./#faucet')
  await expect(panel(page).getByRole('alert')).toContainText('餘額查詢失敗')
  expect(methods).toEqual(['eth_chainId', 'eth_chainId'])
})

test('快速切換帳號後舊回應不覆蓋，網路切換清除資料與查詢狀態', async ({ page }) => {
  await setup(page)
  let oldRoute: Route | undefined
  await page.route(rpc, async route => {
    const request = route.request().postDataJSON()
    if (request.method === 'eth_chainId') return result(route, '0xaa36a7')
    if (request.params[0].toLowerCase() === address) { oldRoute = route; return }
    return result(route, '0x1bc16d674ec80000')
  })
  await page.goto('./#faucet')
  await expect.poll(() => !!oldRoute).toBe(true)
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).locator('.balance-value')).toHaveText('2 Sepolia ETH')
  await result(oldRoute!, '0xde0b6b3a7640000')
  await expect(panel(page).locator('.balance-value')).toHaveText('2 Sepolia ETH')
  await expect(panel(page).locator('.faucet-address')).toHaveText(secondAddress)
  await emit(page, 'chainChanged', '0x1')
  await expect(panel(page).locator('.balance-value')).toHaveCount(0)
  await expect(panel(page).locator('time')).toHaveCount(0)
  await expect(panel(page).getByRole('button', { name: '重新查詢餘額' })).toBeDisabled()
  await emit(page, 'chainChanged', '0xaa36a7')
  await expect(panel(page).locator('.balance-value')).toHaveText('2 Sepolia ETH')
  await emit(page, 'accountsChanged', [])
  await expect(panel(page).locator('.balance-value')).toHaveCount(0)
})

test('網路在查詢中切換時舊回應不可復原餘額', async ({ page }) => {
  await setup(page)
  let delayed: Route | undefined
  await page.route(rpc, route => {
    if (route.request().postDataJSON().method === 'eth_chainId') return result(route, '0xaa36a7')
    delayed = route
  })
  await page.goto('./#faucet')
  await expect.poll(() => !!delayed).toBe(true)
  await emit(page, 'chainChanged', '0x1')
  await result(delayed!, '0xde0b6b3a7640000')
  await expect(panel(page).locator('.balance-value')).toHaveCount(0)
  await expect(panel(page).getByText('餘額查詢中…', { exact: true })).toHaveCount(0)
})
