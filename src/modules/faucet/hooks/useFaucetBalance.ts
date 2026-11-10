import { useWallet } from '../../wallet'
import { useSepoliaBalance } from '../../../shared/hooks/useSepoliaBalance'

export function useFaucetBalance() {
  const wallet = useWallet()
  return useSepoliaBalance(wallet.connectionStatus === 'connected' ? wallet.address : null, wallet.chainId)
}
