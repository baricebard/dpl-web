import { useContext } from 'react'
import { WalletContext } from '../providers/WalletContext'

export function useWallet() {
  const wallet = useContext(WalletContext)
  if (!wallet) throw new Error('useWallet requires WalletProvider')
  return wallet
}
