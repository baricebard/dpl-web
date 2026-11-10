import { getAddress, isAddress, zeroAddress } from 'viem'

export const SEPOLIA_CHAIN_ID = 11155111
export const INITIAL_SUPPLY = 1_000_000n * 10n ** 18n
export const TOKENS = [
  { id: 'DPLT', name: 'DeFi Portfolio Lab Token', symbol: 'DPLT' },
  { id: 'DPLTA', name: 'DeFi Portfolio Lab Asset A', symbol: 'DPLT-A' },
  { id: 'DPLTB', name: 'DeFi Portfolio Lab Asset B', symbol: 'DPLT-B' },
] as const

/** Public parameters only. This function neither connects nor signs. */
export function prepareSepoliaPlan(chainId: number, initialHolder: string) {
  if (chainId !== SEPOLIA_CHAIN_ID) throw new Error('Expected Ethereum Sepolia (11155111)')
  if (!isAddress(initialHolder) || getAddress(initialHolder) === zeroAddress) {
    throw new Error('Initial holder must be a valid nonzero address')
  }
  return TOKENS.map(({ id, name, symbol }) => ({
    id,
    chainId: SEPOLIA_CHAIN_ID,
    contract: 'TeachingToken' as const,
    constructorArgs: [name, symbol, getAddress(initialHolder), INITIAL_SUPPLY] as const,
  }))
}
