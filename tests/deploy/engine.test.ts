import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { network } from 'hardhat'
import { createPublicClient, custom, decodeDeployData, type Hex } from 'viem'
import { createDeploymentTool, type DeploymentArtifact } from '../../tools/deploy/engine.ts'
import { constructorArgs, DEPLOYER, INITIAL_SUPPLY, TOKENS } from '../../tools/deploy/config.ts'
import type { WalletProvider } from '../../src/lib/web3/provider.ts'

const artifact = JSON.parse(readFileSync('artifacts/contracts/TeachingToken.sol/TeachingToken.json', 'utf8')) as DeploymentArtifact
artifact.provenance = { commit: 'local-test-only', compiler: '0.8.38', openZeppelin: '5.6.1' }
async function fixture() {
  // In-process EDR only. The override labels the LOCAL simulation Sepolia to exercise guards.
  const connection = await network.create({ network: 'hardhatMainnet', override: { chainId: 11155111 } })
  await connection.provider.request({ method: 'hardhat_impersonateAccount', params: [DEPLOYER] })
  await connection.provider.request({ method: 'hardhat_setBalance', params: [DEPLOYER, '0x3635c9adc5dea00000'] })
  let account = DEPLOYER, chain = '0xaa36a7', raw: string | null = null
  let sendError: unknown, receiptMode = 'normal', tamper = '', gasLow = false
  let beforeSend: (() => void) | undefined
  const calls: { method: string; params?: readonly unknown[] }[] = []
  const listeners = new Map<string, Set<() => void>>()
  const provider: WalletProvider = {
    async request(args) {
      calls.push(args)
      if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') return [account]
      if (args.method === 'eth_chainId') return chain
      if (args.method === 'eth_getBalance' && gasLow) return '0x0'
      if (args.method === 'eth_gasPrice') return '0x77359400' // Stable estimate for confirmation tests.
      if (args.method === 'eth_sendTransaction') {
        beforeSend?.()
        if (sendError) throw sendError
      }
      if (args.method === 'eth_getTransactionReceipt' && receiptMode === 'timeout') return null
      const result = await connection.provider.request({ method: args.method, params: args.params as unknown[] })
      if (args.method === 'eth_getTransactionReceipt' && result && receiptMode === 'reverted') return { ...result as object, status: '0x0' }
      if (args.method === 'eth_getCode' && tamper === 'code') return '0x00'
      if (args.method === 'eth_call' && tamper === 'metadata') return '0x' + '0'.repeat(64)
      return result
    },
    on(event: string, fn: () => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn) },
    removeListener(event: string, fn: () => void) { listeners.get(event)?.delete(fn) },
  }
  const journal = { read: () => raw, write: (value: string) => { raw = value } }
  const tool = createDeploymentTool(provider, artifact, journal, 40)
  const sent = () => calls.filter(c => c.method === 'eth_sendTransaction')
  return {
    tool, provider, journal, calls, sent, connection,
    wrongAccount() { account = '0x1111111111111111111111111111111111111111' },
    wrongChain() { chain = '0x1' },
    emit() { listeners.get('chainChanged')?.forEach(fn => fn()) },
    reject() { sendError = { code: 4001 } },
    uncertain() { sendError = new Error('transport timed out after possible broadcast') },
    receipt(mode: string) { receiptMode = mode }, corrupt(mode: string) { tamper = mode },
    lowGas() { gasLow = true }, beforeSend(fn: () => void) { beforeSend = fn },
    async close() { tool.destroy(); await connection.close() },
  }
}

