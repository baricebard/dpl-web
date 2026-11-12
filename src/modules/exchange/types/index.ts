import type { Address, Hash, Hex } from 'viem'
import type { TeachingToken } from '../../../config/tokens'
import type { TransactionStatus } from '../../token'
import type { TransactionSession } from '../../wallet/types'

export type ExchangeKind = 'approve' | 'swap'
export interface ExchangeInput { tokenIn: string; tokenOut: string; amount: string }
export interface ExchangeTerms { tokenIn: TeachingToken; tokenOut: TeachingToken; amountIn: bigint }
export interface ExchangeSnapshot {
  session: TransactionSession; balances: bigint[]; reserves: bigint[]; allowances: bigint[]
  ethBalance: bigint; paused: boolean; updatedAt: number
}
export interface ExchangeQuote extends ExchangeTerms { session: TransactionSession; amountOut: bigint; createdAt: number }
export interface ExchangeSummary extends ExchangeQuote {
  kind: ExchangeKind; snapshot: ExchangeSnapshot; gas: bigint; gasPrice: bigint; to: Address; data: Hex
}
export interface ExchangeTransaction {
  kind: ExchangeKind; account: Address; chainId: 11155111; tokenIn: TeachingToken; tokenOut: TeachingToken
  amountIn: bigint; amountOut: bigint; minAmountOut: bigint; to: Address; data: Hex
  originalHash: Hash; hash: Hash; receiptStatus?: 'success' | 'reverted'; received?: bigint
}
export interface ExchangeStep { status: TransactionStatus; message?: string; transaction?: ExchangeTransaction }
export interface ExchangeState {
  approve: ExchangeStep; swap: ExchangeStep; summary?: ExchangeSummary; quote?: ExchangeQuote
  data?: ExchangeSnapshot; loading: boolean; error?: string; busy: boolean; history: ExchangeTransaction[]
}
