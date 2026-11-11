import { getAddress, isAddress, zeroAddress } from 'viem'
import { SEPOLIA_CHAIN_ID } from './spec.ts'

/** Offline public-parameter validation; no RPC, signer, deployment or asset movement. */
export function prepareExchangePlan(chainId: number, dplt: string, assetA: string, assetB: string, administrator: string) {
  if (chainId !== SEPOLIA_CHAIN_ID) throw new Error('Expected Ethereum Sepolia (11155111)')
  const addresses = [dplt, assetA, assetB, administrator].map((value) => {
    if (!isAddress(value) || getAddress(value) === zeroAddress) throw new Error('Expected a valid nonzero address')
    return getAddress(value)
  })
  if (new Set(addresses.slice(0, 3)).size !== 3) throw new Error('Expected three distinct token addresses')
  const [token, a, b, owner] = addresses
  return {
    chainId: SEPOLIA_CHAIN_ID,
    contract: 'DPLFixedExchange' as const,
    constructorArgs: [token, a, b, owner] as const,
    parameters: { DPLFixedExchange: { dplt: token, assetA: a, assetB: b, administrator: owner } },
    deployedAddress: null,
  }
}
