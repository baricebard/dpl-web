import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { discoverMetaMask } from '../../../lib/web3/provider'
import { createWalletStore } from './walletStore'
import { WalletContext } from './WalletContext'

export function WalletProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWalletStore)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    const stop = discoverMetaMask(store.attach)
    return () => { stop(); store.destroy() }
  }, [store])
  return <WalletContext.Provider value={{ ...state, captureTransactionSession: store.captureTransactionSession, connect: store.connect, disconnect: store.disconnect, switchToSepolia: store.switchToSepolia }}>{children}</WalletContext.Provider>
}
