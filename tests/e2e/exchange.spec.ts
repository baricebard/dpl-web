import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodeFunctionResult, numberToHex } from 'viem'
import { exchange, exchangeAbi } from '../../src/config/exchange'
import { teachingTokenAbi, tokens } from '../../src/config/tokens'
import { address, calls, emit, mockWallet, secondAddress } from '../helpers/wallet'

const unit = 10n ** 18n
const hash = `0x${'a'.repeat(64)}`
const blockHash = `0x${'b'.repeat(64)}`
const rpc = 'https://ethereum-sepolia-rpc.publicnode.com/**'
const panel = (page: Page) => page.locator('#exchange')
async function setup(page: Page, options: { failure?: boolean; reject?: boolean; allowance?: bigint; chain?: string; unknown?: boolean } = {}) {
  await mockWallet(page, { authorized: true, chain: options.chain, sendHash: hash, sendError: options.reject ? 4001 : undefined })
  let allowance = options.allowance ?? 0n
  let phase: 'approve' | 'swap' = 'approve'
  let swapped = false
  let inputToken = tokens[0].address, outputToken = tokens[1].address
  let amountIn = unit, amountOut = 30n * unit
  let quoteReads = 0
  await page.route(rpc, async route => {
    const req = route.request().postDataJSON()
    const respond = (result: unknown) => route.fulfill({ json: { jsonrpc: '2.0', id: req.id, result } })
    if (req.method === 'eth_chainId') return respond(options.unknown && (await calls(page)).includes('eth_sendTransaction') ? '0x1' : '0xaa36a7')
    if (options.failure) return route.fulfill({ json: { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'Mock RPC failure' } } })
    if (req.method === 'eth_getBalance') return respond(numberToHex(unit))
    if (req.method === 'eth_estimateGas') return respond('0xea60')
    if (req.method === 'eth_gasPrice') return respond('0x3b9aca00')
    if (req.method === 'eth_blockNumber') return respond('0x64')
    if (req.method === 'eth_getBlockByNumber') return respond({ hash: blockHash, number: '0x64', timestamp: '0x1', transactions: [] })
    const data = phase === 'approve'
      ? encodeFunctionData({ abi: teachingTokenAbi, functionName: 'approve', args: [exchange.address, amountIn] })
      : encodeFunctionData({ abi: exchangeAbi, functionName: 'swap', args: [inputToken, outputToken, amountIn, amountOut] })
    const to = phase === 'approve' ? inputToken : exchange.address
    if (req.method === 'eth_getTransactionByHash') return respond({ hash, blockHash, blockNumber: '0x64', from: address, to, input: data, value: '0x0', nonce: '0x0', gas: '0xea60', gasPrice: '0x3b9aca00', type: '0x0', transactionIndex: '0x0', v: '0x1', r: '0x1', s: '0x1' })
    if (req.method === 'eth_getTransactionReceipt') {
      if (phase === 'approve') allowance = amountIn
      else { swapped = true; allowance = 0n }
      return respond({ transactionHash: hash, blockHash, blockNumber: '0x64', status: '0x1', from: address, to, transactionIndex: '0x0', cumulativeGasUsed: '0xea60', gasUsed: '0xea60', effectiveGasPrice: '0x3b9aca00',
        logs: phase === 'swap' ? [{ address: exchange.address, topics: encodeEventTopics({ abi: exchangeAbi, eventName: 'Swap', args: { sender: address, tokenIn: inputToken, tokenOut: outputToken } }), data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [amountIn, amountOut]), blockNumber: '0x64', blockHash, transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false }] : [],
        logsBloom: `0x${'0'.repeat(512)}`, contractAddress: null, type: '0x0' })
    }
    if (req.method === 'eth_call') {
      const isExchange = req.params[0].to.toLowerCase() === exchange.address.toLowerCase()
      if (isExchange) {
        const decoded = decodeFunctionData({ abi: exchangeAbi, data: req.params[0].data })
        if (decoded.functionName === 'paused') return respond(encodeFunctionResult({ abi: exchangeAbi, functionName: 'paused', result: false }))
        if (decoded.functionName === 'reserveOf') return respond(encodeFunctionResult({ abi: exchangeAbi, functionName: 'reserveOf', result: swapped ? 29970n * unit : 30000n * unit }))
        if (decoded.functionName === 'quote') {
          quoteReads++
          const [from, to, amount] = decoded.args
          const i = tokens.findIndex(token => token.address.toLowerCase() === from.toLowerCase())
          const j = tokens.findIndex(token => token.address.toLowerCase() === to.toLowerCase())
          const n = [[0n, 30n, 20n], [1n, 0n, 2n], [3n, 9n, 0n]]
          const d = [[1n, 1n, 3n], [30n, 1n, 9n], [20n, 2n, 1n]]
          return respond(encodeFunctionResult({ abi: exchangeAbi, functionName: 'quote', result: amount * n[i][j] / d[i][j] }))
        }
        if (decoded.functionName === 'swap') {
          phase = 'swap'; [inputToken, outputToken, amountIn, amountOut] = decoded.args
          return respond(encodeFunctionResult({ abi: exchangeAbi, functionName: 'swap', result: amountOut }))
        }
      } else {
        const decoded = decodeFunctionData({ abi: teachingTokenAbi, data: req.params[0].data })
        if (decoded.functionName === 'balanceOf') return respond(encodeFunctionResult({ abi: teachingTokenAbi, functionName: 'balanceOf', result: swapped ? 99n * unit : 100n * unit }))
        if (decoded.functionName === 'allowance') return respond(encodeFunctionResult({ abi: teachingTokenAbi, functionName: 'allowance', result: allowance }))
        if (decoded.functionName === 'approve') {
          phase = 'approve'; amountIn = decoded.args[1]
          return respond(encodeFunctionResult({ abi: teachingTokenAbi, functionName: 'approve', result: true }))
        }
      }
    }
    throw new Error('Unexpected Mock RPC ' + req.method)
  })
  return { quoteReads: () => quoteReads }
}
async function quote(page: Page) {
  await panel(page).getByLabel('支付數量').fill('1')
  await panel(page).getByRole('button', { name: '查詢合約報價' }).click()
  await expect(panel(page).getByTestId('exchange-quote')).toHaveText('30 DPLT-A')
}

