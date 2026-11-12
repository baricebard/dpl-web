import { getAddress, parseUnits } from 'viem'
import { DEPLOYER } from './config.ts'
import { tokens } from '../../src/config/tokens.ts'

export const AMM_ARGS = [tokens[0].address, tokens[1].address, DEPLOYER] as const
export const AMM_KEY = `dpl-amm-initial-v1:${DEPLOYER}`
export const AMM_TOKENS = [
  { symbol: 'DPLT', address: AMM_ARGS[0], amount: parseUnits('100', 18) },
  { symbol: 'DPLT-A', address: AMM_ARGS[1], amount: parseUnits('3000', 18) },
] as const
export function integerSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('Negative sqrt')
  if (n < 2n) return n
  let x = n, y = (x + 1n) / 2n
  while (y < x) { x = y; y = (x + n / x) / 2n }
  return x
}
export const LP_TOTAL = integerSqrt(AMM_TOKENS[0].amount * AMM_TOKENS[1].amount)
export const LP_LOCKED = 1000n
export const LP_TEACHER = LP_TOTAL - LP_LOCKED
export const LOCKED_ADDRESS = getAddress('0x000000000000000000000000000000000000dead')
export const liquidityArgs = (expires: bigint) => [AMM_TOKENS[0].amount, AMM_TOKENS[1].amount, AMM_TOKENS[0].amount, AMM_TOKENS[1].amount, LP_TEACHER, expires] as const
