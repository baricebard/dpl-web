import { expect, test } from '@playwright/test'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, formatUnits } from 'viem'
import type { Address, Hash, Hex } from 'viem'
import { exchange, exchangeAbi, exchangeInputCaps } from '../../src/config/exchange'
import { teachingTokenAbi, tokens } from '../../src/config/tokens'
import { createExchangeStore } from '../../src/modules/exchange/services/exchangeStore'
import { maxExchangeInput, prepareExchange, readExchangeQuote, readExchangeSnapshot, validateExchange } from '../../src/modules/exchange/services/exchangeService'
import type { TokenClient } from '../../src/modules/token'
import type { TransactionSession } from '../../src/modules/wallet/types'
import { address, secondAddress } from '../helpers/wallet'

const unit = 10n ** 18n
const hash = `0x${'a'.repeat(64)}` as Hash
const blockHash = `0x${'b'.repeat(64)}` as Hash
const otherHash = `0x${'c'.repeat(64)}` as Hash
const input = { tokenIn: tokens[0].id, tokenOut: tokens[1].id, amount: '1' }
const rates = [[0n, 30n, 20n], [1n, 0n, 2n], [3n, 9n, 0n]]
const denominators = [[1n, 1n, 3n], [30n, 1n, 9n], [20n, 2n, 1n]]
function fixture() {
  const config = { balance: 1000n * unit, reserve: 30_000n * unit, allowance: 0n, eth: unit, paused: false,
    rpcChain: 11155111, walletChain: '0xaa36a7', account: address, current: true, reject: false, sendTimeout: false,
    revert: false, waitTimeout: false, reorg: false, wrongTx: false, noEvent: false, updateAllowance: true, simulationFailure: false, quoteDelta: 0n }
  const sends: { to: Address; data: Hex; from: Address; value: string }[] = []
  let reads = 0
  let completed = false
  let beforeSend: (() => void) | undefined
  let deferSimulation: (() => Promise<void>) | undefined
  const session: TransactionSession = { address, chainId: 11155111, isCurrent: () => config.current, provider: {
    on() {}, removeListener() {}, async request(args) {
      if (args.method === 'eth_accounts') return [config.account]
      if (args.method === 'eth_chainId') return config.walletChain
      if (args.method === 'eth_sendTransaction') {
        sends.push(args.params![0] as typeof sends[number]); beforeSend?.()
        if (config.reject) throw { code: 4001, message: 'User rejected request' }
        if (config.sendTimeout) throw new Error('RPC timeout')
        return hash
      }
      throw new Error('Unexpected wallet method ' + args.method)
    },
  } }
  function sent() {
    const tx = sends.at(-1)!
    if (tx.to.toLowerCase() === exchange.address.toLowerCase()) {
      const decoded = decodeFunctionData({ abi: exchangeAbi, data: tx.data })
      if (decoded.functionName !== 'swap') throw new Error('swap expected')
      return { kind: 'swap', ...tx, args: decoded.args }
    }
    const decoded = decodeFunctionData({ abi: teachingTokenAbi, data: tx.data })
    if (decoded.functionName !== 'approve') throw new Error('approve expected')
    return { kind: 'approve', ...tx, args: decoded.args }
  }
  const client = {
    getChainId: async () => config.rpcChain,
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      reads++
      if (functionName === 'balanceOf') return config.balance - (completed && sent().kind === 'swap' ? unit : 0n)
      if (functionName === 'reserveOf') return config.reserve - (completed && sent().kind === 'swap' ? 30n * unit : 0n)
      if (functionName === 'paused') return config.paused
      if (functionName === 'allowance') {
        expect(args?.[1]).toBe(exchange.address)
        return config.allowance
      }
      if (functionName === 'quote') {
        const from = tokens.findIndex(token => token.address === args![0])
        const to = tokens.findIndex(token => token.address === args![1])
        return (args![2] as bigint) * rates[from][to] / denominators[from][to] + config.quoteDelta
      }
      throw new Error('Unexpected read ' + functionName)
    },
    getBalance: async () => config.eth,
    simulateContract: async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      await deferSimulation?.()
      if (config.simulationFailure) throw new Error('execution reverted')
      return { result: functionName === 'approve' ? true : args[3] }
    },
    estimateContractGas: async () => 60_000n,
    getGasPrice: async () => 1_000_000_000n,
    waitForTransactionReceipt: async () => { if (config.waitTimeout) throw new Error('RPC timeout') },
    getTransactionReceipt: async () => {
      const tx = sent()
      if (!config.revert) {
        completed = true
        if (tx.kind === 'approve' && config.updateAllowance) config.allowance = tx.args[1] as bigint
      }
      return { transactionHash: hash, status: config.revert ? 'reverted' : 'success', blockNumber: 100n, blockHash,
        logs: tx.kind === 'swap' && !config.noEvent ? [{ address: exchange.address,
          topics: encodeEventTopics({ abi: exchangeAbi, eventName: 'Swap', args: { sender: address, tokenIn: tx.args[0] as Address, tokenOut: tx.args[1] as Address } }),
          data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [tx.args[2] as bigint, tx.args[3] as bigint]),
        }] : [],
      }
    },
    getBlock: async () => ({ hash: config.reorg ? otherHash : blockHash }),
    getBlockNumber: async () => 100n,
    getTransaction: async () => ({ from: config.wrongTx ? secondAddress : address, to: sent().to, input: sent().data, value: 0n, blockHash }),
  }
  const typed = client as unknown as TokenClient
  const store = createExchangeStore(typed)
  return { config, session, store, client, typed, sends, get reads() { return reads }, beforeSend(fn: () => void) { beforeSend = fn }, defer(fn: () => Promise<void>) { deferSimulation = fn } }
}

