import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { decodeFunctionData, encodeFunctionResult, numberToHex } from 'viem'
import { amm, ammAbi } from '../../src/config/amm'
import { teachingTokenAbi, tokens } from '../../src/config/tokens'
import { address, secondAddress, mockWallet, emit, calls } from '../helpers/wallet'
const unit = 10n ** 18n
const panel = (page: Page) => page.locator('#portfolio')
async function setup(page: Page) {
  await mockWallet(page, { authorized: true })
  const state = { balances: [10n * unit, 300n * unit, 20n * unit], lp: 5n * unit, supply: 50n * unit, reserves: [100n * unit, 3000n * unit], failure: false, failMethod: '', delay: 0, blocks: [] as string[], count: 0 }
  await page.route('https://ethereum-sepolia-rpc.publicnode.com/**', async route => {
    const req = route.request().postDataJSON()
    state.count++
    const respond = (result: unknown) => route.fulfill({ json: { jsonrpc: '2.0', id: req.id, result } })
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay))
    if (state.failure) return route.fulfill({ json: { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'Mock RPC unavailable' } } })
    if (req.method === 'eth_chainId') return respond('0xaa36a7')
    if (req.method === 'eth_blockNumber') return respond('0x64')
    if (req.method === 'eth_getBalance') { state.blocks.push(req.params[1]); return respond(numberToHex(9n * unit)) }
    if (req.method === 'eth_call') {
      const pool = req.params[0].to.toLowerCase() === amm.address.toLowerCase()
      const abi = pool ? ammAbi : teachingTokenAbi
      const { functionName, args } = decodeFunctionData({ abi, data: req.params[0].data })
      if (req.params[1] === '0x64') state.blocks.push(req.params[1])
      const different = String(args?.[0]).toLowerCase() === secondAddress.toLowerCase()
      if (functionName === state.failMethod) return route.fulfill({ json: { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'Mock method failure' } } })
      let result: unknown
      if (functionName === 'getReserves') result = state.reserves
      else if (functionName === 'totalSupply') result = state.supply
      else if (functionName === 'balanceOf') result = different ? 0n : pool ? state.lp : state.balances[tokens.findIndex(t => t.address.toLowerCase() === req.params[0].to.toLowerCase())]
      else throw new Error('Unexpected method ' + functionName)
      return respond(encodeFunctionResult({ abi, functionName, result } as Parameters<typeof encodeFunctionResult>[0]))
    }
    throw new Error('Unexpected RPC ' + req.method)
  })
  return state
}
test('Dashboard 餘額、估值、LP、配置、ETH、桌面及 320px、無交易', async ({ page }, info) => {
  const state = await setup(page); await page.goto('./#portfolio')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('43 DPLT')
  await expect(panel(page).getByTestId('portfolio-token-1')).toContainText('教學參考價：1/30 DPLT')
  await expect(panel(page).getByTestId('portfolio-token-2')).toContainText('DPLT 等值：3')
  await expect(panel(page).getByTestId('portfolio-lp')).toContainText('池中份額：10.00%')
  await expect(panel(page).getByTestId('portfolio-lp')).toContainText('LP 教學估值：20 DPLT')
  await expect(panel(page)).toContainText('資產配置（底層合計）：46.51%')
  await expect(panel(page).getByTestId('portfolio-allocation')).toContainText('錢包 DPLT：23.25%')
  await expect(panel(page).getByTestId('portfolio-eth')).toHaveText('9 Sepolia ETH')
  await expect(panel(page).getByTestId('portfolio-spot')).toContainText('1 DPLT = 30 DPLT-A')
  expect(state.blocks.filter(b => b === '0x64').length).toBeGreaterThanOrEqual(7)
  await panel(page).screenshot({ path: `/tmp/dpl-portfolio-${info.project.name}.png` })
  await page.setViewportSize({ width: 320, height: 850 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel(page).screenshot({ path: `/tmp/dpl-portfolio-320-${info.project.name}.png` })
  await panel(page).getByText('精確鏈上數值與捨入方式').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await calls(page)).every(c => !/sendTransaction|sign|requestAccounts/.test(c))).toBe(true)
})
test('手動刷新變更現價、清除舊資料、失敗不偽造資產下降', async ({ page }) => {
  await page.clock.install(); const state = await setup(page); await page.goto('./#portfolio')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('43 DPLT')
  const count = state.count
  await expect(panel(page).getByRole('button', { name: '手動重新整理' })).toBeDisabled()
  await page.clock.fastForward(29_000)
  expect(state.count).toBe(count)
  state.reserves = [100n * unit, 3300n * unit]
  await page.clock.fastForward(2_000)
  await panel(page).getByRole('button', { name: '手動重新整理' }).click()
  await expect(panel(page).getByTestId('portfolio-spot')).toContainText('+10.00%')
  state.failure = true
  await page.clock.fastForward(31_000)
  await panel(page).getByRole('button', { name: '手動重新整理' }).click()
  await expect(panel(page).getByRole('alert')).toContainText('查詢失敗')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('不可計算 DPLT')
  await expect(panel(page)).toContainText('尚無成功快照')
})
test('切帳號立即清空、慢舊請求不可覆蓋、錯網路清空', async ({ page }) => {
  const state = await setup(page); await page.goto('./#portfolio')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('43 DPLT')
  state.delay = 150
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('不可計算 DPLT')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('0 DPLT')
  await emit(page, 'accountsChanged', [address])
  await emit(page, 'chainChanged', '0x1')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('不可計算 DPLT')
  await expect(panel(page).getByRole('button', { name: '手動重新整理' })).toBeDisabled()
  await expect(panel(page)).toContainText('舊網路資料已清除')
})
test('全零空池及極小持倉顯示', async ({ page }) => {
  await page.clock.install(); const state = await setup(page)
  state.balances = [0n, 0n, 0n]; state.lp = 0n; state.supply = 0n; state.reserves = [0n, 0n]
  await page.goto('./#portfolio')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('0 DPLT')
  await expect(panel(page).getByTestId('portfolio-token-0')).toContainText('數量：0')
  await expect(panel(page).getByTestId('portfolio-lp')).toContainText('LP 教學估值：0 DPLT')
  await expect(panel(page).getByTestId('portfolio-spot')).toContainText('不可計算')
  state.balances = [0n, 1n, 0n]
  await page.clock.fastForward(31_000); await panel(page).getByRole('button', { name: '手動重新整理' }).click()
  await expect(panel(page).getByTestId('portfolio-token-1')).toContainText('DPLT 等值：< 0.000000000000000001')
  await expect(panel(page).getByTestId('portfolio-total')).toContainText('< 0.000000000000000001')
})

for (const mode of ['totalSupply', 'getReserves'] as const) test(`部分 ${mode} 查詢失敗不補零`, async ({ page }) => {
  const state = await setup(page); state.failMethod = mode
  await page.goto('./#portfolio')
  await expect(panel(page).getByRole('alert')).toContainText('查詢失敗')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('不可計算 DPLT')
  await expect(panel(page).getByTestId('portfolio-token-0')).toContainText('數量：10')
  await expect(panel(page).getByTestId('portfolio-lp')).toContainText('不可計算')
})
test('更新中舊帳號的慢回應不覆蓋新帳號', async ({ page }) => {
  await page.clock.install(); const state = await setup(page); await page.goto('./#portfolio')
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('43 DPLT')
  state.delay = 250
  await page.clock.fastForward(31_000)
  await panel(page).getByRole('button', { name: '手動重新整理' }).click()
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).getByTestId('portfolio-total')).toHaveText('0 DPLT')
  await expect(panel(page)).toContainText(secondAddress)
})
