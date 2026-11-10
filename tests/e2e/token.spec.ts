import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, numberToHex } from 'viem'
import { teachingTokenAbi, tokens, tokenSupply } from '../../src/config/tokens'
import { mockWallet, emit, address, secondAddress, calls } from '../helpers/wallet'

const rpc = 'https://ethereum-sepolia-rpc.publicnode.com/**'
const panel = (page: Page) => page.locator('#token')
async function setup(page: Page, options: { balance?: string; failure?: boolean; zeroGas?: boolean; sendHash?: string; sendError?: number } = {}) {
  await mockWallet(page, { authorized: true, sendHash: options.sendHash, sendError: options.sendError })
  await page.route(rpc, async route => {
    const req = route.request().postDataJSON()
    const respond = (result: unknown) => route.fulfill({ json: { jsonrpc: '2.0', id: req.id, result } })
    if (req.method === 'eth_chainId') return respond('0xaa36a7')
    if (req.method === 'eth_getBalance') return respond(options.zeroGas ? '0x0' : numberToHex(10n ** 18n))
    if (options.failure) return route.fulfill({ json: { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'Mock RPC failure' } } })
    if (req.method === 'eth_blockNumber') return respond('0x64')
    if (req.method === 'eth_getCode') return respond('0x6000') // 故意不符合開發 runtime；學生流程不應查詢它。
    if (req.method === 'eth_estimateGas') return respond('0xc350')
    if (req.method === 'eth_gasPrice') return respond('0x3b9aca00')
    if (req.method === 'eth_call') {
      const token = tokens.find(token => token.address.toLowerCase() === req.params[0].to.toLowerCase())!
      const { functionName } = decodeFunctionData({ abi: teachingTokenAbi, data: req.params[0].data })
      const values = { name: token.name, symbol: token.symbol, decimals: 18, totalSupply: tokenSupply, balanceOf: BigInt(options.balance ?? tokenSupply.toString()), transfer: true }
      const value = values[functionName as keyof typeof values]
      return respond(encodeFunctionResult({ abi: teachingTokenAbi, functionName, result: value as never }))
    }
    throw new Error(req.method)
  })
}
async function form(page: Page, amount = '1', recipient = secondAddress) {
  await panel(page).getByLabel('接收者 Ethereum 地址').fill(recipient)
  await panel(page).getByLabel('轉帳數量').fill(amount)
  await panel(page).getByRole('button', { name: '檢查轉帳摘要' }).click()
}

