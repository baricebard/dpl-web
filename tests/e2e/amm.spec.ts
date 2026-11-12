import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { decodeFunctionData, encodeFunctionResult, numberToHex } from 'viem'
import type { Abi, Address, Hex } from 'viem'
import { amm, ammAbi } from '../../src/config/amm'
import { exchange, exchangeAbi } from '../../src/config/exchange'
import { teachingTokenAbi } from '../../src/config/tokens'
import { ammFixture, blockHash, hash, unit } from '../helpers/amm'
import { address, calls, emit, mockWallet, secondAddress } from '../helpers/wallet'

const panel = (page: Page) => page.locator('#liquidity')
async function setup(page: Page, options: { allowance?: boolean; failure?: boolean; empty?: boolean; reject?: boolean; fixedFailure?: boolean; revert?: boolean; noEvent?: boolean; postFailure?: boolean } = {}) {
  await mockWallet(page, { authorized: true, legacy: true, sendHash: hash, sendError: options.reject ? 4001 : undefined })
  await page.addInitScript(() => {
    const root = window as unknown as { ethereum: { request(args: { method: string; params?: unknown[] }): Promise<unknown> }; ammSends: unknown[] }
    const original = root.ethereum.request
    root.ammSends = []
    root.ethereum.request = async args => { if (args.method === 'eth_sendTransaction') root.ammSends.push(args.params![0]); return original(args) }
  })
  const f = ammFixture()
  if (options.allowance) f.c.allowances = [100n * unit, 3000n * unit]
  if (options.empty) { f.c.supply = 0n; f.c.reserves = [0n, 0n] }
  f.c.revert = options.revert ?? false
  f.c.noEvent = options.noEvent ?? false
  f.c.fixedFailure = options.fixedFailure ?? false
  await page.route('https://ethereum-sepolia-rpc.publicnode.com/**', async route => {
    const req = route.request().postDataJSON()
    const respond = (result: unknown) => route.fulfill({ json: { jsonrpc: '2.0', id: req.id, result } })
    if (req.method === 'eth_chainId') return respond('0xaa36a7')
    if (options.failure) return route.fulfill({ json: { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'RPC failure' } } })
    if (req.method === 'eth_getBalance') return respond(numberToHex(unit))
    if (req.method === 'eth_estimateGas') return respond('0x13880')
    if (req.method === 'eth_gasPrice') return respond('0x3b9aca00')
    if (req.method === 'eth_blockNumber') return respond('0x64')
    if (req.method === 'eth_getBlockByNumber') return respond({ hash: blockHash, number: '0x64', timestamp: '0x1', transactions: [] })
    if (req.method === 'eth_getTransactionByHash' || req.method === 'eth_getTransactionReceipt') {
      const sends = await page.evaluate(() => (window as unknown as { ammSends: { to: Address; data: Hex; from: Address; value: string }[] }).ammSends)
      if (sends.length !== f.sends.length) { f.sends.splice(0, f.sends.length, ...sends); f.resetReceipt() }
      const tx = f.sends.at(-1)!
      if (req.method === 'eth_getTransactionByHash') return respond({ hash, blockHash, blockNumber: '0x64', from: address, to: tx.to, input: tx.data, value: '0x0', nonce: '0x0', gas: '0x13880', gasPrice: '0x3b9aca00', type: '0x0', transactionIndex: '0x0', v: '0x1', r: '0x1', s: '0x1' })
      const receipt = await f.typed.getTransactionReceipt({ hash })
      if (options.postFailure) f.c.rpcFailure = true
      return respond({ transactionHash: hash, blockHash, blockNumber: '0x64', status: options.revert ? '0x0' : '0x1', from: address, to: tx.to, transactionIndex: '0x0', cumulativeGasUsed: '0x13880', gasUsed: '0x13880', effectiveGasPrice: '0x3b9aca00',
        logs: receipt.logs.map((log, i) => ({ ...log, blockNumber: '0x64', blockHash, transactionHash: hash, transactionIndex: '0x0', logIndex: numberToHex(i), removed: false })), logsBloom: `0x${'0'.repeat(512)}`, contractAddress: null, type: '0x0' })
    }
    if (req.method === 'eth_call') {
      const target: Address = req.params[0].to
      const abi: Abi = target.toLowerCase() === amm.address.toLowerCase() ? ammAbi : target.toLowerCase() === exchange.address.toLowerCase() ? exchangeAbi : teachingTokenAbi
      const decoded = decodeFunctionData({ abi, data: req.params[0].data })
      try {
        const name = decoded.functionName, args = decoded.args ?? []
        const result = ['approve', 'swap', 'addLiquidity', 'removeLiquidity'].includes(name)
          ? (await f.client.simulateContract({ functionName: name, args })).result
          : await f.client.readContract({ address: target, functionName: name, args })
        return respond(encodeFunctionResult({ abi, functionName: name, result }))
      } catch {
        return route.fulfill({ json: { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'Mock RPC unavailable' } } })
      }
    }
    throw new Error('Unexpected RPC ' + req.method)
  })
  return f
}
async function quote(page: Page) {
  await panel(page).getByLabel('支付數量 / You Pay').fill('1')
  await panel(page).getByRole('button', { name: '查詢交換報價', exact: true }).click()
  await expect(panel(page).getByTestId('amm-output')).toContainText('DPLT-A')
}
test('無錢包可閱讀 LP 教材，不能送出', async ({ page }) => {
  await page.goto('./#liquidity')
  await expect(panel(page).getByRole('heading', { name: 'LP 與 AMM 小教室' })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '查詢交換報價', exact: true })).toBeDisabled()
})
test('正式報價、兩方向、Slippage 與 Fixed 比較、320px 不溢出', async ({ page }, info) => {
  await setup(page); await page.goto('./#liquidity'); await quote(page)
  await expect(panel(page).getByTestId('amm-output')).toContainText('29.614741031911838965 DPLT-A')
  await expect(panel(page).getByTestId('amm-preview')).toContainText('Price Impact（曲線，不含費用）')
  await expect(panel(page).getByTestId('amm-preview')).toContainText('AMM − Fixed：-0.385258968088161035')
  await panel(page).getByRole('button', { name: '1.0%', exact: true }).click()
  await expect(panel(page).getByTestId('amm-preview')).toHaveCount(0)
  await panel(page).getByRole('button', { name: '交換方向 ⇄' }).click()
  await panel(page).getByLabel('支付數量 / You Pay').fill('30')
  await panel(page).getByRole('button', { name: '查詢交換報價', exact: true }).click()
  await expect(panel(page).getByTestId('amm-output')).toContainText('0.987158034397061298 DPLT')
  await panel(page).screenshot({ path: `/tmp/dpl-amm-original-${info.project.name}.png` })
  await page.setViewportSize({ width: 320, height: 850 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel(page).screenshot({ path: `/tmp/dpl-amm-${info.project.name}.png` })
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(0)
})
test('Approve 與 Swap 兩次獨立確認、事件與更新後餘額', async ({ page }, info) => {
  await setup(page); await page.goto('./#liquidity'); await quote(page)
  await expect(panel(page).getByRole('button', { name: '查看交換摘要' })).toBeDisabled()
  await panel(page).getByRole('button', { name: '授權 1 DPLT', exact: true }).click()
  await expect(panel(page).getByTestId('amm-summary')).toContainText(amm.address)
  await expect(panel(page).getByTestId('amm-summary')).toContainText('本筆只授權 Pool')
  await expect(panel(page).getByTestId('amm-summary')).not.toContainText('預期收到')
  await panel(page).getByTestId('amm-summary').screenshot({ path: `/tmp/dpl-amm-summary-${info.project.name}.png` })
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(0)
  await panel(page).getByRole('button', { name: /^確認(授權|交換|提供流動性|移除流動性)/ }).click()
  await expect(panel(page).getByTestId('amm-status')).toContainText('授權完成，但尚未交換')
  await expect(panel(page).getByTestId('amm-result')).toHaveCount(0)
  await expect(panel(page).getByRole('button', { name: '授權 1 DPLT', exact: true })).toHaveCount(0)
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(1)
  await panel(page).getByRole('button', { name: '查看交換摘要' }).click()
  await panel(page).getByRole('button', { name: /^確認(授權|交換|提供流動性|移除流動性)/ }).click()
  await expect(panel(page).getByTestId('amm-status')).toContainText('實際收到 29.614741031911838965 DPLT-A')
  await expect(panel(page).getByTestId('amm-input-balance')).toContainText('99 DPLT')
  await expect(panel(page).getByTestId('amm-status')).toContainText('交換成功')
  await expect(panel(page).getByTestId('amm-result')).toContainText('100 → 99')
  await panel(page).getByTestId('amm-status').screenshot({ path: `/tmp/dpl-amm-result-${info.project.name}.png` })
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(2)
})
test('Add 比例與 LP 份額，Remove 四種百分比與成功事件', async ({ page }) => {
  await setup(page, { allowance: true }); await page.goto('./#liquidity')
  await panel(page).getByRole('button', { name: '提供流動性（Add Liquidity）', exact: true }).click()
  await panel(page).getByLabel('希望提供數量', { exact: true }).fill('1')
  await panel(page).getByRole('button', { name: '計算提供流動性', exact: true }).click()
  await expect(panel(page).getByTestId('amm-preview')).toContainText('1（1）DPLT / 30（30）DPLT-A')
  await expect(panel(page).getByTestId('amm-preview')).toContainText('預計取得 LP：5')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel(page).getByRole('button', { name: '查看注資摘要' }).click()
  await panel(page).getByRole('button', { name: /^確認(授權|交換|提供流動性|移除流動性)/ }).click()
  await expect(panel(page).getByTestId('amm-status')).toContainText('提供流動性成功')
  await expect(panel(page).getByTestId('amm-lp')).toContainText('持有 LP：55')
  await expect(panel(page).getByTestId('amm-result')).toContainText('實際取得 5 DPL-LP')
  await panel(page).getByRole('button', { name: '移除流動性（Remove Liquidity）', exact: true }).click()
  await expect(panel(page).getByTestId('amm-result')).toHaveCount(0)
  await expect(panel(page).getByTestId('amm-status')).not.toContainText('提供流動性成功')
  for (const [percent, amount] of [['25%', '13.75'], ['50%', '27.5'], ['75%', '41.25'], ['100%', '55']]) {
    await panel(page).getByRole('button', { name: percent, exact: true }).click()
    await expect(panel(page).getByLabel('移除 LP 數量')).toHaveValue(amount)
  }
  await panel(page).getByRole('button', { name: '計算移除流動性', exact: true }).click()
  await expect(panel(page).getByTestId('amm-preview')).toContainText('預期取回：11 DPLT / 330 DPLT-A')
  await panel(page).getByRole('button', { name: '查看移除摘要' }).click()
  await panel(page).getByRole('button', { name: /^確認(授權|交換|提供流動性|移除流動性)/ }).click()
  await expect(panel(page).getByTestId('amm-status')).toContainText('實際取回 11 DPLT')
  await expect(panel(page).getByTestId('amm-lp')).toContainText('持有 LP：0')
  await expect(panel(page).getByTestId('amm-result')).toContainText('實際取回 330 DPLT-A')
  await expect(panel(page).getByTestId('amm-result')).toContainText('銷毀 LP 55 DPL-LP')
  await page.setViewportSize({ width: 320, height: 850 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(2)
})
test('帳號／網路切換使摘要失效，過期報價不使用', async ({ page }) => {
  await page.clock.install(); await setup(page, { allowance: true }); await page.goto('./#liquidity'); await quote(page)
  await panel(page).getByRole('button', { name: '查看交換摘要' }).click()
  await expect(panel(page).getByTestId('amm-summary')).toBeVisible()
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).getByTestId('amm-summary')).toHaveCount(0)
  await quote(page); await page.clock.fastForward(121_000)
  await expect(panel(page).getByRole('alert')).toContainText('已過期')
  await emit(page, 'chainChanged', '0x1')
  await expect(panel(page).getByTestId('amm-input-balance')).toContainText('尚未確認')
  await expect(panel(page).getByRole('button', { name: '查詢交換報價', exact: true })).toBeDisabled()
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(0)
})
for (const mode of ['failure', 'empty', 'reject', 'fixedFailure'] as const) test(`${mode} 顯示真實錯誤，不產生假成功`, async ({ page }) => {
  await setup(page, { [mode]: true }); await page.goto('./#liquidity')
  if (mode === 'failure') { await expect(panel(page).getByRole('alert')).toContainText('查詢失敗'); await expect(panel(page).getByTestId('amm-input-balance')).toContainText('尚未確認'); return }
  if (mode === 'empty') { await expect(panel(page).getByRole('alert')).toContainText('尚未提供初始流動性'); await panel(page).getByLabel('支付數量 / You Pay').fill('1'); await panel(page).getByRole('button', { name: '查詢交換報價', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('不提供首次注資'); return }
  await quote(page)
  if (mode === 'fixedFailure') { await expect(panel(page).getByTestId('amm-preview')).toContainText('固定匯率比較無法使用'); return }
  await panel(page).getByRole('button', { name: '授權 1 DPLT', exact: true }).click()
  await panel(page).getByRole('button', { name: /^確認(授權|交換|提供流動性|移除流動性)/ }).click()
  await expect(panel(page).getByTestId('amm-status')).toContainText('使用者拒絕')
})

test('兩種授權完成後仍須獨立確認注資', async ({ page }) => {
  await setup(page); await page.goto('./#liquidity')
  await panel(page).getByRole('button', { name: '提供流動性（Add Liquidity）', exact: true }).click()
  await panel(page).getByLabel('希望提供數量', { exact: true }).fill('1')
  await panel(page).getByRole('button', { name: '計算提供流動性', exact: true }).click()
  for (const [amount, token] of [['1', 'DPLT'], ['30', 'DPLT-A']]) {
    await expect(panel(page).getByRole('button', { name: '查看注資摘要', exact: true })).toBeDisabled()
    await panel(page).getByRole('button', { name: `授權 ${amount} ${token}`, exact: true }).click()
    await panel(page).getByRole('button', { name: `確認授權 ${amount} ${token}`, exact: true }).click()
    await expect(panel(page).getByTestId('amm-status')).toContainText('授權完成，但尚未提供流動性')
    await expect(panel(page).getByTestId('amm-result')).toHaveCount(0)
  }
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(2)
  await expect(panel(page).getByRole('button', { name: /^授權 [0-9]/ })).toHaveCount(0)
  await panel(page).getByRole('button', { name: '查看注資摘要', exact: true }).click()
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(2)
  await panel(page).getByRole('button', { name: '確認提供流動性', exact: true }).click()
  await expect(panel(page).getByTestId('amm-status')).toContainText('提供流動性成功')
  await expect(panel(page).getByTestId('amm-result')).toContainText('實際取得 5 DPL-LP')
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(3)
})
for (const mode of ['revert', 'noEvent', 'postFailure'] as const) test(`Swap ${mode} 不偽造成功或餘額`, async ({ page }) => {
  await setup(page, { allowance: true, [mode]: true }); await page.goto('./#liquidity'); await quote(page)
  await expect(panel(page).getByTestId('amm-authorization')).toContainText('已授權，可進行交換')
  await expect(panel(page).getByRole('button', { name: /^授權 [0-9]/ })).toHaveCount(0)
  await panel(page).getByRole('button', { name: '查看交換摘要', exact: true }).click()
  await panel(page).getByRole('button', { name: '確認交換', exact: true }).click()
  if (mode === 'postFailure') {
    await expect(panel(page).getByTestId('amm-status')).toContainText('交換成功')
    await expect(panel(page).getByTestId('amm-result')).toContainText('實際收到 29.614741031911838965 DPLT-A')
    await expect(panel(page).getByTestId('amm-result')).toContainText('尚無法確認前後餘額')
    await expect(panel(page).getByTestId('amm-result')).not.toContainText('100 → 99')
  } else {
    await expect(panel(page).getByTestId('amm-status')).toContainText(mode === 'revert' ? '交換失敗' : '交易結果待確認')
    await expect(panel(page).getByTestId('amm-status')).not.toContainText('交換成功')
    await expect(panel(page).getByTestId('amm-result')).toHaveCount(0)
  }
  await expect(panel(page).getByTestId('amm-status').getByRole('link', { name: hash })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`)
  expect((await calls(page)).filter(c => c === 'eth_sendTransaction')).toHaveLength(1)
})
