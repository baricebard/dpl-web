import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { network } from 'hardhat'
import { createPublicClient, custom, decodeDeployData, decodeFunctionData, encodeFunctionData, erc20Abi, encodeAbiParameters, keccak256, numberToHex, parseEther, toFunctionSelector, type Hex } from 'viem'
import { createDeploymentTool, type DeploymentArtifact } from '../../tools/deploy/engine.ts'
import { createAMMLiquidityTool } from '../../tools/deploy/amm-liquidity.ts'
import { AMM_ARGS, AMM_TOKENS, LP_TOTAL, LP_TEACHER, LP_LOCKED, integerSqrt } from '../../tools/deploy/amm-config.ts'

import { DEPLOYER } from '../../tools/deploy/config.ts'
import type { WalletProvider } from '../../src/lib/web3/provider.ts'

const artifact = JSON.parse(readFileSync('artifacts/contracts/DPLAMMPool.sol/DPLAMMPool.json', 'utf8')) as DeploymentArtifact
artifact.provenance = { commit: 'local-edr-only', compiler: '0.8.38', openZeppelin: '5.6.1' }
async function fixture() {
  const connection = await network.create({ network: 'hardhatMainnet', override: { chainId: 11155111 } })
  const rpc = (method: string, params: unknown[]) => connection.provider.request({ method, params })
  await rpc('hardhat_impersonateAccount', [DEPLOYER])
  // The prescribed token addresses occupy this teacher's creation nonces 0–2.
  await rpc('hardhat_setNonce', [DEPLOYER, '0x3'])
  await rpc('hardhat_setBalance', [DEPLOYER, numberToHex(parseEther('1000'))])
  const tokenArtifact = JSON.parse(readFileSync('artifacts/contracts/TeachingToken.sol/TeachingToken.json', 'utf8'))
  const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [DEPLOYER, 0n]))
  for (const token of AMM_TOKENS) {
    // LOCAL fixture at the prescribed public addresses, never a remote RPC.
    await rpc('hardhat_setCode', [token.address, tokenArtifact.deployedBytecode])
    await rpc('hardhat_setStorageAt', [token.address, slot, numberToHex(parseEther('1000000'), { size: 32 })])
  }
  let raw: string | null = null, fundRaw: string | null = null
  let chain = '0xaa36a7', account = DEPLOYER, sendMode = '', receiptMode = '', readMode = '', fundingPhase = false
  const listeners = new Map<string, Set<() => void>>()
  let broadcastHash: Hex | undefined, failAfterFunding = false
  const calls: { method: string; params?: readonly unknown[] }[] = []
  const provider: WalletProvider = {
    async request(args) {
      calls.push(args)
      if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') return [account]
      if (args.method === 'eth_chainId') return chain
      if (args.method === 'eth_gasPrice') return '0x77359400'
      if (args.method === 'eth_sendTransaction' && sendMode === 'reject') throw { code: 4001 }
      if (args.method === 'eth_sendTransaction' && sendMode === 'unknown') throw new Error('possible broadcast timeout')
      if (args.method === 'eth_call' && readMode === 'simulation-revert' && (args.params?.[0] as { data: string }).data.startsWith(toFunctionSelector('addLiquidity(uint256,uint256,uint256,uint256,uint256,uint256)'))) throw new Error('Mock simulation revert')
      if (args.method === 'eth_call' && readMode === 'fail') throw new Error('RPC read failed')
      if (args.method === 'eth_call' && readMode === 'reserve-fail' && ((args.params?.[0] as { data: string }).data.startsWith(toFunctionSelector('getReserves()')))) throw new Error('reserveOf unavailable')
      const result = await rpc(args.method, args.params as unknown[])
      if (args.method === 'eth_sendTransaction' && fundingPhase) {
        if (failAfterFunding) readMode = 'reserve-fail'
        if (sendMode === 'broadcast-unknown') { broadcastHash = result as Hex; throw new Error('broadcast succeeded but response lost') }
      }
      if (args.method === 'eth_getTransactionReceipt' && result && (!fundingPhase || (result as { to: string | null }).to !== null)) {
        if (receiptMode === 'timeout') return null
        if (receiptMode === 'reverted') return { ...result as object, status: '0x0' }
      }
      if (args.method === 'eth_getCode' && readMode === 'no-code') return '0x'
      if (args.method === 'eth_call' && readMode === 'wrong') return '0x' + '0'.repeat(64)
      return result
    },
    on(e: string, fn: () => void) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e)!.add(fn) },
    removeListener(e: string, fn: () => void) { listeners.get(e)?.delete(fn) },
  }
  const journal = { read: () => raw, write: (v: string) => { raw = v } }
  const fundJournal = { read: () => fundRaw, write: (v: string) => { fundRaw = v } }
  const tool = createDeploymentTool(provider, artifact, journal, 40, 'amm')
  const funding = createAMMLiquidityTool(provider, artifact, tool, fundJournal, 40)
  const client = createPublicClient({ transport: custom(connection.provider) })
  return {
    tool, funding, provider, journal, fundJournal, client, calls, rpc,
    async ready() { await this.deploy(); for (const op of ['approveDPLT', 'approveA'] as const) { await funding.prepare(op); await funding.confirm() } },
    originalHash: () => broadcastHash, failReservesAfterSend() { failAfterFunding = true },
    sent: () => calls.filter(c => c.method === 'eth_sendTransaction'),
    wrongChain() { chain = '0x1' }, wrongAccount() { account = '0x1111111111111111111111111111111111111111' },
    send(mode: string) { sendMode = mode }, receipt(mode: string) { receiptMode = mode }, read(mode: string) { readMode = mode },
    emit(event = 'chainChanged') { listeners.get(event)?.forEach(fn => fn()) },
    async deploy() { await tool.connect(); await tool.prepare('amm'); await tool.confirm('amm'); assert.equal(tool.getSnapshot().records.amm.status, '成功'); fundingPhase = true },
    async close() { tool.destroy(); funding.destroy(); await connection.close() },
  }
}

