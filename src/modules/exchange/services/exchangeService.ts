import { encodeFunctionData, formatUnits, parseUnits } from 'viem'
import { exchange, exchangeAbi, exchangeInputCaps } from '../../../config/exchange'
import { teachingTokenAbi, tokens } from '../../../config/tokens'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'
import { assertSession, tokenError } from '../../token'
import type { TokenClient } from '../../token'
import type { TransactionSession } from '../../wallet/types'
import type { ExchangeInput, ExchangeKind, ExchangeSnapshot, ExchangeSummary, ExchangeTerms } from '../types'

export function exchangeError(error: unknown) {
  const detail = error instanceof Error ? error.message : ''
  const descriptions: [RegExp, string][] = [
    [/InsufficientReserve/, 'Exchange 庫存不足。'], [/EnforcedPause/, 'Exchange 已暫停。'],
    [/AmountExceedsLimit/, '超過 10 DPLT 等值單筆限制。'], [/ZeroOutput/, '數量過小，合約報價向下取整後為零。'],
    [/InsufficientOutputAmount/, '報價或最低收到量已變動，請重新確認。'],
  ]
  return descriptions.find(([pattern]) => pattern.test(detail))?.[1] ?? tokenError(error)
}
export function validateExchange(input: ExchangeInput): ExchangeTerms {
  const tokenIn = tokens.find(token => token.id === input.tokenIn)
  const tokenOut = tokens.find(token => token.id === input.tokenOut)
  if (!tokenIn || !tokenOut) throw new Error('請選擇已配置的教學代幣。')
  if (tokenIn.id === tokenOut.id) throw new Error('支付與取得代幣不可相同。')
  if (!/^\d+(\.\d+)?$/.test(input.amount)) throw new Error('數量必須是正十進位數字，不接受負數或科學記號。')
  if ((input.amount.split('.')[1]?.length ?? 0) > 18) throw new Error('小數位數不可超過 18。')
  const amountIn = parseUnits(input.amount, 18)
  if (amountIn <= 0n) throw new Error('數量必須大於零。')
  if (amountIn > exchangeInputCaps[tokens.indexOf(tokenIn)]) throw new Error('超過 10 DPLT 等值單筆限制。')
  return { tokenIn, tokenOut, amountIn }
}
export function maxExchangeInput(tokenId: string, balance: bigint) {
  const index = tokens.findIndex(token => token.id === tokenId)
  if (index < 0 || balance < 0n) throw new Error('未知代幣或餘額。')
  return formatUnits(balance < exchangeInputCaps[index] ? balance : exchangeInputCaps[index], 18)
}
export async function checkExchangeSession(session: TransactionSession, client: TokenClient) {
  await assertSession(session)
  if (await client.getChainId() !== exchange.chainId) throw new Error('RPC 網路不符，僅支援 Ethereum Sepolia。')
  await assertSession(session)
}
// 每 client／帳號同時進行的查詢去重；只快取成功結果 30 秒，不輪詢。
const snapshots = new WeakMap<TokenClient, Map<string, { data?: ExchangeSnapshot; pending?: Promise<ExchangeSnapshot> }>>()
export async function readExchangeSnapshot(session: TransactionSession, client: TokenClient = sepoliaPublicClient, fresh = false): Promise<ExchangeSnapshot> {
  if (!session.isCurrent()) throw new Error('帳號或網路已切換，請重新查詢。')
  let cache = snapshots.get(client)
  if (!cache) { cache = new Map(); snapshots.set(client, cache) }
  const key = session.address.toLowerCase()
  let entry = cache.get(key)
  if (!entry) { entry = {}; cache.set(key, entry) }
  if (!fresh && entry.data?.session.isCurrent() && Date.now() - entry.data.updatedAt < 30_000) return { ...entry.data, session }
  if (!entry.pending) {
    entry.pending = (async () => {
      await checkExchangeSession(session, client)
      const [balances, reserves, allowances, ethBalance, paused] = await Promise.all([
        Promise.all(tokens.map(token => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'balanceOf', args: [session.address] }))),
        Promise.all(tokens.map(token => client.readContract({ address: exchange.address, abi: exchangeAbi, functionName: 'reserveOf', args: [token.address] }))),
        Promise.all(tokens.map(token => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'allowance', args: [session.address, exchange.address] }))),
        client.getBalance({ address: session.address }),
        client.readContract({ address: exchange.address, abi: exchangeAbi, functionName: 'paused' }),
      ])
      await assertSession(session)
      const data = { session, balances, reserves, allowances, ethBalance, paused, updatedAt: Date.now() }
      entry.data = data
      return data
    })().catch(error => { entry.data = undefined; throw error }).finally(() => { entry.pending = undefined })
  }
  const data = await entry.pending
  await assertSession(session)
  return { ...data, session }
}
export async function readExchangeQuote(session: TransactionSession, input: ExchangeInput, client: TokenClient = sepoliaPublicClient) {
  const terms = validateExchange(input)
  await checkExchangeSession(session, client)
  const amountOut = await client.readContract({ address: exchange.address, abi: exchangeAbi, functionName: 'quote', args: [terms.tokenIn.address, terms.tokenOut.address, terms.amountIn] })
  if (amountOut <= 0n) throw new Error('合約報價為零，請增加數量。')
  await assertSession(session)
  return { ...terms, session, amountOut, createdAt: Date.now() }
}
export async function prepareExchange(kind: ExchangeKind, session: TransactionSession, input: ExchangeInput, client: TokenClient = sepoliaPublicClient): Promise<ExchangeSummary> {
  validateExchange(input)
  const [quote, snapshot] = await Promise.all([readExchangeQuote(session, input, client), readExchangeSnapshot(session, client, true)])
  const index = tokens.indexOf(quote.tokenIn)
  if (snapshot.paused) throw new Error('Exchange 已暫停，請稍後再試。')
  if (snapshot.balances[index] < quote.amountIn) throw new Error('支付代幣餘額不足。')
  if (snapshot.reserves[tokens.indexOf(quote.tokenOut)] < quote.amountOut) throw new Error('Exchange 庫存不足。')
  if (kind === 'approve' && snapshot.allowances[index] >= quote.amountIn) throw new Error('allowance 已足夠，請直接檢查交換摘要。')
  if (kind === 'swap' && snapshot.allowances[index] < quote.amountIn) throw new Error('allowance 不足，請先完成 approve 授權。')
  // TeachingToken 使用標準 OpenZeppelin ERC20，approve 會覆寫既有 allowance；不需先歸零。
  const approveRequest = { account: session.address, address: quote.tokenIn.address, abi: teachingTokenAbi, functionName: 'approve' as const, args: [exchange.address, quote.amountIn] as const }
  const swapRequest = { account: session.address, address: exchange.address, abi: exchangeAbi, functionName: 'swap' as const, args: [quote.tokenIn.address, quote.tokenOut.address, quote.amountIn, quote.amountOut] as const }
  const result = kind === 'approve' ? (await client.simulateContract(approveRequest)).result : (await client.simulateContract(swapRequest)).result
  if (kind === 'approve' ? result !== true : result !== quote.amountOut) throw new Error('合約模擬結果不符，已停止送出。')
  const [estimate, price] = await Promise.all([
    kind === 'approve' ? client.estimateContractGas(approveRequest) : client.estimateContractGas(swapRequest), client.getGasPrice(),
  ])
  const gas = (estimate * 120n + 99n) / 100n
  const gasPrice = (price * 120n + 99n) / 100n
  if (snapshot.ethBalance < gas * gasPrice) throw new Error('Sepolia ETH Gas 不足，請至 Faucet 準備資源。')
  await assertSession(session)
  return { ...quote, kind, snapshot, gas, gasPrice, to: kind === 'approve' ? approveRequest.address : swapRequest.address, data: kind === 'approve' ? encodeFunctionData(approveRequest) : encodeFunctionData(swapRequest) }
}
