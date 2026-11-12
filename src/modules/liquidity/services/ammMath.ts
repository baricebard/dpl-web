import { formatUnits, parseUnits } from 'viem'
import { amm } from '../../../config/amm'

export function parseAmount(value: string) {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error('數量需為正十進位數字，小數最多 18 位。')
  const amount = parseUnits(value, 18)
  if (amount <= 0n || amount > amm.maxReserve) throw new Error('數量必須大於零且不超過合約安全上限。')
  return amount
}
export function slippageBps(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('滑價需為 0% 至 5%，最多兩位小數。')
  const bps = parseUnits(value, 2)
  if (bps > 500n) throw new Error('滑價需為 0% 至 5%。')
  return bps
}
export function minimum(amount: bigint, bps: bigint) {
  if (bps < 0n || bps > 500n) throw new Error('滑價超過允許範圍。')
  const result = amount * (10_000n - bps) / 10_000n
  if (result <= 0n) throw new Error('最低可接受數量向下取整為零，請增加數量。')
  return result
}
export function addEstimate(desired: readonly [bigint, bigint], reserves: readonly [bigint, bigint], supply: bigint) {
  const [x, y] = reserves
  if (x <= 0n || y <= 0n || supply < 1000n) throw new Error('池尚未初始化或儲備不足，不提供首次注資。')
  const optimalA = desired[0] * y / x
  const amounts = optimalA <= desired[1] ? [desired[0], optimalA] as const : [desired[1] * x / y, desired[1]] as const
  if (amounts.some((amount, i) => amount <= 0n || amount + reserves[i] > amm.maxReserve)) throw new Error('注入量為零或超過池安全上限。')
  const a = amounts[0] * supply / x, b = amounts[1] * supply / y
  const liquidity = a < b ? a : b
  if (liquidity <= 0n) throw new Error('預計取得 LP 為零，請增加數量。')
  return { amounts, liquidity }
}
export function removeEstimate(liquidity: bigint, reserves: readonly [bigint, bigint], supply: bigint, owned: bigint) {
  if (liquidity <= 0n || liquidity > owned || supply < 1000n || liquidity > supply - 1000n) throw new Error('LP 餘額不足或涉及永久鎖定 LP。')
  const amounts = [liquidity * reserves[0] / supply, liquidity * reserves[1] / supply] as const
  if (amounts.some(amount => amount <= 0n)) throw new Error('預期取回數量為零。')
  return amounts
}
// 所有比率以 bigint 有理數計算；僅最後顯示時截斷至六位小數。
export function ratio(numerator: bigint, denominator: bigint) {
  return denominator > 0n ? formatUnits(numerator * 1_000_000n / denominator, 6) : '尚未確認'
}
export const share = (lp: bigint, supply: bigint) => ratio(lp * 100n, supply)
export function swapMetrics(amount: bigint, out: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (amount <= 0n || reserveIn <= 0n || out >= reserveOut) throw new Error('儲備或報價不安全。')
  // 排除 0.3% 費用，依曲線造成的平均成交價下降；整數捨入另有極小影響。
  const effective = amount * 997n
  return { before: ratio(reserveOut, reserveIn), average: ratio(out, amount),
    after: ratio(reserveOut - out, reserveIn + amount), impact: ratio(effective * 100n, reserveIn * 1000n + effective) }
}
export function percentLP(owned: bigint, percent: 25 | 50 | 75 | 100) { return formatUnits(owned * BigInt(percent) / 100n, 18) }
