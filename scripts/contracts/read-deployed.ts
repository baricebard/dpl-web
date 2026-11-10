import { createPublicClient, http } from 'viem'
import { tokens, teachingTokenAbi, tokenSupply } from '../../src/config/tokens.ts'

// 唯讀證據工具：不含錢包、signer、部署或發送 API。
const client = createPublicClient({ transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 8000, retryCount: 0 }) })
console.log('Read-only Sepolia verification:', new Date().toISOString())
if (await client.getChainId() !== 11155111) throw new Error('RPC chain mismatch')
for (const token of tokens) {
  const code = await client.getCode({ address: token.address })
  const metadata = await Promise.all((['name', 'symbol', 'decimals', 'totalSupply'] as const).map(functionName => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName })))
  console.log(JSON.stringify({ address: token.address, chainId: token.chainId, codePresent: !!code && code !== '0x', metadata }, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value))
  if (!code || code === '0x' || metadata[0] !== token.name || metadata[1] !== token.symbol || metadata[2] !== token.decimals || metadata[3] !== tokenSupply) throw new Error('Contract metadata mismatch')
}
