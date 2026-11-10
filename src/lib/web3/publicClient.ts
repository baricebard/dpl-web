import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { sepoliaRpc } from '../../config/rpc'

// 共用唯讀 Client；重試由 read 層統一管理，避免 viem 與應用程式重複重試。
export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(sepoliaRpc.url, { timeout: sepoliaRpc.timeoutMs, retryCount: 0 }),
})
