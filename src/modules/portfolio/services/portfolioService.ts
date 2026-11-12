import type { Address } from 'viem'
import { amm, ammAbi } from '../../../config/amm'
import { tokens, teachingTokenAbi } from '../../../config/tokens'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'

export type PortfolioClient = Pick<typeof sepoliaPublicClient, 'getChainId' | 'getBlockNumber' | 'readContract' | 'getBalance'>
export type Reading<T> = { value: T; error?: never } | { value?: never; error: string }
async function reading<T>(request: Promise<T>): Promise<Reading<T>> {
  try { return { value: await request } } catch { return { error: '查詢失敗，請稍後手動重新整理。' } }
}
export async function readPortfolio(address: Address, client: PortfolioClient = sepoliaPublicClient) {
  if (await client.getChainId() !== 11155111) throw new Error('查詢失敗：RPC 網路不是 Ethereum Sepolia。')
  // 不降級為 latest；不支援指定區塊的 RPC 會明確失敗，避免虛構一致性。
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const pool = { address: amm.address, abi: ammAbi, blockNumber }
  const [balances, lp, supply, reserves, eth] = await Promise.all([
    Promise.all(tokens.map(token => reading(client.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'balanceOf', args: [address], blockNumber })))),
    reading(client.readContract({ ...pool, functionName: 'balanceOf', args: [address] })),
    reading(client.readContract({ ...pool, functionName: 'totalSupply' })),
    reading(client.readContract({ ...pool, functionName: 'getReserves' })),
    reading(client.getBalance({ address, blockNumber })),
  ])
  return { address, blockNumber, balances, lp, supply, reserves, eth, updatedAt: Date.now() }
}
export type PortfolioSnapshot = Awaited<ReturnType<typeof readPortfolio>>
// 所有估值在 DPLT 的 10^-18 最小單位逐項向下取整；LP 先拆解再估值。
export function referenceValue(amount: bigint, index: number) {
  if (amount < 0n || ![0, 1, 2].includes(index)) throw new Error('無效資產數量。')
  return index === 0 ? amount : index === 1 ? amount / 30n : amount * 3n / 20n
}
export function lpUnderlying(lp: bigint, supply: bigint, reserves: readonly bigint[]) {
  if (lp < 0n || supply < lp || reserves.length !== 2 || reserves.some(r => r < 0n) || (supply === 0n && reserves.some(r => r !== 0n)) || (supply > 0n && reserves.some(r => r === 0n))) return undefined
  if (supply === 0n) return lp === 0n ? [0n, 0n] as const : undefined
  return [lp * reserves[0] / supply, lp * reserves[1] / supply] as const
}
export function portfolioValues(s: PortfolioSnapshot) {
  const underlying = s.lp.value !== undefined && s.supply.value !== undefined && s.reserves.value !== undefined ? lpUnderlying(s.lp.value, s.supply.value, s.reserves.value) : undefined
  const amounts = [...s.balances.map(b => b.value), underlying?.[0], underlying?.[1]]
  const values = amounts.map((a, i) => a === undefined ? undefined : referenceValue(a, i < 3 ? i : i - 3))
  const total = values.every(v => v !== undefined) ? values.reduce<bigint>((sum, v) => sum + (v ?? 0n), 0n) : undefined
  return { underlying, amounts, values, total }
}
// 百分比以整數基點向下取整；圖表寬度直接使用十進位字串。
export function percent(part: bigint, total: bigint) {
  if (total === 0n) return '0'
  const bps = part * 10000n / total
  return `${bps / 100n}.${(bps % 100n).toString().padStart(2, '0')}`
}
export function spotPrice(reserves: readonly bigint[]) {
  if (reserves.length !== 2 || reserves.some(r => r <= 0n)) return undefined
  const scale = 10n ** 18n
  const difference = reserves[1] - reserves[0] * 30n
  return { price: reserves[1] * scale / reserves[0], difference, deviation: (difference < 0n ? -difference : difference) * 10000n / (reserves[0] * 30n) }
}
