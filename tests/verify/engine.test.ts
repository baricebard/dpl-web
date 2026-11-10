import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { decodeFunctionData, encodeFunctionResult, type Hex } from 'viem'
import { abi, aggregate, compareRuntime, READ_METHODS, serialize, verifyDeployment } from '../../tools/verify/engine.ts'
import { parseRecord } from '../../tools/verify/record.ts'
import { artifact, fixture, record, sourceText } from './fixtures.ts'

test('records: validate fixed specs, constructor, provenance, unique IDs and file size before RPC', () => {
  assert.equal(record.tokens.length, 3)
  for (const change of [
    (r: Record<string, unknown>) => { r.chainId = 1 },
    (r: Record<string, unknown>) => { r.initialHolder = '0x0000000000000000000000000000000000000000' },
    (r: Record<string, unknown>) => { r.tokens = [] },
  ]) {
    const input = JSON.parse(sourceText); change(input)
    assert.throws(() => parseRecord(JSON.stringify(input)))
  }
  assert.throws(() => parseRecord('{'))
  assert.throws(() => parseRecord(' '.repeat(129 * 1024)))
  const duplicate = JSON.parse(sourceText); duplicate.tokens[1] = duplicate.tokens[0]
  assert.throws(() => parseRecord(JSON.stringify(duplicate)), /缺少或重複/)
  const wrongSupply = JSON.parse(sourceText); wrongSupply.tokens[0].constructorArgs[3] = '1'
  assert.throws(() => parseRecord(JSON.stringify(wrongSupply)), /constructor/)
})

test('complete reads pass; lower current holder balance is an observation, not a failure', async () => {
  const f = fixture(), result = await verifyDeployment(record, artifact, f.rpc)
  assert.equal(result.status, '通過')
  assert(result.tokens.every(t => t.status === '通過'))
  assert.equal(result.task06Ready, false)
  for (const token of result.tokens) assert.equal(token.checks.find(c => c.name.startsWith('教師目前'))?.actual, 900n)
  assert(f.calls.every(c => (READ_METHODS as readonly string[]).includes(c.method)))
  const exported = JSON.parse(serialize(result))
  assert.equal(exported.tokens[0].checks.find((c: { name: string }) => c.name.startsWith('教師目前')).actual, '900')
  assert(exported.evidence.every((e: { startedAt: string; finishedAt: string }) => e.startedAt && e.finishedAt))
  const snapshots = f.calls.filter(c => c.method === 'eth_call').map(c => c.params[1])
  assert.equal(new Set(snapshots).size, 1)
})

test('wrong chain stops after eth_chainId; cannot validate wrong-chain contracts', async () => {
  const f = fixture((method, _, value) => method === 'eth_chainId' ? '0x1' : value)
  const result = await verifyDeployment(record, artifact, f.rpc)
  assert.equal(result.status, '失敗'); assert.equal(f.calls.length, 1)
  assert(result.tokens.every(t => t.checks.every(c => c.status === '尚未驗證')))
})

test('RPC failure is unverified, not reverted/zero balance; export contains error and request', async () => {
  const result = await verifyDeployment(record, artifact, async () => { throw new Error('HTTP 403 / CORS') })
  assert.equal(result.status, '尚未驗證')
  assert.equal(result.evidence[0].method, 'eth_chainId')
  assert.match(result.evidence[0].error!, /403/)
})

for (const mode of ['reverted', 'wrong-address', 'no-code', 'metadata-only-bytecode-difference', 'missing-mint', 'wrong-mint-recipient', 'wrong-supply', 'wrong-name', 'reorg']) {
  test(`${mode}: an actual mismatch fails even if other calls succeed`, async () => {
    const f = fixture((method, params, value) => {
      if (method === 'eth_getTransactionReceipt') {
        const r = structuredClone(value) as { status: string; contractAddress: string; logs: { topics: string[] }[] }
        if (mode === 'reverted') r.status = '0x0'
        if (mode === 'wrong-address') r.contractAddress = record.initialHolder
        if (mode === 'missing-mint') r.logs = []
        if (mode === 'wrong-mint-recipient') r.logs[0].topics[2] = '0x' + '0'.repeat(24) + '11'.repeat(20)
        return r
      }
      if (method === 'eth_getCode' && mode === 'no-code') return '0x'
      if (method === 'eth_getCode' && mode === 'metadata-only-bytecode-difference') return (value as string).slice(0, -4) + 'ffff'
      if (method === 'eth_getBlockByNumber' && params[0] === '0xc65d40' && mode === 'reorg') return { ...(value as object), hash: '0x' + 'cd'.repeat(32) }
      if (method === 'eth_call') {
        const { functionName } = decodeFunctionData({ abi, data: (params[0] as { data: Hex }).data })
        if (mode === 'wrong-supply' && functionName === 'totalSupply') return encodeFunctionResult({ abi, functionName, result: 1n })
        if (mode === 'wrong-name' && functionName === 'name') return encodeFunctionResult({ abi, functionName, result: 'Incorrect' })
      }
      return value
    })
    const result = await verifyDeployment(record, artifact, f.rpc)
    assert.equal(result.status, '失敗')
    assert(result.tokens.some(t => t.status === '失敗'))
  })
}

