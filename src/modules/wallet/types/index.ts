import type { Address } from 'viem'
import type { WalletProvider } from '../../../lib/web3/provider'

export interface TransactionSession {
  address: Address
  chainId: 11155111
  provider: WalletProvider
  isCurrent(): boolean
}

export type ConnectionStatus = 'unavailable' | 'disconnected' | 'connecting' | 'connected'
export interface WalletState {
  address: Address | null
  chainId: number | null
  connectionStatus: ConnectionStatus
  isSepolia: boolean
  canTransact: boolean
  isBusy: boolean
  error: string | null
}
export interface WalletApi extends WalletState {
  captureTransactionSession(): TransactionSession
  connect(): Promise<void>
  disconnect(): void
  switchToSepolia(): Promise<void>
}
