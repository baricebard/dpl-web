import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

// Preparation only. Task 08B must verify RPC chain ID, reviewed token identities and
// initialization safety. Deployment neither approves nor transfers any assets.
export default buildModule('DPLAMMPool', (m) => {
  const pool = m.contract('DPLAMMPool', [m.getParameter('dplt'), m.getParameter('assetA')])
  return { pool }
})
