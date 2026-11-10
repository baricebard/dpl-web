import type { Address, Hash } from 'viem'
import type { TeachingToken } from '../../../config/tokens'
import type { TransactionSession } from '../../wallet/types'

export type TransactionStatus = 'idle' | 'validating' | 'awaiting-wallet' | 'submitted' | 'confirming' | 'success' | 'failed' | 'unknown'
export interface TokenBalance { token: TeachingToken; balance?: bigint; error?: string }
export interface TokenSnapshot { balances: TokenBalance[]; updatedAt: number }
export interface TransferInput { tokenId: string; recipient: string; amount: string }
export interface TransferSummary {
  session: TransactionSession; token: TeachingToken; recipient: Address; amount: bigint
  gas: bigint; gasPrice: bigint; balance: bigint; ethBalance: bigint; createdAt: number
}
export interface TransactionRecord {
  account: Address; chainId: 11155111; token: TeachingToken; recipient: Address; amount: bigint
  originalHash: Hash; hash: Hash; replacement?: string
}
export interface TransferState {
  status: TransactionStatus; previousTransactions?: TransactionRecord[]; summary?: TransferSummary; transaction?: TransactionRecord; message?: string
}
