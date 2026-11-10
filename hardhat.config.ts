import { createRequire } from 'node:module'
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem'
import { defineConfig } from 'hardhat/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [hardhatToolboxViem],
  paths: { sources: './contracts', tests: { nodejs: './test/contracts' } },
  solidity: {
    version: '0.8.38',
    path: require.resolve('solc/soljson.js'),
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  // Intentionally no HTTP networks, remote signers, secrets or public deployment command.
  networks: { hardhatMainnet: { type: 'edr-simulated', chainType: 'l1' } },
})
