import { getAddress, parseEther } from 'viem'
import plan from '../../docs/12-fixed-exchange-plan.json' with { type: 'json' }
import { DEPLOYER } from './config.ts'

export const EXCHANGE_ARGS = [plan.dplt, plan.assetA, plan.assetB, plan.administrator].map(a => getAddress(a))
if (EXCHANGE_ARGS[3] !== DEPLOYER || plan.chainId !== 11155111) throw new Error('Exchange plan mismatch')
export const RESERVES = [
  { id: 'DPLT', address: EXCHANGE_ARGS[0], target: parseEther('1000') },
  { id: 'DPLT-A', address: EXCHANGE_ARGS[1], target: parseEther('30000') },
  { id: 'DPLT-B', address: EXCHANGE_ARGS[2], target: parseEther('6666') },
] as const
export type ReserveId = typeof RESERVES[number]['id']
