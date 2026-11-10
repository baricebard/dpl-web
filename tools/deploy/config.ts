import { getAddress, isAddress } from 'viem'
import { INITIAL_SUPPLY, TOKENS, SEPOLIA_CHAIN_ID } from '../../scripts/contracts/spec.ts'

const publicAddress = '0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02'
if (!isAddress(publicAddress)) throw new Error('Invalid public deployment address')
export const DEPLOYER = getAddress(publicAddress)
export { INITIAL_SUPPLY, TOKENS, SEPOLIA_CHAIN_ID }
export type TokenId = typeof TOKENS[number]['id']
export function constructorArgs(id: TokenId) {
  const token = TOKENS.find(token => token.id === id)
  if (!token) throw new Error('Unknown token')
  return [token.name, token.symbol, DEPLOYER, INITIAL_SUPPLY] as const
}
export function assertLocal() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    throw new Error('部署工具僅限 localhost 開發模式')
  }
}
