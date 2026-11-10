import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'
import { INITIAL_SUPPLY, TOKENS } from '../../scripts/contracts/spec.ts'

// Preparation only. Future remote execution must pass the documented RPC preflight.
export default buildModule('TeachingTokens', (m) => {
  const initialHolder = m.getParameter('initialHolder')
  const [dplt, assetA, assetB] = TOKENS.map(({ id, name, symbol }) =>
    m.contract('TeachingToken', [name, symbol, initialHolder, INITIAL_SUPPLY], { id }),
  )
  return { dplt, assetA, assetB }
})
