import { createPublicClient, http, keccak256 } from 'viem'
import { teachingTokenRuntime } from '../../src/config/teachingTokenRuntime.ts'
import { matchesRuntime } from '../../src/lib/web3/runtimeIntegrity.ts'
import { tokens, teachingTokenAbi, tokenSupply } from '../../src/config/tokens.ts'

// 唯讀證據工具：不含錢包、signer、部署或發送 API。
const client = createPublicClient({ transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 8000, retryCount: 0 }) })
console.log('Read-only Sepolia verification:', new Date().toISOString())
if (await client.getChainId() !== 11155111) throw new Error('RPC chain mismatch')
for (const token of tokens) {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const code = await client.getCode({ address: token.address, blockNumber })
  const metadata = await Promise.all((['name', 'symbol', 'decimals', 'totalSupply'] as const).map(functionName => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName, blockNumber })))
  console.log(JSON.stringify({ address: token.address, chainId: token.chainId, blockNumber, runtimeMatches: matchesRuntime(code, teachingTokenRuntime), expectedRuntime: teachingTokenRuntime.runtimeKeccak256, actualRuntimeKeccak256: code && /^0x(?:[\da-f]{2})+$/i.test(code) ? keccak256(code) : null, actualRuntimeSize: code ? (code.length - 2) / 2 : null, metadata }, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value))
  if (!matchesRuntime(code, teachingTokenRuntime) || metadata[0] !== token.name || metadata[1] !== token.symbol || metadata[2] !== token.decimals || metadata[3] !== tokenSupply) throw new Error('Contract runtime or ERC-20 metadata mismatch')
}