for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) {
  if (from === to) continue
  test(`六方向 ${tokens[from].symbol} → ${tokens[to].symbol} 合約報價／swap calldata／事件`, async () => {
    const f = fixture(); f.config.allowance = 1000n * unit
    const terms = { tokenIn: tokens[from].id, tokenOut: tokens[to].id, amount: '1.000000000000000001' }
    const expected = (unit + 1n) * rates[from][to] / denominators[from][to]
    const quote = await readExchangeQuote(f.session, terms, f.typed)
    expect(quote.amountOut).toBe(expected)
    await f.store.prepare('swap', f.session, terms)
    expect(f.sends).toHaveLength(0)
    const summary = f.store.getSnapshot().summary!
    expect(summary.amountOut).toBe(expected)
    await f.store.confirm(summary)
    expect(f.store.getSnapshot().swap.status).toBe('success')
    expect(f.store.getSnapshot().swap.transaction?.received).toBe(expected)
    const data = decodeFunctionData({ abi: exchangeAbi, data: f.sends[0].data })
    expect(data.functionName).toBe('swap')
    expect(data.args).toEqual([tokens[from].address, tokens[to].address, unit + 1n, expected])
    expect(f.sends[0].to.toLowerCase()).toBe(exchange.address.toLowerCase())
    expect(f.store.getSnapshot().approve.status).toBe('idle')
  })
}
for (const amount of ['0', '-1', 'NaN', '1e2', '+1', '.1', '1.', '1.0000000000000000001', '10.000000000000000001']) {
  test(`拒絕非法或超限數量 ${amount}`, () => expect(() => validateExchange({ ...input, amount })).toThrow())
}
test('18 decimals 精度、三種 Max 精確限額與一單位超限', () => {
  expect(validateExchange({ ...input, amount: '0.000000000000000001' }).amountIn).toBe(1n)
  tokens.forEach((token, index) => {
    const terms = { ...input, tokenIn: token.id, tokenOut: tokens[(index + 1) % 3].id }
    expect(validateExchange({ ...terms, amount: formatUnits(exchangeInputCaps[index], 18) }).amountIn).toBe(exchangeInputCaps[index])
    expect(() => validateExchange({ ...terms, amount: formatUnits(exchangeInputCaps[index] + 1n, 18) })).toThrow('單筆限制')
    expect(maxExchangeInput(token.id, 99999n * unit)).toBe(formatUnits(exchangeInputCaps[index], 18))
    expect(maxExchangeInput(token.id, 1n)).toBe('0.000000000000000001')
  })
})
test('相同代幣、未知代幣與零輸出拒絕', async () => {
  expect(() => validateExchange({ ...input, tokenOut: input.tokenIn })).toThrow('不可相同')
  expect(() => validateExchange({ ...input, tokenIn: 'unknown' })).toThrow('已配置')
  const f = fixture()
  await expect(readExchangeQuote(f.session, { tokenIn: tokens[1].id, tokenOut: tokens[0].id, amount: '0.000000000000000001' }, f.typed)).rejects.toThrow('報價為零')
})
for (const failure of ['balance', 'reserve', 'paused', 'eth', 'allowance', 'simulation', 'rpcChain', 'walletChain', 'account', 'event', 'rpc'] as const) {
  test(`必要條件 ${failure} 不符停止 swap`, async () => {
    const f = fixture(); f.config.allowance = unit
    if (failure === 'balance') f.config.balance = 0n
    if (failure === 'reserve') f.config.reserve = 0n
    if (failure === 'paused') f.config.paused = true
    if (failure === 'eth') f.config.eth = 0n
    if (failure === 'allowance') f.config.allowance = unit - 1n
    if (failure === 'simulation') f.config.simulationFailure = true
    if (failure === 'rpcChain') f.config.rpcChain = 1
    if (failure === 'walletChain') f.config.walletChain = '0x1'
    if (failure === 'account') f.config.account = secondAddress
    if (failure === 'event') f.config.current = false
    if (failure === 'rpc') f.client.readContract = async () => { throw new Error('RPC timeout') }
    await f.store.prepare('swap', f.session, input)
    expect(f.store.getSnapshot().swap.status).toBe('failed')
    expect(f.store.getSnapshot().summary).toBeUndefined()
    expect(f.sends).toHaveLength(0)
  })
}
test('allowance 不足先授權精確本次量，非零額度覆寫；成功不自動 swap', async () => {
  const f = fixture(); f.config.allowance = unit / 2n
  await f.store.prepare('approve', f.session, input)
  const summary = f.store.getSnapshot().summary!
  expect(summary.snapshot.allowances[0]).toBe(unit / 2n)
  await f.store.confirm(summary)
  expect(f.store.getSnapshot().approve.status).toBe('success')
  expect(f.store.getSnapshot().swap.status).toBe('idle')
  expect(f.store.getSnapshot().data?.allowances[0]).toBe(unit)
  expect(f.sends).toHaveLength(1)
  const approved = decodeFunctionData({ abi: teachingTokenAbi, data: f.sends[0].data })
  expect(approved.functionName).toBe('approve'); expect(approved.args).toEqual([exchange.address, unit])
  await f.store.prepare('swap', f.session, input)
  expect(f.store.getSnapshot().summary?.kind).toBe('swap')
  expect(f.sends).toHaveLength(1)
})
test('allowance 已足夠拒絕重複 approve', async () => {
  const f = fixture(); f.config.allowance = unit
  await expect(prepareExchange('approve', f.session, input, f.typed)).rejects.toThrow('已足夠')
  await f.store.prepare('swap', f.session, input)
  expect(f.store.getSnapshot().summary?.kind).toBe('swap')
})
test('approve Receipt 成功但重新查詢 allowance 仍不足，不開放 swap', async () => {
  const f = fixture(); f.config.updateAllowance = false
  await f.store.prepare('approve', f.session, input); await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().approve.status).toBe('success')
  expect(f.store.getSnapshot().error).toContain('allowance 仍不足')
  await f.store.prepare('swap', f.session, input)
  expect(f.store.getSnapshot().swap.status).toBe('failed')
  expect(f.sends).toHaveLength(1)
})
for (const kind of ['approve', 'swap'] as const) for (const mode of ['reject', 'revert', 'timeout', 'unknownSend'] as const) {
  test(`${kind} ${mode} 分開追蹤、未知結果不重送`, async () => {
    const f = fixture(); if (kind === 'swap') f.config.allowance = unit
    if (mode === 'reject') f.config.reject = true
    if (mode === 'revert') f.config.revert = true
    if (mode === 'timeout') f.config.waitTimeout = true
    if (mode === 'unknownSend') f.config.sendTimeout = true
    await f.store.prepare(kind, f.session, input)
    await f.store.confirm(f.store.getSnapshot().summary!)
    const state = f.store.getSnapshot()
    expect(state[kind].status).toBe(['timeout', 'unknownSend'].includes(mode) ? 'unknown' : 'failed')
    if (mode === 'timeout') {
      expect(state[kind].transaction?.originalHash).toBe(hash)
      await f.store.prepare(kind, f.session, input); expect(f.store.getSnapshot().summary).toBeUndefined()
      await f.store.track(kind)
      expect(f.store.getSnapshot()[kind].status).toBe('success')
    }
    if (mode === 'unknownSend') { await f.store.prepare(kind, f.session, input); expect(f.store.getSnapshot().summary).toBeUndefined() }
    expect(f.sends).toHaveLength(1)
  })
}
for (const mode of ['form', 'account', 'chain', 'event', 'expiry', 'quote', 'gas', 'balance', 'allowance', 'reserve', 'paused', 'rpc'] as const) {
  test(`確認前 ${mode} 變動使摘要失效`, async () => {
    const f = fixture(); f.config.allowance = unit
    await f.store.prepare('swap', f.session, input)
    const summary = f.store.getSnapshot().summary!
    if (mode === 'form') f.store.invalidate()
    if (mode === 'account') f.config.account = secondAddress
    if (mode === 'chain') f.config.walletChain = '0x1'
    if (mode === 'event') f.config.current = false
    if (mode === 'expiry') summary.createdAt = Date.now() - 121_000
    if (mode === 'quote') f.config.quoteDelta = 1n
    if (mode === 'gas') f.client.getGasPrice = async () => 9_000_000_000n
    if (mode === 'balance') f.config.balance = 0n
    if (mode === 'allowance') f.config.allowance = 0n
    if (mode === 'reserve') f.config.reserve = 0n
    if (mode === 'paused') f.config.paused = true
    if (mode === 'rpc') f.client.readContract = async () => { throw new Error('RPC timeout') }
    await f.store.confirm(summary)
    expect(f.store.getSnapshot().summary).toBeUndefined()
    expect(f.sends).toHaveLength(0)
  })
}
test('雙擊只送一筆，送出中切換仍保留原帳號／chain／Hash', async () => {
  const f = fixture(); f.config.allowance = unit
  await f.store.prepare('swap', f.session, input)
  const summary = f.store.getSnapshot().summary!
  f.beforeSend(() => { f.config.current = false; f.store.invalidate(true) })
  await Promise.all([f.store.confirm(summary), f.store.confirm(summary)])
  expect(f.sends).toHaveLength(1)
  expect(f.store.getSnapshot().swap.transaction).toMatchObject({ account: address, chainId: 11155111, originalHash: hash })
  expect(f.store.getSnapshot().data).toBeUndefined()
})
for (const mode of ['reorg', 'wrongTx', 'noEvent'] as const) {
  test(`Receipt 核對 ${mode} 不冒稱交換成功`, async () => {
    const f = fixture(); f.config.allowance = unit; f.config[mode] = true
    await f.store.prepare('swap', f.session, input); await f.store.confirm(f.store.getSnapshot().summary!)
    expect(f.store.getSnapshot().swap.status).toBe(mode === 'wrongTx' ? 'failed' : 'unknown')
    expect(f.store.getSnapshot().swap.transaction?.originalHash).toBe(hash)
  })
}
test('swap 成功更新餘額及 reserveOf；後續查詢失敗清除資料，不當成零', async () => {
  const f = fixture(); f.config.allowance = unit
  await f.store.prepare('swap', f.session, input); await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().data?.balances[0]).toBe(999n * unit)
  expect(f.store.getSnapshot().data?.reserves[1]).toBe(29970n * unit)
  f.client.readContract = async () => { throw new Error('RPC failure') }
  await f.store.refresh(f.session, true)
  expect(f.store.getSnapshot().data).toBeUndefined()
  expect(f.store.getSnapshot().error).toContain('查詢失敗')
})
test('相同帳號查詢去重與成功快取，無高頻輪詢', async () => {
  const f = fixture()
  const [a, b] = await Promise.all([readExchangeSnapshot(f.session, f.typed), readExchangeSnapshot(f.session, f.typed)])
  expect(a.balances).toEqual(b.balances); expect(f.reads).toBe(10)
  await readExchangeSnapshot(f.session, f.typed); expect(f.reads).toBe(10)
  await readExchangeSnapshot(f.session, f.typed, true); expect(f.reads).toBe(20)
})
test('等待模擬途中變更表單或帳號，舊回應不建立摘要', async () => {
  const f = fixture(); let release!: () => void
  f.defer(() => new Promise<void>(resolve => { release = resolve }))
  const preparing = f.store.prepare('approve', f.session, input)
  await expect.poll(() => !!release).toBe(true)
  f.store.invalidate(true); f.config.current = false; release(); await preparing
  expect(f.store.getSnapshot().summary).toBeUndefined(); expect(f.sends).toHaveLength(0)
})
