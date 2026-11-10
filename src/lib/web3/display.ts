import { formatEther, getAddress, isAddress } from 'viem'

export function displayEther(wei: bigint) {
  const exact = formatEther(wei)
  if (wei > 0n && wei < 1_000_000_000_000n) return '< 0.000001'
  const [whole, fraction = ''] = exact.split('.')
  const digits = fraction.slice(0, 6).replace(/0+$/, '')
  return digits ? `${whole}.${digits}` : whole
}
export function sepoliaAddressUrl(address: string | null) {
  if (!address || !isAddress(address)) return null
  return `https://sepolia.etherscan.io/address/${encodeURIComponent(getAddress(address))}`
}
