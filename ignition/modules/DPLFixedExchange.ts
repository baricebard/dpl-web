import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

// Preparation only; future remote execution must verify RPC chain ID 11155111.
// Required parameters have no deployer/account defaults. No approvals or funding.
export default buildModule('DPLFixedExchange', (m) => {
  const exchange = m.contract('DPLFixedExchange', [
    m.getParameter('dplt'),
    m.getParameter('assetA'),
    m.getParameter('assetB'),
    m.getParameter('administrator'),
  ])
  return { exchange }
})
