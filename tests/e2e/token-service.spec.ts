import { expect, test } from '@playwright/test'
import { encodeFunctionData, formatUnits } from 'viem'
import type { Hash } from 'viem'
import { teachingTokenAbi, tokens, tokenSupply } from '../../src/config/tokens'
import { createTransferStore } from '../../src/modules/token/services/transferStore'
import { prepareTransfer, validateTransfer, verifyToken } from '../../src/modules/token/services/tokenService'
import type { TokenClient } from '../../src/modules/token/services/tokenService'
import type { TransactionSession } from '../../src/modules/wallet/types'
import { address, secondAddress } from '../helpers/wallet'

const hash = `0x${'a'.repeat(64)}` as Hash
const replacementHash = `0x${'b'.repeat(64)}` as Hash
const blockHash = `0x${'c'.repeat(64)}` as Hash
const input = { tokenId: tokens[0].id, recipient: secondAddress, amount: '1' }
function fixture() {
  const calls: { method: string; params?: readonly unknown[] }[] = []
  let current = true
  let chain = '0xaa36a7'
  let account = address
  let reject = false
  let sendTimeout = false
  let delay: (() => Promise<void>) | undefined
  const session: TransactionSession = {
    address, chainId: 11155111, isCurrent: () => current,
    provider: { on: () => {}, removeListener: () => {}, async request(args) {
      calls.push(args)
      if (args.method === 'eth_accounts') return [account]
      if (args.method === 'eth_chainId') return chain
      if (args.method === 'eth_sendTransaction') {
        await delay?.()
        if (reject) throw { code: 4001, message: 'User rejected request' }
        if (sendTimeout) throw new Error('RPC timeout')
        return hash
      }
      throw new Error(args.method)
    } },
  }
  const client = {
    getChainId: async () => 11155111,
    getCode: async () => '0x1234',
    readContract: async ({ address: contract, functionName }: { address: string; functionName: string }) => {
      const token = tokens.find(token => token.address === contract)!
      return ({ name: token.name, symbol: token.symbol, decimals: 18, totalSupply: tokenSupply, balanceOf: tokenSupply })[functionName as 'name']
    },
    getBalance: async () => 10n ** 18n,
    simulateContract: async () => ({ result: true }),
    estimateContractGas: async () => 50_000n,
    getGasPrice: async () => 1_000_000_000n,
    waitForTransactionReceipt: async (args: unknown) => { void args; return receipt },
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: blockHash }),
    getBlockNumber: async () => 100n,
    getTransaction: async () => ({ from: address, to: tokens[0].address, input: encodeFunctionData({ abi: teachingTokenAbi, functionName: 'transfer', args: [secondAddress, 10n ** 18n] }), value: 0n, blockHash }),
  }
  const receipt = { transactionHash: hash, status: 'success', blockNumber: 100n, blockHash }
  let refreshed = 0
  const store = createTransferStore(client as unknown as TokenClient, () => refreshed++)
  return { client, session, receipt, store, calls, get refreshed() { return refreshed }, switchAccount: () => { account = secondAddress }, switchChain: () => { chain = '0x1' }, invalidate: () => { current = false }, reject: () => { reject = true }, timeout: () => { sendTimeout = true }, delay: (fn: () => Promise<void>) => { delay = fn } }
}