for (const mode of ['null-receipt', 'receipt-rpc-fails', 'bad-chain-response', 'missing-artifact', 'call-revert', 'snapshot-unavailable']) {
  test(`${mode}: missing evidence stays unverified`, async () => {
    const f = fixture((method, _, value) => {
      if (method === 'eth_getTransactionReceipt' && mode === 'null-receipt') return null
      if (method === 'eth_getTransactionReceipt' && mode === 'receipt-rpc-fails') throw new Error('timeout')
      if (method === 'eth_chainId' && mode === 'bad-chain-response') return null
      if (method === 'eth_call' && mode === 'call-revert') throw new Error('execution reverted')
      if (method === 'eth_getBlockByNumber' && mode === 'snapshot-unavailable') return null
      return value
    })
    const result = await verifyDeployment(record, mode === 'missing-artifact' ? { available: false, error: 'Missing Hardhat artifact' } : artifact, f.rpc)
    assert.equal(result.status, '尚未驗證')
    assert(result.tokens.every(t => t.status === '尚未驗證'))
  })
}

test('duplicate contract addresses fail common check', async () => {
  const input = structuredClone(record); input.tokens[1].address = input.tokens[0].address
  const f = fixture(); const result = await verifyDeployment(input, artifact, f.rpc)
  assert.equal(result.checks[0].status, '失敗')
})

test('an individual receipt timeout does not mark the other two contracts unverified', async () => {
  const f = fixture((method, params, value) => {
    if (method === 'eth_getTransactionReceipt' && params[0] === record.tokens[0].hash) throw new Error('one receipt timeout')
    return value
  })
  const result = await verifyDeployment(record, artifact, f.rpc)
  assert.deepEqual(result.tokens.map(t => t.status), ['尚未驗證', '通過', '通過'])
})

test('chain switch at the end invalidates all contract results', async () => {
  let chainReads = 0
  const f = fixture((method, _, value) => method === 'eth_chainId' && ++chainReads > 1 ? '0x1' : value)
  const result = await verifyDeployment(record, artifact, f.rpc)
  assert(result.tokens.every(t => t.status === '失敗'))
})

test('compiler mismatch fails; rebuilt artifact hashes are disclosed and do not replace full runtime comparison', async () => {
  const changed = structuredClone(artifact); changed.provenance!.compiler = 'different'
  assert.equal((await verifyDeployment(record, changed, fixture().rpc)).status, '失敗')
  const rebuilt = structuredClone(artifact); rebuilt.provenance!.artifactSha256 = '0'.repeat(64)
  const result = await verifyDeployment(record, rebuilt, fixture().rpc)
  assert.equal(result.status, '通過')
  assert.equal((result.checks.find(c => c.name === '本機編譯產物與設定')?.actual as { hashesMatchOriginalRecord: boolean }).hashesMatchOriginalRecord, false)
  assert.equal(compareRuntime('0x60010002', '0x60010003').equal, false)
  assert.equal(aggregate([{ status: '失敗' }, { status: '尚未驗證' }]), '失敗')
})

test('verification entry points never import wallet/deployment engine or expose signing methods', () => {
  for (const path of ['tools/verify/main.tsx', 'tools/verify/client.ts', 'tools/verify/engine.ts', 'tools/verify/record.ts']) {
    const text = readFileSync(path, 'utf8')
    assert(!/eth_sendTransaction|eth_sendRawTransaction|personal_sign|eth_signTypedData|createWalletClient|window\.ethereum|tools\/deploy|deploy\/engine/.test(text), path)
  }
})
