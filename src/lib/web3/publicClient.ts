import { createClient, hexToBigInt, hexToNumber, http, type Address } from 'viem'
import { sepolia } from 'viem/chains'
import { sepoliaRpc } from '../../config/rpc'

// Native ETH reads only. viem's broad public/getBalance actions also include
// unused contract-call/deployment-data helpers. Keep those out of Pages.
// Retries remain owned by the read layer.
export const sepoliaPublicClient = createClient({
  chain: sepolia,
  transport: http(sepoliaRpc.url, { timeout: sepoliaRpc.timeoutMs, retryCount: 0 }),
}).extend(client => ({
  getChainId: async () => hexToNumber(await client.request({ method: 'eth_chainId' })),
  getBalance: async ({ address, blockTag = 'latest' }: { address: Address; blockTag?: 'latest' }) =>
    hexToBigInt(await client.request({ method: 'eth_getBalance', params: [address, blockTag] })),
}))
