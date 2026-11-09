import { createContext } from 'react'
import type { WalletApi } from '../types'

export const WalletContext = createContext<WalletApi | null>(null)
