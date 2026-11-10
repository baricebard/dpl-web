import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeDeployData, encodeFunctionData, parseAbi } from 'viem'
import { INITIAL_SUPPLY } from '../../scripts/contracts/spec.ts'
import { READ_METHODS, verifyDeployment } from '../../tools/verify/engine.ts'
import { parseRecord, TEACHER } from '../../tools/verify/record.ts'
import { artifact, compiled, sourceText } from './fixtures.ts'

test('in-process EDR only: actual receipts, historical/current code, mint, metadata and reduced balance', async () => {
  // Test fixture writes target only an in-process simulation; verifier receives a read-only boundary.
  const connection = await network.create({ network: 'hardhatMainnet', override: { chainId: 11155111 } })
  const provider = connection.provider
  try {
    await provider.request({ method: 'hardhat_impersonateAccount', params: [TEACHER] })
    await provider.request({ method: 'hardhat_setBalance', params: [TEACHER, '0x3635c9adc5dea00000'] })
    const input = JSON.parse(sourceText)
    for (const token of input.tokens) {
      const data = encodeDeployData({ abi: compiled.abi, bytecode: compiled.bytecode, args: token.constructorArgs })
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: TEACHER, data, gas: '0x989680' }] })
      const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { contractAddress: string; blockNumber: string; blockHash: string }
      Object.assign(input.records[token.id], { hash, contractAddress: receipt.contractAddress, blockNumber: BigInt(receipt.blockNumber).toString(), blockHash: receipt.blockHash })
    }
    // Simulated subsequent transfer: correct deployment must still pass with reduced teacher balance.
    await provider.request({ method: 'eth_sendTransaction', params: [{ from: TEACHER, to: input.records.DPLT.contractAddress, gas: '0x100000', data: encodeFunctionData({ abi: parseAbi(['function transfer(address,uint256) returns (bool)']), functionName: 'transfer', args: ['0x1111111111111111111111111111111111111111', 123n] }) }] })
    const reads: string[] = []
    const result = await verifyDeployment(parseRecord(JSON.stringify(input)), artifact, async (method, params) => {
      assert((READ_METHODS as readonly string[]).includes(method)); reads.push(method)
      return provider.request({ method, params: [...params] })
    })
    assert.equal(result.status, '通過', JSON.stringify(result.tokens.map(t => t.checks.filter(c => c.status !== '通過'))))
    assert.equal(result.tokens[0].checks.find(c => c.name.startsWith('教師目前'))?.actual, INITIAL_SUPPLY - 123n)
    assert(reads.length > 20)
  } finally { await connection.close() }
})
