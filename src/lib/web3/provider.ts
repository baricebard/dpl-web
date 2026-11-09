import type { EIP1193Provider } from 'viem'

export type WalletProvider = Pick<EIP1193Provider, 'on' | 'removeListener'> & {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>
  isMetaMask?: boolean
  providers?: WalletProvider[]
  isBraveWallet?: boolean
  isRabby?: boolean
}

type Announcement = { info: { rdns: string }; provider: WalletProvider }

// EIP-6963 metadata identifies the announced wallet; it is not a security attestation.
export function discoverMetaMask(onProvider: (provider: WalletProvider) => void) {
  let announced = false
  let selected = false
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<Announcement>).detail
    if (!detail?.provider?.request || !detail.info?.rdns) return
    announced = true
    if (detail.info.rdns === 'io.metamask' && !selected) {
      selected = true
      onProvider(detail.provider)
    }
  }
  window.addEventListener('eip6963:announceProvider', announce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  // Legacy fallback only when no wallet announced; ambiguous injected lists are not selected.
  const timer = window.setTimeout(() => {
    const ethereum = (window as Window & { ethereum?: WalletProvider }).ethereum
    const candidates = ethereum?.providers ?? (ethereum ? [ethereum] : [])
    if (!announced && !selected && candidates.length === 1) {
      const candidate = candidates[0]
      if (candidate.isMetaMask && !candidate.isBraveWallet && !candidate.isRabby) {
        selected = true
        onProvider(candidate)
      }
    }
  }, 300)
  return () => {
    clearTimeout(timer)
    window.removeEventListener('eip6963:announceProvider', announce)
  }
}
