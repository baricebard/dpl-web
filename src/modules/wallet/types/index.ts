import type { Address } from 'viem'

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
  connect(): Promise<void>
  disconnect(): void
  switchToSepolia(): Promise<void>
}
