import { sepoliaPublicClient } from '../../src/lib/web3/publicClient.ts'
import { READ_METHODS, type ReadRpc } from './engine.ts'

/** No provider discovery, wallet client or signer. Reuse the existing no-key Public Client. */
export const readPublicRpc: ReadRpc = async (method, params) => {
  if (!(READ_METHODS as readonly string[]).includes(method)) throw new Error('只允許唯讀 RPC 方法')
  return sepoliaPublicClient.request({ method, params } as never)
}
