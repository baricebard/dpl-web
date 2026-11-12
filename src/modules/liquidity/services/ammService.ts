import { encodeFunctionData } from 'viem'
import { amm, ammAbi, ammTokens } from '../../../config/amm'
import { exchange, exchangeAbi, exchangeInputCaps } from '../../../config/exchange'
import { initialTeacher, teachingTokenAbi } from '../../../config/tokens'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'
import { assertSession, tokenError } from '../../token'
import type { TokenClient } from '../../token'
import type { TransactionSession } from '../../wallet/types'
import type { AmmInput, AmmKind, AmmPreview, AmmSnapshot, AmmSummary } from '../types'
import { addEstimate, minimum, parseAmount, removeEstimate, slippageBps } from './ammMath'

export function ammError(error: unknown) {
  const detail = error instanceof Error ? error.message : ''
  return ([ [/ExpiredDeadline/, '交易期限已過期，請重新準備。'], [/UninitializedPool|InsufficientReserve/, '池尚未初始化或儲備不足。'],
    [/InsufficientMinimumAmount/, '實際數量低於最低接受量，請重新查詢。'], [/ZeroOutput|InsufficientLiquidity/, '數量過小或 LP 不足。'],
    [/ReserveLimitExceeded/, '超過池安全上限。'], [/UnexpectedTokenBalance/, '代幣餘額變動不符，操作已停止。'],
  ] as const).find(([pattern]) => pattern.test(detail))?.[1] ?? tokenError(error)
}
async function checkSession(session: TransactionSession, client: TokenClient) {
  await assertSession(session)
  if (await client.getChainId() !== amm.chainId) throw new Error('RPC 網路不符，僅支援 Sepolia。')
  await assertSession(session)
}
const cache = new WeakMap<TokenClient, Map<string, { data?: AmmSnapshot; pending?: Promise<AmmSnapshot> }>>()
export async function readAmmSnapshot(session: TransactionSession, client: TokenClient = sepoliaPublicClient, fresh = false): Promise<AmmSnapshot> {
  await checkSession(session, client)
  let entries = cache.get(client)
  if (!entries) { entries = new Map(); cache.set(client, entries) }
  const key = session.address.toLowerCase()
  let entry = entries.get(key)
  if (!entry) { entry = {}; entries.set(key, entry) }
  if (!fresh && entry.data?.session.isCurrent() && Date.now() - entry.data.updatedAt < 30_000) return { ...entry.data, session }
  if (!entry.pending) entry.pending = (async () => {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
    const base = { address: amm.address, abi: ammAbi, blockNumber }
    const [dplt, assetA, provider, decimals, reserves, supply, lp, balances, allowances, ethBalance] = await Promise.all([
      client.readContract({ ...base, functionName: 'dplt' }), client.readContract({ ...base, functionName: 'assetA' }),
      client.readContract({ ...base, functionName: 'initialProvider' }), client.readContract({ ...base, functionName: 'decimals' }),
      client.readContract({ ...base, functionName: 'getReserves' }), client.readContract({ ...base, functionName: 'totalSupply' }),
      client.readContract({ ...base, functionName: 'balanceOf', args: [session.address] }),
      Promise.all(ammTokens.map(token => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'balanceOf', args: [session.address], blockNumber }))),
      Promise.all(ammTokens.map(token => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'allowance', args: [session.address, amm.address], blockNumber }))),
      client.getBalance({ address: session.address, blockNumber }),
    ])
    if (dplt.toLowerCase() !== ammTokens[0].address.toLowerCase() || assetA.toLowerCase() !== ammTokens[1].address.toLowerCase() || provider.toLowerCase() !== initialTeacher.toLowerCase() || decimals !== 18) throw new Error('Pool 資產、initialProvider 或 LP 精度不符，已停止操作。')
    await assertSession(session)
    const data = { session, reserves, supply, lp, balances, allowances, ethBalance, blockNumber, updatedAt: Date.now() }
    entry.data = data
    return data
  })().catch(error => { entry.data = undefined; throw error }).finally(() => { entry.pending = undefined })
  const data = await entry.pending
  await assertSession(session)
  return { ...data, session }
}
async function fixedComparison(input: AmmInput, amount: bigint, blockNumber: bigint, client: TokenClient) {
  try {
    if (amount > exchangeInputCaps[input.tokenIndex]) throw new Error('超過固定匯率 Exchange 單筆上限。')
    const amountOut = await client.readContract({ address: exchange.address, abi: exchangeAbi, functionName: 'quote', args: [ammTokens[input.tokenIndex].address, ammTokens[1 - input.tokenIndex].address, amount], blockNumber })
    const [reserve, paused] = await Promise.all([
      client.readContract({ address: exchange.address, abi: exchangeAbi, functionName: 'reserveOf', args: [ammTokens[1 - input.tokenIndex].address], blockNumber }),
      client.readContract({ address: exchange.address, abi: exchangeAbi, functionName: 'paused', blockNumber }),
    ])
    if (reserve < amountOut || paused) throw new Error(paused ? '固定匯率 Exchange 已暫停。' : '固定匯率 Exchange 庫存不足。')
    return { amountOut }
  } catch (error) { return { error: ammError(error) } }
}
export async function previewAmm(session: TransactionSession, input: AmmInput, client: TokenClient = sepoliaPublicClient, comparison = true): Promise<AmmPreview> {
  if (!['swap', 'add', 'remove'].includes(input.operation) || ![0, 1].includes(input.tokenIndex)) throw new Error('未知操作或代幣。')
  const amount = parseAmount(input.amount), bps = slippageBps(input.slippage)
  const snapshot = await readAmmSnapshot(session, client, true)
  const { reserves, supply } = snapshot
  if (supply < 1000n || reserves.some(value => value <= 0n)) throw new Error('池尚未初始化或儲備不足；學生介面不提供首次注資。')
  let desired: readonly [bigint, bigint] = [0n, 0n], amounts = desired, minima = desired
  let liquidity = 0n, amountOut = 0n, minAmountOut = 0n, minLiquidity = 0n
  if (input.operation === 'swap') {
    if (amount + reserves[input.tokenIndex] > amm.maxReserve) throw new Error('超過池安全上限。')
    const result = await client.readContract({ address: amm.address, abi: ammAbi, functionName: 'quoteSwap', args: [ammTokens[input.tokenIndex].address, amount], blockNumber: snapshot.blockNumber })
    if (result[0].toLowerCase() !== ammTokens[1 - input.tokenIndex].address.toLowerCase() || result[1] <= 0n || result[1] >= reserves[1 - input.tokenIndex]) throw new Error('合約報價為零或輸出資產不符。')
    amountOut = result[1]; minAmountOut = minimum(amountOut, bps)
  } else if (input.operation === 'add') {
    // 另一資產 desired 向上取整，避免反向輸入時因截斷而減少原始希望提供量。
    const other = (amount * reserves[1 - input.tokenIndex] + reserves[input.tokenIndex] - 1n) / reserves[input.tokenIndex]
    desired = input.tokenIndex === 0 ? [amount, other] : [other, amount]
    const estimate = addEstimate(desired, reserves, supply)
    amounts = estimate.amounts; liquidity = estimate.liquidity
    minima = [minimum(amounts[0], bps), minimum(amounts[1], bps)]; minLiquidity = minimum(liquidity, bps)
  } else {
    liquidity = amount; amounts = removeEstimate(amount, reserves, supply, snapshot.lp)
    minima = [minimum(amounts[0], bps), minimum(amounts[1], bps)]
  }
  const fixed = comparison && input.operation === 'swap' ? await fixedComparison(input, amount, snapshot.blockNumber, client) : undefined
  await assertSession(session)
  return { session, input: { ...input }, snapshot, amount, slippageBps: bps, desired, amounts, minima, liquidity, minLiquidity, amountOut, minAmountOut, createdAt: Date.now(), fixed, feeNumerator: input.operation === 'swap' ? amount * 3n : 0n }
}
export function validateDeadline(deadline: bigint) {
  if (deadline <= BigInt(Math.floor(Date.now() / 1000)) + 15n) throw new Error('交易期限已過期或即將到期，請重新準備。')
}
export async function prepareAmm(kind: AmmKind, session: TransactionSession, input: AmmInput, client: TokenClient = sepoliaPublicClient, deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n, bounds?: AmmPreview): Promise<AmmSummary> {
  validateDeadline(deadline)
  const p = await previewAmm(session, input, client, false)
  const { snapshot: s } = p
  const required = input.operation === 'swap' ? (input.tokenIndex === 0 ? [p.amount, 0n] : [0n, p.amount]) : input.operation === 'add' ? p.desired : [0n, 0n]
  required.forEach((value, i) => { if (value > s.balances[i]) throw new Error(`${ammTokens[i].symbol} 餘額不足。`) })
  const approvalIndex = kind === 'approveDPLT' ? 0 : kind === 'approveA' ? 1 : undefined
  if (approvalIndex !== undefined) {
    if (!required[approvalIndex] || s.allowances[approvalIndex] >= required[approvalIndex]) throw new Error('allowance 已足夠或本操作不需此代幣授權。')
  } else {
    if (kind !== input.operation) throw new Error('操作與摘要不符。')
    required.forEach((value, i) => { if (s.allowances[i] < value) throw new Error(`${ammTokens[i].symbol} allowance 不足，請先獨立授權。`) })
  }
  // 確認時保留使用者接受的最低量與期限；新估算不能悄悄降低保護。
  const b = bounds ?? p
  if (p.amountOut < b.minAmountOut || p.amounts.some((value, i) => value < b.minima[i]) || (input.operation === 'add' && p.liquidity < b.minLiquidity)) throw new Error('最新估算低於原摘要最低量，請重新準備。')
  const request = approvalIndex !== undefined
    ? { account: session.address, address: ammTokens[approvalIndex].address, abi: teachingTokenAbi, functionName: 'approve' as const, args: [amm.address, required[approvalIndex]] as const }
    : kind === 'swap'
      ? { account: session.address, address: amm.address, abi: ammAbi, functionName: 'swap' as const, args: [ammTokens[input.tokenIndex].address, p.amount, b.minAmountOut, deadline] as const }
      : kind === 'add'
        ? { account: session.address, address: amm.address, abi: ammAbi, functionName: 'addLiquidity' as const, args: [...p.desired, ...b.minima, b.minLiquidity, deadline] as const }
        : { account: session.address, address: amm.address, abi: ammAbi, functionName: 'removeLiquidity' as const, args: [p.amount, ...b.minima, deadline] as const }
  const { result } = request.functionName === 'approve' ? await client.simulateContract(request)
    : request.functionName === 'swap' ? await client.simulateContract(request)
      : request.functionName === 'addLiquidity' ? await client.simulateContract(request) : await client.simulateContract(request)
  if (approvalIndex !== undefined && result !== true) throw new Error('授權模擬失敗。')
  if (kind === 'swap' && (typeof result !== 'bigint' || result < b.minAmountOut)) throw new Error('交換模擬輸出不足。')
  if (kind === 'add' || kind === 'remove') {
    if (!Array.isArray(result) || result[0] < b.minima[0] || result[1] < b.minima[1] || (kind === 'add' && result[2] < b.minLiquidity)) throw new Error('流動性模擬結果不足。')
  }
  const [estimate, price] = await Promise.all([request.functionName === 'approve' ? client.estimateContractGas(request)
      : request.functionName === 'swap' ? client.estimateContractGas(request)
        : request.functionName === 'addLiquidity' ? client.estimateContractGas(request) : client.estimateContractGas(request), client.getGasPrice()])
  const gas = (estimate * 120n + 99n) / 100n, gasPrice = (price * 120n + 99n) / 100n
  if (s.ethBalance < gas * gasPrice) throw new Error('Sepolia ETH Gas 不足。')
  await assertSession(session); validateDeadline(deadline)
  const data = request.functionName === 'approve' ? encodeFunctionData(request)
    : request.functionName === 'swap' ? encodeFunctionData(request)
      : request.functionName === 'addLiquidity' ? encodeFunctionData(request) : encodeFunctionData(request)
  return { ...p, minima: b.minima, minAmountOut: b.minAmountOut, minLiquidity: b.minLiquidity, kind, deadline, gas, gasPrice, to: request.address, data }
}