test('AMM constructor, empty reserves and actual balances, deployment provenance, duplicate click and reload', async () => {
  const f = await fixture()
  try {
    assert.equal(f.calls.length, 0)
    await f.tool.connect(); await f.tool.prepare('amm')
    await Promise.all([f.tool.confirm('amm'), f.tool.confirm('amm')])
    assert.equal(f.sent().length, 1)
    const tx = f.sent()[0].params![0] as { data: Hex; to?: string; value: string }
    assert.equal(tx.to, undefined); assert.equal(tx.value, '0x0')
    assert.deepEqual(decodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, data: tx.data }).args, AMM_ARGS)
    assert.equal(f.tool.getSnapshot().records.amm.status, '成功')
    await f.funding.refresh()
    assert.deepEqual(f.funding.getSnapshot().state!.reserves, [0n, 0n])
    assert.deepEqual(f.funding.getSnapshot().state!.actual, [0n, 0n])
    const record = JSON.parse(f.tool.exportRecord())
    assert.deepEqual(record.amm.constructorArgs, AMM_ARGS); assert.ok(record.records.amm.deployedAt)
    const restored = createDeploymentTool(f.provider, artifact, f.journal, 40, 'amm')
    await assert.rejects(restored.prepare('amm'))
    await restored.reconcile('amm'); assert.equal(restored.getSnapshot().records.amm.status, '成功'); restored.destroy()
    assert.ok(f.calls.filter(c => ['eth_getCode', 'eth_call'].includes(c.method)).every(c => c.params?.[1] === 'latest'))
  } finally { await f.close() }
})