test('未連接仍可閱讀教材，入口啟用且沒有假餘額', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Token：開啟代幣介面' }).click()
  await expect(panel(page).getByRole('heading', { name: '教學代幣與單筆轉帳' })).toBeVisible()
  await expect(panel(page).getByText('尚未連接錢包', { exact: false })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '檢查轉帳摘要' })).toBeDisabled()
  await expect(panel(page).getByRole('heading', { name: '轉帳教材' })).toBeVisible()
})
for (const balance of ['0', '1', '999999999999999999999999']) {
  test(`三種精確餘額 ${balance} 與安全 Etherscan 連結、手機排版`, async ({ page }) => {
    await setup(page, { balance })
    await page.goto('./#token')
    for (const token of tokens) {
      await expect(panel(page).getByText(token.name, { exact: true })).toBeVisible()
      const display = balance === '0' ? '0' : balance === '1' ? '0.000000000000000001' : '999999.999999999999999999'
      await expect(panel(page).getByTestId(`balance-${token.symbol}`)).toHaveText(`${display} ${token.symbol}`)
      await expect(panel(page).getByRole('link', { name: `${token.symbol} Sepolia Etherscan ↗`, exact: true })).toHaveAttribute('href', token.explorerUrl)
    }
    await expect(panel(page).locator('time')).toHaveCount(3)
    await expect(panel(page).locator('time').first()).toHaveAttribute('datetime', /T/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
test('balanceOf RPC 失敗停用對應轉帳且不是零', async ({ page }) => {
  await setup(page, { failure: true })
  await page.goto('./#token')
  await expect(panel(page).getByRole('alert').first()).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '檢查轉帳摘要' })).toBeDisabled()
  await expect(panel(page).getByTestId('balance-DPLT')).toHaveText('尚無可顯示的餘額')
})
test('runtime 不符不阻擋三種餘額，查詢僅使用最新 balanceOf', async ({ page }) => {
  await setup(page)
  const methods: string[] = []
  const functions: string[] = []
  await page.route(rpc, async route => {
    const req = route.request().postDataJSON()
    methods.push(req.method)
    if (req.method === 'eth_call') {
      functions.push(decodeFunctionData({ abi: teachingTokenAbi, data: req.params[0].data }).functionName)
      expect(req.params[1]).toBe('latest')
    }
    await route.fallback()
  })
  await page.goto('./#token')
  for (const token of tokens) await expect(panel(page).getByTestId(`balance-${token.symbol}`)).toHaveText(`1000000 ${token.symbol}`)
  expect(functions).toEqual(['balanceOf', 'balanceOf', 'balanceOf'])
  expect(methods).not.toContain('eth_getCode')
  expect(methods).not.toContain('eth_blockNumber')
  await form(page)
  await expect(panel(page).getByRole('button', { name: '確認並開啟 MetaMask' })).toBeEnabled()
  expect(methods).not.toContain('eth_getCode')
})
test('摘要包含完整資訊，表單及帳號／網路變更後失效', async ({ page }) => {
  await setup(page)
  await page.goto('./#token')
  await form(page)
  await expect(panel(page).getByRole('heading', { name: '2. 核對完整摘要' })).toBeVisible()
  await expect(panel(page).locator('.token-summary')).toContainText(tokens[0].address)
  await expect(panel(page).locator('.token-summary')).toContainText(secondAddress)
  await panel(page).getByLabel('轉帳數量').fill('2')
  await expect(panel(page).getByRole('button', { name: '確認並開啟 MetaMask' })).toHaveCount(0)
  await form(page)
  await expect(panel(page).getByRole('button', { name: '確認並開啟 MetaMask' })).toBeVisible()
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).getByText('原確認摘要失效', { exact: false })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '確認並開啟 MetaMask' })).toHaveCount(0)
  await emit(page, 'chainChanged', '0x1')
  await expect(panel(page).getByTestId('balance-DPLT')).toHaveText('尚無可顯示的餘額')
  await expect(panel(page).getByRole('button', { name: '檢查轉帳摘要' })).toBeDisabled()
  await expect(panel(page).locator('time')).toHaveCount(0)
})
test('快速帳號切換時隔離舊回應', async ({ page }) => {
  const delayed: Route[] = []
  await setup(page, { balance: '2000000000000000000' })
  await page.route(rpc, async route => {
    const req = route.request().postDataJSON()
    if (req.method === 'eth_call' && req.params[0].data.toLowerCase().endsWith(address.slice(2))) { delayed.push(route); return }
    await route.fallback()
  })
  await page.goto('./#token')
  await expect.poll(() => delayed.length).toBe(3)
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).getByTestId('balance-DPLT')).toHaveText('2 DPLT')
  for (const route of delayed) await route.fulfill({ json: { jsonrpc: '2.0', id: route.request().postDataJSON().id, result: encodeFunctionResult({ abi: teachingTokenAbi, functionName: 'balanceOf', result: 1n }) } })
  await expect(panel(page).getByTestId('balance-DPLT')).toHaveText('2 DPLT')
})
test('Gas 不足阻止摘要，不會開啟錢包', async ({ page }) => {
  await setup(page, { zeroGas: true })
  await page.goto('./#token')
  await form(page)
  await expect(panel(page).getByRole('alert')).toContainText('Gas 不足')
  await expect(panel(page).getByRole('button', { name: '確認並開啟 MetaMask' })).toHaveCount(0)
})

