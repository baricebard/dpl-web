import type { Address, Hash, Hex } from 'viem'
import type { TransactionSession } from '../../wallet/types'
import type { TransactionStatus } from '../../token'

export type AmmOperation = 'swap' | 'add' | 'remove'
export type AmmKind = AmmOperation | 'approveDPLT' | 'approveA'
export interface AmmInput { operation: AmmOperation; tokenIndex: 0 | 1; amount: string; slippage: string }
export interface AmmSnapshot {
  session: TransactionSession; reserves: readonly [bigint, bigint]; supply: bigint; lp: bigint
  balances: readonly bigint[]; allowances: readonly bigint[]; ethBalance: bigint; blockNumber: bigint; updatedAt: number
}
export interface AmmPreview {
  session: TransactionSession; input: AmmInput; snapshot: AmmSnapshot; amount: bigint; slippageBps: bigint
  desired: readonly [bigint, bigint]; amounts: readonly [bigint, bigint]; minima: readonly [bigint, bigint]
  liquidity: bigint; minLiquidity: bigint; amountOut: bigint; minAmountOut: bigint; createdAt: number
  fixed?: { amountOut?: bigint; error?: string }; feeNumerator: bigint
}
export interface AmmSummary extends AmmPreview { kind: AmmKind; deadline: bigint; gas: bigint; gasPrice: bigint; to: Address; data: Hex }
export interface AmmTransaction {
  kind: AmmKind; account: Address; chainId: 11155111; originalHash?: Hash; to: Address; data: Hex
  summary: AmmSummary; receiptStatus?: 'success' | 'reverted'; actual?: readonly bigint[]
}
export interface AmmState {
  status: TransactionStatus; busy: boolean; loading: boolean; message?: string; error?: string
  snapshot?: AmmSnapshot; preview?: AmmPreview; summary?: AmmSummary; transaction?: AmmTransaction; history: AmmTransaction[]
}
