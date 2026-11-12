import { decodeFunctionData, encodeAbiParameters, encodeEventTopics } from 'viem'
import type { Address, Hash, Hex } from 'viem'
import { amm, ammTokens } from '../../src/config/amm'
import { initialTeacher, teachingTokenAbi } from '../../src/config/tokens'
import { createAmmStore } from '../../src/modules/liquidity/services/ammStore'
import type { TokenClient } from '../../src/modules/token'
import type { TransactionSession } from '../../src/modules/wallet/types'
import { ammAbi } from '../../src/config/amm'
import { address, secondAddress } from './wallet'

export const unit = 10n ** 18n
export const hash = `0x${'a'.repeat(64)}` as Hash
export const blockHash = `0x${'b'.repeat(64)}` as Hash
export const swapInput = { operation: 'swap' as const, tokenIndex: 0 as const, amount: '1', slippage: '0.5' }
export function ammFixture() {
  const c = { reserves: [100n * unit, 3000n * unit], supply: 500n * unit, lp: 50n * unit,
    balances: [100n * unit, 3000n * unit], allowances: [0n, 0n], eth: unit,
    rpcChain: 11155111, walletChain: '0xaa36a7', account: address, current: true,
    reject: false, sendTimeout: false, waitTimeout: false, revert: false, reorg: false, wrongTx: false,
    noEvent: false, simulationFailure: false, rpcFailure: false, fixedFailure: false, updateAllowance: true,
    quoteOverride: undefined as bigint | undefined, gasPrice: 1_000_000_000n, provider: initialTeacher }
  const sends: { to: Address; data: Hex; from: Address; value: string }[] = []
  const reads: string[] = []
  let completed = false
  let savedReceipt: unknown
  let beforeSend: (() => void) | undefined
  let defer: (() => Promise<void>) | undefined
  const session: TransactionSession = { address, chainId: 11155111, isCurrent: () => c.current, provider: {
    on() {}, removeListener() {}, async request(args) {
      if (args.method === 'eth_accounts') return [c.account]
      if (args.method === 'eth_chainId') return c.walletChain
      if (args.method === 'eth_sendTransaction') {
        sends.push(args.params![0] as typeof sends[number]); beforeSend?.()
        if (c.reject) throw { code: 4001, message: 'User rejected' }
        if (c.sendTimeout) throw new Error('RPC timeout')
        return hash
      }
      throw new Error('Unexpected wallet ' + args.method)
    },
  } }
  function quote(token: unknown, amount: bigint) {
    const i = String(token).toLowerCase() === ammTokens[0].address.toLowerCase() ? 0 : 1
    return [ammTokens[1 - i].address, c.quoteOverride ?? c.reserves[1 - i] * amount * 997n / (c.reserves[i] * 1000n + amount * 997n)] as const
  }
  function estimateAdd(d: bigint, a: bigint) {
    const optimal = d * c.reserves[1] / c.reserves[0]
    const amounts = optimal <= a ? [d, optimal] : [a * c.reserves[0] / c.reserves[1], a]
    const l = [amounts[0] * c.supply / c.reserves[0], amounts[1] * c.supply / c.reserves[1]]
    return [...amounts, l[0] < l[1] ? l[0] : l[1]]
  }
  function result(name: string, args: readonly unknown[]) {
    if (name === 'approve') return true
    if (name === 'swap') return quote(args[0], args[1] as bigint)[1]
    if (name === 'addLiquidity') return estimateAdd(args[0] as bigint, args[1] as bigint)
    if (name === 'removeLiquidity') return c.reserves.map(r => (args[0] as bigint) * r / c.supply)
    throw new Error('Unexpected simulation ' + name)
  }
  function sent() {
    const tx = sends.at(-1)!
    const decoded = tx.to.toLowerCase() === amm.address.toLowerCase() ? decodeFunctionData({ abi: ammAbi, data: tx.data }) : decodeFunctionData({ abi: teachingTokenAbi, data: tx.data })
    return { ...tx, name: decoded.functionName, args: (decoded.args ?? []) as readonly unknown[] }
  }
  const client = {
    getChainId: async () => c.rpcChain,
    getBlockNumber: async () => 100n,
    readContract: async ({ address: target, functionName: name, args = [] }: { address: Address; functionName: string; args?: readonly unknown[] }) => {
      reads.push(name)
      if (c.rpcFailure) throw new Error('RPC timeout')
      const pool = target.toLowerCase() === amm.address.toLowerCase()
      const index = target.toLowerCase() === ammTokens[0].address.toLowerCase() ? 0 : 1
      if (name === 'dplt') return ammTokens[0].address
      if (name === 'assetA') return ammTokens[1].address
      if (name === 'initialProvider') return c.provider
      if (name === 'decimals') return 18
      if (name === 'getReserves') return [...c.reserves]
      if (name === 'totalSupply') return c.supply
      if (name === 'balanceOf') return pool ? c.lp : c.balances[index]
      if (name === 'allowance') return c.allowances[index]
      if (name === 'quoteSwap') return quote(args[0], args[1] as bigint)
      if (c.fixedFailure) throw new Error('Fixed RPC timeout')
      if (name === 'quote') return String(args[0]).toLowerCase() === ammTokens[0].address.toLowerCase() ? (args[2] as bigint) * 30n : (args[2] as bigint) / 30n
      if (name === 'reserveOf') return 999_999n * unit
      if (name === 'paused') return false
      throw new Error('Unexpected read ' + name)
    },
    getBalance: async () => c.eth,
    simulateContract: async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      await defer?.()
      if (c.simulationFailure) throw new Error('execution reverted')
      return { result: result(functionName, args) }
    },
    estimateContractGas: async () => 80_000n,
    getGasPrice: async () => c.gasPrice,
    waitForTransactionReceipt: async () => { if (c.waitTimeout) throw new Error('RPC timeout') },
    getTransactionReceipt: async () => {
      if (savedReceipt) return savedReceipt
      const tx = sent()
      const logs: { address: Address; topics: ReturnType<typeof encodeEventTopics>; data: Hex }[] = []
      if (tx.name === 'swap') {
        const output = quote(tx.args[0], tx.args[1] as bigint)
        logs.push({ address: amm.address, topics: encodeEventTopics({ abi: ammAbi, eventName: 'Swap', args: { sender: address, tokenIn: tx.args[0] as Address, tokenOut: output[0] } }), data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [tx.args[1] as bigint, output[1]]) })
      } else if (tx.name === 'addLiquidity' || tx.name === 'removeLiquidity') {
        const amounts = result(tx.name, tx.args) as bigint[]
        logs.push({ address: amm.address, topics: encodeEventTopics({ abi: ammAbi, eventName: tx.name === 'addLiquidity' ? 'AddLiquidity' : 'RemoveLiquidity', args: { provider: address } }), data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [amounts[0], amounts[1], tx.name === 'addLiquidity' ? amounts[2] : tx.args[0] as bigint]) })
      }
      if (!completed && !c.revert) {
        completed = true
        if (tx.name === 'approve' && c.updateAllowance) c.allowances[tx.to.toLowerCase() === ammTokens[0].address.toLowerCase() ? 0 : 1] = tx.args[1] as bigint
        if (tx.name === 'addLiquidity') {
          const amounts = result(tx.name, tx.args) as bigint[]
          c.reserves = c.reserves.map((r, i) => r + amounts[i]); c.balances = c.balances.map((r, i) => r - amounts[i]); c.supply += amounts[2]; c.lp += amounts[2]
        }
        if (tx.name === 'removeLiquidity') {
          const amounts = result(tx.name, tx.args) as bigint[]
          c.reserves = c.reserves.map((r, i) => r - amounts[i]); c.balances = c.balances.map((r, i) => r + amounts[i]); c.supply -= tx.args[0] as bigint; c.lp -= tx.args[0] as bigint
        }
        if (tx.name === 'swap') {
          const i = String(tx.args[0]).toLowerCase() === ammTokens[0].address.toLowerCase() ? 0 : 1
          const out = quote(tx.args[0], tx.args[1] as bigint)[1]
          c.reserves[i] += tx.args[1] as bigint; c.reserves[1 - i] -= out; c.balances[i] -= tx.args[1] as bigint; c.balances[1 - i] += out; c.allowances[i] -= tx.args[1] as bigint
        }
      }
      savedReceipt = { transactionHash: hash, blockNumber: 100n, blockHash, status: c.revert ? 'reverted' : 'success', logs: c.noEvent ? [] : logs }
      return savedReceipt
    },
    getTransaction: async () => ({ from: c.wrongTx ? secondAddress : address, to: sent().to, input: sent().data, value: 0n, blockHash }),
    getBlock: async () => ({ hash: c.reorg ? `0x${'c'.repeat(64)}` : blockHash }),
  }
  const typed = client as unknown as TokenClient
  return { c, client, typed, session, sends, reads, store: createAmmStore(typed),
    beforeSend(fn: () => void) { beforeSend = fn }, defer(fn: () => Promise<void>) { defer = fn }, resetReceipt() { completed = false; savedReceipt = undefined } }
}