test('取得 Hash 後結果未知仍保留原帳號、鏈與 Etherscan 連結，不自動重送', async ({ page }) => {
  const hash = `0x${'a'.repeat(64)}`
  await setup(page, { sendHash: hash })
  await page.route(rpc, async route => {
    if (route.request().postDataJSON().method === 'eth_chainId' && (await calls(page)).includes('eth_sendTransaction')) {
      await route.fulfill({ json: { jsonrpc: '2.0', id: route.request().postDataJSON().id, result: '0x1' } })
    } else await route.fallback()
  })
  await page.goto('./#token')
  await form(page)
  await panel(page).getByRole('button', { name: '確認並開啟 MetaMask' }).click()
  await expect(panel(page).getByText('unknown', { exact: true })).toBeVisible()
  await expect(panel(page).getByRole('link', { name: hash })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`)
  await emit(page, 'accountsChanged', [secondAddress])
  await emit(page, 'chainChanged', '0x1')
  await expect(panel(page).locator('.token-transaction')).toContainText(`原始帳號：${address}`)
  await expect(panel(page).getByRole('link', { name: hash })).toBeVisible()
  expect((await calls(page)).filter(method => method === 'eth_sendTransaction')).toHaveLength(1)
})
test('MetaMask 拒簽顯示 failed，沒有交易 Hash', async ({ page }) => {
  await setup(page, { sendError: 4001 })
  await page.goto('./#token')
  await form(page)
  await panel(page).getByRole('button', { name: '確認並開啟 MetaMask' }).click()
  await expect(panel(page).getByRole('alert')).toContainText('使用者拒絕')
  await expect(panel(page).getByText('failed', { exact: true })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '重新查詢原交易狀態' })).toHaveCount(0)
})

test('Mock Receipt 成功後更新相關代幣餘額，保留交易連結', async ({ page }, testInfo) => {
  const hash = `0x${'a'.repeat(64)}`
  const blockHash = `0x${'b'.repeat(64)}`
  await setup(page, { sendHash: hash })
  await page.route(rpc, async route => {
    const req = route.request().postDataJSON()
    const respond = (result: unknown) => route.fulfill({ json: { jsonrpc: '2.0', id: req.id, result } })
    if (req.method === 'eth_getTransactionReceipt') return respond({ transactionHash: hash, blockHash, blockNumber: '0x64', status: '0x1', from: address, to: tokens[0].address, transactionIndex: '0x0', cumulativeGasUsed: '0xc350', gasUsed: '0xc350', effectiveGasPrice: '0x3b9aca00', logs: [], logsBloom: `0x${'0'.repeat(512)}`, contractAddress: null, type: '0x0' })
    if (req.method === 'eth_getBlockByNumber') return respond({ hash: blockHash, number: '0x64', timestamp: '0x1', transactions: [] })
    if (req.method === 'eth_blockNumber') return respond('0x64')
    if (req.method === 'eth_getTransactionByHash') return respond({ hash, blockHash, blockNumber: '0x64', from: address, to: tokens[0].address, input: encodeFunctionData({ abi: teachingTokenAbi, functionName: 'transfer', args: [secondAddress, 10n ** 18n] }), value: '0x0', nonce: '0x0', gas: '0xc350', gasPrice: '0x3b9aca00', type: '0x0', transactionIndex: '0x0', v: '0x1', r: '0x1', s: '0x1' })
    if (req.method === 'eth_call' && req.params[0].data.startsWith('0x70a08231') && req.params[0].to.toLowerCase() === tokens[0].address.toLowerCase() && (await calls(page)).includes('eth_sendTransaction')) return respond(encodeFunctionResult({ abi: teachingTokenAbi, functionName: 'balanceOf', result: tokenSupply - 10n ** 18n }))
    await route.fallback()
  })
  await page.goto('./#token')
  await form(page)
  await panel(page).getByRole('button', { name: '確認並開啟 MetaMask' }).click()
  await expect(panel(page).getByText('success', { exact: true })).toBeVisible()
  await expect(panel(page).getByTestId('balance-DPLT')).toHaveText('999999 DPLT')
  await expect(panel(page).getByTestId('balance-DPLT-A')).toHaveText('1000000 DPLT-A')
  await expect(panel(page).getByRole('link', { name: hash })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`)
  expect((await calls(page)).filter(method => method === 'eth_sendTransaction')).toHaveLength(1)
  await panel(page).screenshot({ path: `/tmp/dpl-token-${testInfo.project.name}.png` })
})