test('Exchange 首頁入口與未連接教材，不自動要求簽署', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Exchange：開啟交換介面' }).click()
  await expect(panel(page).getByRole('heading', { name: 'DPL Exchange', exact: true })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: '查詢合約報價' })).toBeDisabled()
  await expect(panel(page).getByRole('heading', { name: '交換小教室' })).toBeVisible()
})
test('六方向報價皆來自合約，Max 限額、方向互換及手機不溢出', async ({ page }, info) => {
  const rpc = await setup(page)
  await page.goto('./#exchange')
  await expect(panel(page).getByTestId('exchange-pay-balance')).toContainText('100 DPLT')
  const expected = [['', '30 DPLT-A', '6.666666666666666666 DPLT-B'], ['0.033333333333333333 DPLT', '', '0.222222222222222222 DPLT-B'], ['0.15 DPLT', '4.5 DPLT-A', '']]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === j) continue
    await panel(page).getByLabel('支付代幣').selectOption(tokens[i].id)
    await panel(page).getByLabel('取得代幣').selectOption(tokens[j].id)
    await panel(page).getByLabel('支付數量').fill('1')
    await panel(page).getByRole('button', { name: '查詢合約報價' }).click()
    await expect(panel(page).getByTestId('exchange-quote')).toHaveText(expected[i][j])
  }
  expect(rpc.quoteReads()).toBe(6)
  await panel(page).getByRole('button', { name: 'Max', exact: true }).click()
  await expect(panel(page).getByLabel('支付數量')).toHaveValue('66.666666666666666666')
  await expect(panel(page).getByLabel('取得代幣')).not.toHaveValue(tokens[2].id)
  await panel(page).getByRole('button', { name: '互換方向 ⇄' }).click()
  await expect(panel(page).getByLabel('支付數量')).toHaveValue('')
  expect((await calls(page)).filter(call => call === 'eth_sendTransaction')).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel(page).screenshot({ path: `/tmp/dpl-exchange-${info.project.name}.png` })
})
test('approve 與 swap 各自明確確認，Receipt 後更新 allowance／餘額／庫存', async ({ page }) => {
  await setup(page); await page.goto('./#exchange'); await quote(page)
  await expect(panel(page).getByRole('button', { name: '2. 檢查交換摘要' })).toBeDisabled()
  await panel(page).getByRole('button', { name: '1. 檢查授權摘要' }).click()
  await expect(panel(page).locator('.exchange-summary')).toContainText(exchange.address)
  expect((await calls(page)).filter(call => call === 'eth_sendTransaction')).toHaveLength(0)
  await panel(page).getByRole('button', { name: '確認授權並開啟 MetaMask' }).click()
  await expect(panel(page).getByTestId('exchange-approve-status')).toContainText('狀態：授權已確認（此筆僅授權）')
  await expect(panel(page).getByText('授權可能仍存在', { exact: false })).toBeVisible()
  expect((await calls(page)).filter(call => call === 'eth_sendTransaction')).toHaveLength(1)
  await panel(page).getByRole('button', { name: '2. 檢查交換摘要' }).click()
  await expect(panel(page).locator('.exchange-summary')).toContainText('30 DPLT-A')
  await panel(page).getByRole('button', { name: '確認交換並開啟 MetaMask' }).click()
  await expect(panel(page).getByRole('heading', { name: '交換成功 / Swap Success', exact: true })).toBeVisible()
  await expect(panel(page).getByTestId('exchange-swap-status')).toContainText('取得：30 DPLT-A')
  await expect(panel(page).getByTestId('exchange-swap-status')).toContainText('實際 Receipt 狀態：success')
  await expect(panel(page).getByTestId('exchange-balance-DPLT')).toContainText('餘額：99')
  await expect(panel(page).getByTestId('exchange-reserve')).toContainText('29970')
  expect((await calls(page)).filter(call => call === 'eth_sendTransaction')).toHaveLength(2)
})
test('allowance 足夠略過授權，表單／帳號變更使摘要失效', async ({ page }) => {
  await setup(page, { allowance: unit }); await page.goto('./#exchange'); await quote(page)
  await expect(panel(page).getByRole('button', { name: '1. 檢查授權摘要' })).toBeDisabled()
  await panel(page).getByRole('button', { name: '2. 檢查交換摘要' }).click()
  await expect(panel(page).getByRole('button', { name: '確認交換並開啟 MetaMask' })).toBeVisible()
  await panel(page).getByLabel('支付數量').fill('2')
  await expect(panel(page).getByRole('button', { name: '確認交換並開啟 MetaMask' })).toHaveCount(0)
  await quote(page); await panel(page).getByRole('button', { name: '2. 檢查交換摘要' }).click()
  await emit(page, 'accountsChanged', [secondAddress])
  await expect(panel(page).getByRole('button', { name: '確認交換並開啟 MetaMask' })).toHaveCount(0)
  await emit(page, 'chainChanged', '0x1')
  await expect(panel(page).getByTestId('exchange-pay-balance')).toHaveText('錢包餘額：尚未確認')
  await expect(panel(page).getByRole('button', { name: '查詢合約報價' })).toBeDisabled()
})
for (const mode of ['failure', 'reject', 'unknown'] as const) {
  test(`RPC／MetaMask ${mode} 無假成功或自動重送`, async ({ page }) => {
    await setup(page, { [mode]: true }); await page.goto('./#exchange')
    if (mode === 'failure') {
      await expect(panel(page).getByRole('alert')).toContainText('查詢失敗')
      await expect(panel(page).getByTestId('exchange-pay-balance')).toHaveText('錢包餘額：尚未確認')
      return
    }
    await quote(page); await panel(page).getByRole('button', { name: '1. 檢查授權摘要' }).click()
    await panel(page).getByRole('button', { name: '確認授權並開啟 MetaMask' }).click()
    await expect(panel(page).getByTestId('exchange-approve-status')).toContainText(mode === 'reject' ? '狀態：操作失敗' : '狀態：交易狀態未知，請查詢原交易')
    if (mode === 'unknown') {
      await emit(page, 'accountsChanged', [secondAddress]); await emit(page, 'chainChanged', '0x1')
      await expect(panel(page).getByTestId('exchange-approve-status')).toContainText(`原始帳號：${address}`)
      await expect(panel(page).getByRole('link', { name: hash })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`)
    }
    expect((await calls(page)).filter(call => call === 'eth_sendTransaction')).toHaveLength(1)
  })
}

test('摘要過期要求重新報價與確認，不會開啟 MetaMask', async ({ page }) => {
  await page.clock.install()
  await setup(page, { allowance: unit }); await page.goto('./#exchange'); await quote(page)
  await panel(page).getByRole('button', { name: '2. 檢查交換摘要' }).click()
  await expect(panel(page).getByRole('button', { name: '確認交換並開啟 MetaMask' })).toBeVisible()
  await page.clock.fastForward(121_000)
  await expect(panel(page).getByRole('button', { name: '確認交換並開啟 MetaMask' })).toHaveCount(0)
  await expect(panel(page).getByRole('alert')).toContainText('報價已過期')
  await expect(panel(page).getByTestId('exchange-quote')).toHaveText('等待合約報價')
  expect((await calls(page)).filter(call => call === 'eth_sendTransaction')).toHaveLength(0)
})