for (const amount of ['0', '-1', 'NaN', '1e3', '+1', '1.', '.1', '1.0000000000000000001', '1000001']) {
  test(`非法或超額金額 ${amount}`, () => { expect(() => validateTransfer({ ...input, amount }, tokenSupply)).toThrow() })
}
for (const recipient of ['bad', '0x0000000000000000000000000000000000000000', `${secondAddress}/evil`]) {
  test(`無效或零地址 ${recipient}`, () => { expect(() => validateTransfer({ ...input, recipient }, tokenSupply)).toThrow() })
}
test('最小與大額整數精度，零餘額不允許轉帳', () => {
  for (const amount of ['0.000000000000000001', '999999.999999999999999999']) expect(formatUnits(validateTransfer({ ...input, amount }, tokenSupply).amount, 18)).toBe(amount)
  expect(() => validateTransfer(input, 0n)).toThrow('超過')
  expect(() => validateTransfer({ ...input, tokenId: 'DPLT' }, tokenSupply)).toThrow()
})
test('三種代幣使用相同核對流程與身份，實際餘額可為零', async () => {
  const f = fixture()
  for (const token of tokens) { await verifyToken(token, f.client as unknown as TokenClient); expect(token.id).toBe(`11155111:${token.address.toLowerCase()}`) }
})
for (const mode of ['chain', 'code', 'name', 'symbol', 'decimals', 'totalSupply', 'rpc'] as const) {
  test(`關鍵合約驗證失敗 ${mode} 阻止準備與發送`, async () => {
    const f = fixture()
    if (mode === 'chain') f.client.getChainId = async () => 1
    else if (mode === 'code') f.client.getCode = async () => '0x'
    else {
      const read = f.client.readContract
      f.client.readContract = async args => { if (mode === 'rpc') throw new Error('RPC timeout'); return args.functionName === mode ? 'mismatch' : read(args) }
    }
    await f.store.prepare(f.session, input)
    expect(f.store.getSnapshot().status).toBe('failed')
    expect(f.store.getSnapshot().summary).toBeUndefined()
    expect(f.calls.some(call => call.method === 'eth_sendTransaction')).toBe(false)
  })
}
for (const mode of ['account', 'chain', 'event', 'gas', 'revert', 'false'] as const) {
  test(`前置檢查阻止 ${mode}`, async () => {
    const f = fixture()
    if (mode === 'account') f.switchAccount()
    if (mode === 'chain') f.switchChain()
    if (mode === 'event') f.invalidate()
    if (mode === 'gas') f.client.getBalance = async () => 0n
    if (mode === 'revert') f.client.simulateContract = async () => { throw new Error('execution reverted') }
    if (mode === 'false') f.client.simulateContract = async () => ({ result: false })
    await expect(prepareTransfer(f.session, input, f.client as unknown as TokenClient)).rejects.toThrow()
  })
}
test('摘要後帳號切換失效，Gas 條件變動必須重新檢查', async () => {
  for (const change of ['event', 'gas']) {
    const f = fixture()
    await f.store.prepare(f.session, input)
    const summary = f.store.getSnapshot().summary!
    if (change === 'event') f.invalidate()
    else f.client.getGasPrice = async () => 2_000_000_000n
    await f.store.confirm(summary)
    expect(f.store.getSnapshot().status).toBe('failed')
    expect(f.calls.some(call => call.method === 'eth_sendTransaction')).toBe(false)
  }
})
test('拒簽與未知發送結果可辨識，未知結果不得重送', async () => {
  for (const mode of ['reject', 'timeout']) {
    const f = fixture()
    await f.store.prepare(f.session, input)
    if (mode === 'reject') f.reject(); else f.timeout()
    await f.store.confirm(f.store.getSnapshot().summary!)
    expect(f.store.getSnapshot().status).toBe(mode === 'reject' ? 'failed' : 'unknown')
    if (mode === 'timeout') { await f.store.prepare(f.session, input); expect(f.store.getSnapshot().summary).toBeUndefined() }
    expect(f.calls.filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1)
  }
})
test('成功 Receipt 後更新，雙擊僅一筆 transfer、無 approve', async () => {
  const f = fixture()
  await f.store.prepare(f.session, input)
  expect(f.calls.some(call => call.method === 'eth_sendTransaction')).toBe(false)
  const summary = f.store.getSnapshot().summary!
  await Promise.all([f.store.confirm(summary), f.store.confirm(summary)])
  expect(f.store.getSnapshot().status).toBe('success')
  expect(f.refreshed).toBe(1)
  const requests = f.calls.filter(call => call.method === 'eth_sendTransaction')
  expect(requests).toHaveLength(1)
  expect(requests[0].params?.[0]).toMatchObject({ from: address, to: tokens[0].address, data: encodeFunctionData({ abi: teachingTokenAbi, functionName: 'transfer', args: [secondAddress, 10n ** 18n] }) })
  expect(f.store.getSnapshot().transaction?.originalHash).toBe(hash)
})
for (const mode of ['reverted', 'timeout', 'reorg', 'cancelled', 'replaced', 'repriced'] as const) {
  test(`追蹤 ${mode} 與原始 Hash 隔離`, async () => {
    const f = fixture()
    if (mode === 'reverted') f.receipt.status = 'reverted'
    if (mode === 'reorg') f.client.getBlock = async () => ({ hash: replacementHash })
    if (mode === 'timeout') f.client.waitForTransactionReceipt = async () => { throw new Error('RPC timeout') }
    if (['cancelled', 'replaced', 'repriced'].includes(mode)) {
      f.client.waitForTransactionReceipt = async args => {
        ;(args as { onReplaced(value: unknown): void }).onReplaced({ reason: mode, transaction: { hash: replacementHash } })
        f.receipt.transactionHash = replacementHash
        if (mode !== 'repriced') f.client.getTransaction = async () => ({ from: address, to: address, input: '0x', value: 0n, blockHash })
        return f.receipt
      }
    }
    await f.store.prepare(f.session, input)
    const summary = f.store.getSnapshot().summary!
    f.delay(async () => { f.invalidate() }) // 廣播途中切換，仍保留原始資料。
    await f.store.confirm(summary)
    expect(f.store.getSnapshot().transaction?.account).toBe(address)
    expect(f.store.getSnapshot().transaction?.originalHash).toBe(hash)
    expect(f.store.getSnapshot().status).toBe(mode === 'repriced' ? 'success' : mode === 'timeout' || mode === 'reorg' ? 'unknown' : 'failed')
    if (mode === 'timeout') { await f.store.track(); expect(f.store.getSnapshot().status).toBe('success'); expect(f.calls.filter(call => call.method === 'eth_sendTransaction')).toHaveLength(1) }
  })
}

test('新交易無 Hash 逾時不會用較早成功交易解除未知鎖定', async () => {
  const f = fixture()
  await f.store.prepare(f.session, input)
  await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe('success')
  f.timeout()
  await f.store.prepare(f.session, input)
  await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe('unknown')
  expect(f.store.getSnapshot().transaction).toBeUndefined()
  expect(f.store.getSnapshot().previousTransactions?.[0].originalHash).toBe(hash)
  await f.store.track()
  await f.store.prepare(f.session, input)
  expect(f.store.getSnapshot().status).toBe('unknown')
  expect(f.store.getSnapshot().summary).toBeUndefined()
  expect(f.calls.filter(call => call.method === 'eth_sendTransaction')).toHaveLength(2)
})
