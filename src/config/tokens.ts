import { erc20Abi, getAddress } from 'viem'

// 標準 ABI 對應 TeachingToken.sol 繼承的 OpenZeppelin ERC20；唯一前端 ABI。
export const teachingTokenAbi = erc20Abi
export const tokenSupply = 1_000_000n * 10n ** 18n
export const initialTeacher = getAddress('0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02')
export const tokens = [
  { symbol: 'DPLT', name: 'DeFi Portfolio Lab Token', address: '0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e' },
  { symbol: 'DPLT-A', name: 'DeFi Portfolio Lab Asset A', address: '0x53Ac929866423479c7C5746F76F398e8b3907d6E' },
  { symbol: 'DPLT-B', name: 'DeFi Portfolio Lab Asset B', address: '0xA8E2854c62A46329838f9922587adBbEb007072f' },
].map(token => {
  const address = getAddress(token.address)
  return { ...token, address, chainId: 11155111 as const, decimals: 18,
    id: `11155111:${address.toLowerCase()}`, explorerUrl: `https://sepolia.etherscan.io/token/${address}` }
})
export type TeachingToken = (typeof tokens)[number]
