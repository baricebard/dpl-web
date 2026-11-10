import { readFileSync } from 'node:fs'
import { decodeFunctionData, encodeFunctionResult, encodeEventTopics, toHex, zeroAddress, type Hex } from 'viem'
import { abi, type ArtifactBundle, type ReadRpc, type ReadMethod } from '../../tools/verify/engine.ts'
import { parseRecord } from '../../tools/verify/record.ts'
import { INITIAL_SUPPLY } from '../../scripts/contracts/spec.ts'

export const sourceText = readFileSync('docs/09-sepolia-deployment-record.json', 'utf8')
export const record = parseRecord(sourceText)
export const compiled = JSON.parse(readFileSync('artifacts/contracts/TeachingToken.sol/TeachingToken.json', 'utf8'))
export const artifact: ArtifactBundle = { available: true, deployedBytecode: compiled.deployedBytecode, provenance: record.provenance }
export type Mutate = (method: ReadMethod, params: readonly unknown[], result: unknown) => unknown
export function fixture(mutate?: Mutate) {
  const calls: { method: ReadMethod; params: readonly unknown[] }[] = []
  const rpc: ReadRpc = async (method, params) => {
    calls.push({ method, params })
    let result: unknown
    if (method === 'eth_chainId') result = '0xaa36a7'
    else if (method === 'eth_getBlockByNumber') {
      const token = record.tokens.find(t => toHex(BigInt(t.reportedBlockNumber)) === params[0])
      result = { number: params[0] === 'latest' ? '0xc65d40' : params[0], hash: token?.reportedBlockHash ?? ('0x' + 'ab'.repeat(32)), timestamp: '0x69000000' }
    } else if (method === 'eth_getTransactionReceipt') {
      const t = record.tokens.find(t => t.hash === params[0])!
      result = { status: '0x1', transactionHash: t.hash, from: record.deployer, to: null, contractAddress: t.address,
        blockNumber: toHex(BigInt(t.reportedBlockNumber)), blockHash: t.reportedBlockHash,
        logs: [{ address: t.address, topics: encodeEventTopics({ abi, eventName: 'Transfer', args: { from: zeroAddress, to: record.initialHolder } }), data: toHex(INITIAL_SUPPLY, { size: 32 }) }] }
    } else if (method === 'eth_getCode') result = artifact.deployedBytecode
    else if (method === 'eth_call') {
      const call = params[0] as { to: string; data: Hex }
      const token = record.tokens.find(t => t.address === call.to)!
      const { functionName } = decodeFunctionData({ abi, data: call.data })
      const values = { name: token.name, symbol: token.symbol, decimals: 18, totalSupply: INITIAL_SUPPLY, balanceOf: 900n }
      result = encodeFunctionResult({ abi, functionName, result: values[functionName] })
    } else throw new Error('Unexpected method')
    return mutate ? mutate(method, params, result) : result
  }
  return { rpc, calls }
}