test('exact bigint LP sqrt', () => {
  assert.equal(LP_TOTAL, 547722557505166113456n)
  assert.equal(LP_TEACHER, 547722557505166112456n)
  assert.equal(LP_LOCKED, 1000n)
  for (const n of [0n, 1n, 2n, 4n, 10n ** 70n + 123n]) {
    const r = integerSqrt(n); assert.ok(r * r <= n && (r + 1n) * (r + 1n) > n)
  }
})
for (const kind of ['chain', 'account', 'event']) test(`AMM deployment blocks ${kind}`, async () => {
  const f = await fixture()
  try {
    if (kind === 'chain') f.wrongChain()
    else if (kind === 'account') f.wrongAccount()
    else { await f.tool.connect(); await f.tool.prepare('amm'); f.emit(); await assert.rejects(f.tool.confirm('amm')); assert.equal(f.sent().length, 0); return }
    await assert.rejects(f.tool.connect()); assert.equal(f.sent().length, 0)
  } finally { await f.close() }
})
for (const i of [0, 1]) test(`actual token ${i} donation blocks initialization despite zero reserves`, async () => {
  const f = await fixture()
  try {
    await f.deploy()
    const pool = f.tool.getSnapshot().records.amm.contractAddress as Hex
    await f.provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: AMM_TOKENS[i].address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [pool, 1n] }), gas: '0x186a0' }] })
    await f.funding.refresh(); assert.deepEqual(f.funding.getSnapshot().state!.reserves, [0n, 0n])
    await assert.rejects(f.funding.prepare('approveDPLT'), /捐贈/)
    await assert.rejects(f.funding.prepare('addLiquidity'), /捐贈/)
    assert.equal(f.sent().length, 2)
  } finally { await f.close() }
})
test('independent exact approvals, nonzero insufficient allowance replaced, skip sufficient, addLiquidity LP events and repeat prevention', async () => {
  const f = await fixture()
  try {
    await f.deploy()
    const pool = f.tool.getSnapshot().records.amm.contractAddress as Hex
    await f.provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: AMM_TOKENS[0].address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [pool, 1n] }), gas: '0x186a0' }] })
    for (const op of ['approveDPLT', 'approveA'] as const) {
      await assert.rejects(f.funding.prepare('addLiquidity'), /allowance 不足/)
      await f.funding.prepare(op)
      await Promise.all([f.funding.confirm(), f.funding.confirm()])
      const tx = f.sent().at(-1)!.params![0] as { data: Hex }
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
      assert.equal(decoded.functionName, 'approve'); assert.deepEqual(decoded.args, [pool, AMM_TOKENS[op === 'approveDPLT' ? 0 : 1].amount])
      assert.equal(f.funding.getSnapshot().attempts.at(-1)!.status, 'success')
      await assert.rejects(f.funding.prepare(op), /已足夠/)
    }
    await f.funding.prepare('addLiquidity')
    const p = f.funding.getSnapshot().prepared!
    const args = decodeFunctionData({ abi: artifact.abi, data: p.data }).args
    assert.deepEqual(args, [parseEther('100'), parseEther('3000'), parseEther('100'), parseEther('3000'), LP_TEACHER, p.expires])
    const before = f.sent().length
    await Promise.all([f.funding.confirm(), f.funding.confirm()])
    assert.equal(f.sent().length, before + 1)
    assert.equal(f.funding.getSnapshot().attempts.at(-1)!.status, 'success')
    assert.equal(f.funding.getSnapshot().attempts.at(-1)!.eventVerified, true)
    const s = f.funding.getSnapshot().state!
    assert.equal(s.immediateExpected, true); assert.equal(s.teacherLP, LP_TEACHER); assert.equal(s.lockedLP, LP_LOCKED); assert.equal(s.supply, LP_TOTAL)
    assert.deepEqual(s.actual, s.reserves)
    await assert.rejects(f.funding.prepare('addLiquidity'), /已建立/)
    const clean = createAMMLiquidityTool(f.provider, artifact, f.tool, { read: () => null, write() {} }, 40)
    await assert.rejects(clean.prepare('addLiquidity'), /已建立/); clean.destroy()
    assert.equal(JSON.parse(f.funding.exportRecord()).attempts.length, 3)
    // Later donations change reserves but cannot invalidate the original successful mint events.
    await f.provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: AMM_TOKENS[0].address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [pool, 1n] }), gas: '0x186a0' }] })
    await f.funding.reconcile(2)
    assert.equal(f.funding.getSnapshot().attempts[2].status, 'success')
    assert.equal(f.funding.getSnapshot().state!.immediateExpected, false)
  } finally { await f.close() }
})
for (const op of ['approveDPLT', 'addLiquidity'] as const) for (const mode of ['reject', 'unknown', 'timeout', 'reverted', 'broadcast-unknown']) test(`${op} ${mode}: no automatic resend and original hash recovery`, async () => {
  const f = await fixture()
  try {
    if (op === 'addLiquidity') await f.ready(); else await f.deploy()
    await f.funding.prepare(op)
    if (['timeout', 'reverted'].includes(mode)) f.receipt(mode); else f.send(mode)
    await f.funding.confirm().catch(() => {})
    const index = op === 'addLiquidity' ? 2 : 0
    const a = f.funding.getSnapshot().attempts[index]
    assert.equal(a.status, mode === 'reject' ? 'rejected' : mode === 'reverted' ? 'reverted' : 'unknown')
    const count = f.sent().length
    if (['unknown', 'timeout', 'broadcast-unknown'].includes(mode)) await assert.rejects(f.funding.prepare(op), /結果未知/)
    if (mode === 'timeout' || mode === 'broadcast-unknown') {
      f.receipt(''); f.send('')
      const restored = createAMMLiquidityTool(f.provider, artifact, f.tool, f.fundJournal, 40)
      await restored.reconcile(index, f.originalHash())
      assert.equal(restored.getSnapshot().attempts[index].status, 'success'); restored.destroy()
    }
    assert.equal(f.sent().length, count)
  } finally { await f.close() }
})
for (const kind of ['wrong-account', 'wrong-chain', 'account-event', 'chain-event', 'gas', 'balance', 'deadline', 'simulation-revert']) test(`addLiquidity blocks ${kind}`, async () => {
  const f = await fixture()
  try {
    await f.ready(); await f.funding.prepare('addLiquidity')
    if (kind === 'wrong-account') f.wrongAccount()
    if (kind === 'wrong-chain') f.wrongChain()
    if (kind.endsWith('event')) f.emit(kind === 'account-event' ? 'accountsChanged' : 'chainChanged')
    if (kind === 'gas') await f.rpc('hardhat_setBalance', [DEPLOYER, '0x0'])
    if (kind === 'balance') {
      const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [DEPLOYER, 0n]))
      await f.rpc('hardhat_setStorageAt', [AMM_TOKENS[0].address, slot, numberToHex(0n, { size: 32 })])
    }
    if (kind === 'deadline') { await f.rpc('evm_increaseTime', [601]); await f.rpc('evm_mine', []) }
    if (kind === 'simulation-revert') f.read('simulation-revert')
    const count = f.sent().length
    await assert.rejects(f.funding.confirm()); assert.equal(f.sent().length, count)
  } finally { await f.close() }
})
test('state read failure after a mined addLiquidity remains unknown until manual reconcile', async () => {
  const f = await fixture()
  try {
    await f.ready(); await f.funding.prepare('addLiquidity'); f.failReservesAfterSend(); await f.funding.confirm()
    assert.equal(f.funding.getSnapshot().attempts[2].status, 'unknown')
    await assert.rejects(f.funding.prepare('addLiquidity'))
    f.read(''); await f.funding.reconcile(2)
    assert.equal(f.funding.getSnapshot().attempts[2].status, 'success')
    assert.equal(f.sent().length, 4)
  } finally { await f.close() }
})
test('corrupt/unwritable AMM journal stops send', async () => {
  const f = await fixture()
  try {
    assert.throws(() => createAMMLiquidityTool(f.provider, artifact, f.tool, { read: () => '{', write() {} }))
    await f.deploy()
    const t = createAMMLiquidityTool(f.provider, artifact, f.tool, { read: () => null, write() { throw new Error('quota') } })
    await t.prepare('approveDPLT'); await assert.rejects(t.confirm(), /quota/)
    assert.equal(f.sent().length, 1); t.destroy()
  } finally { await f.close() }
})
for (const change of ['donation', 'allowance']) test(`fresh ${change} check blocks a previously prepared addLiquidity`, async () => {
  const f = await fixture()
  try {
    await f.ready(); await f.funding.prepare('addLiquidity')
    const pool = f.tool.getSnapshot().records.amm.contractAddress as Hex
    const data = change === 'donation'
      ? encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [pool, 1n] })
      : encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [pool, 0n] })
    await f.provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: AMM_TOKENS[0].address, data, gas: '0x186a0' }] })
    const count = f.sent().length
    await assert.rejects(f.funding.confirm(), change === 'donation' ? /捐贈/ : /allowance 不足/)
    assert.equal(f.sent().length, count)
  } finally { await f.close() }
})
test('manual recovery rejects a deployment hash and preserves the original addLiquidity hash', async () => {
  const f = await fixture()
  try {
    await f.ready(); await f.funding.prepare('addLiquidity'); f.send('broadcast-unknown'); await assert.rejects(f.funding.confirm())
    const restored = createAMMLiquidityTool(f.provider, artifact, f.tool, f.fundJournal, 40)
    await restored.reconcile(2, f.tool.getSnapshot().records.amm.hash)
    assert.equal(restored.getSnapshot().attempts[2].hash, undefined)
    await assert.rejects(restored.prepare('addLiquidity'), /結果未知/)
    await restored.reconcile(2, f.originalHash())
    assert.equal(restored.getSnapshot().attempts[2].hash, f.originalHash())
    assert.equal(restored.getSnapshot().attempts[2].status, 'success')
    assert.equal(f.sent().length, 4); restored.destroy()
  } finally { await f.close() }
})