for (const token of TOKENS) {
  test(`${token.symbol}: local EDR creation, exact parameters, receipt, runtime and balances`, async () => {
    const f = await fixture()
    try {
      assert.equal(f.sent().length, 0)
      await f.tool.connect(); await f.tool.prepare(token.id)
      assert.equal(f.tool.getSnapshot().records[token.id].status, '等待使用者確認')
      assert.equal(f.sent().length, 0)
      f.beforeSend(() => assert.equal(JSON.parse(f.journal.read()!).records[token.id].attempted, true))
      await Promise.all([f.tool.confirm(token.id), f.tool.confirm(token.id)])
      assert.equal(f.sent().length, 1)
      assert.equal(f.tool.getSnapshot().records[token.id].status, '成功')
      const tx = f.sent()[0].params![0] as { data: Hex; to?: string; value: string; from: string; chainId: string }
      assert.equal(tx.to, undefined); assert.equal(tx.value, '0x0'); assert.equal(tx.from, DEPLOYER); assert.equal(tx.chainId, '0xaa36a7')
      const decoded = decodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, data: tx.data })
      assert.deepEqual(decoded.args, constructorArgs(token.id))
      const client = createPublicClient({ transport: custom(f.connection.provider) })
      const address = f.tool.getSnapshot().records[token.id].contractAddress as Hex
      assert.equal(await client.readContract({ address, abi: artifact.abi, functionName: 'balanceOf', args: [DEPLOYER] }), INITIAL_SUPPLY)
      await assert.rejects(f.tool.prepare(token.id), /已有部署嘗試/)
      const restored = createDeploymentTool(f.provider, artifact, f.journal)
      assert.equal(restored.getSnapshot().records[token.id].hash, f.tool.getSnapshot().records[token.id].hash)
      await assert.rejects(restored.prepare(token.id), /已有部署嘗試/)
      restored.destroy()
      const exported = JSON.parse(f.tool.exportRecord())
      assert.equal(exported.deployer, DEPLOYER); assert.equal(exported.tokens.length, 3)
    } finally { await f.close() }
  })
}
for (const kind of ['account', 'chain', 'gas', 'event', 'changed-after-prepare']) {
  test(`blocks ${kind} without any send`, async () => {
    const f = await fixture()
    try {
      if (kind === 'account') f.wrongAccount()
      if (kind === 'chain') f.wrongChain()
      if (['account', 'chain'].includes(kind)) await assert.rejects(f.tool.connect())
      else {
        await f.tool.connect()
        if (kind === 'gas') { f.lowGas(); await assert.rejects(f.tool.prepare('DPLT'), /不足/) }
        else {
          await f.tool.prepare('DPLT')
          if (kind === 'event') f.emit()
          else f.wrongChain()
          await f.tool.confirm('DPLT').catch(() => {})
        }
      }
      assert.equal(f.sent().length, 0)
    } finally { await f.close() }
  })
}
for (const mode of ['reject', 'uncertain', 'reverted', 'timeout', 'code', 'metadata']) {
  test(`${mode}: distinguish failure/unknown and never retry automatically`, async () => {
    const f = await fixture()
    try {
      await f.tool.connect(); await f.tool.prepare('DPLT')
      if (mode === 'reject') f.reject()
      else if (mode === 'uncertain') f.uncertain()
      else if (mode === 'code' || mode === 'metadata') f.corrupt(mode)
      else f.receipt(mode)
      await f.tool.confirm('DPLT')
      const r = f.tool.getSnapshot().records.DPLT
      assert.equal(r.status, ['reject', 'reverted'].includes(mode) ? '失敗' : '結果未知')
      assert.equal(f.sent().length, 1)
      if (mode === 'reject') await f.tool.prepare('DPLT')
      else await assert.rejects(f.tool.prepare('DPLT'), /已有部署嘗試/)
      if (mode === 'timeout') {
        const restored = createDeploymentTool(f.provider, artifact, f.journal, 1000)
        assert.equal(restored.getSnapshot().records.DPLT.status, '結果未知')
        f.receipt('normal'); await restored.reconcile('DPLT')
        assert.equal(restored.getSnapshot().records.DPLT.status, '成功')
        restored.destroy()
      }
      assert.equal(f.sent().length, 1)
    } finally { await f.close() }
  })
}

test('corrupt/unavailable storage fails closed', async () => {
  const f = await fixture()
  try {
    assert.throws(() => createDeploymentTool(f.provider, artifact, { read: () => '{', write() {} }))
    const tool = createDeploymentTool(f.provider, artifact, { read: () => null, write() { throw new Error('quota') } })
    await tool.connect(); await assert.rejects(tool.prepare('DPLT'))
    await tool.confirm('DPLT').catch(() => {})
    assert.equal(f.sent().length, 0)
    tool.destroy()
  } finally { await f.close() }
})
