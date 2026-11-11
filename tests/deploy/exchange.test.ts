import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { network } from 'hardhat'
import { createPublicClient, custom, decodeDeployData, decodeFunctionData, encodeAbiParameters, keccak256, numberToHex, parseEther, toFunctionSelector, type Hex } from 'viem'
import { createDeploymentTool, type DeploymentArtifact } from '../../tools/deploy/engine.ts'
import { createFundingTool } from '../../tools/deploy/funding.ts'
import { EXCHANGE_ARGS, RESERVES } from '../../tools/deploy/exchange-config.ts'
import { DEPLOYER } from '../../tools/deploy/config.ts'
import type { WalletProvider } from '../../src/lib/web3/provider.ts'

const artifact = JSON.parse(readFileSync('artifacts/contracts/DPLFixedExchange.sol/DPLFixedExchange.json', 'utf8')) as DeploymentArtifact
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
  for (const token of RESERVES) {
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
      if (args.method === 'eth_call' && readMode === 'fail') throw new Error('RPC read failed')
      if (args.method === 'eth_call' && readMode === 'reserve-fail' && ((args.params?.[0] as { data: string }).data.startsWith(toFunctionSelector('reserveOf(address)')))) throw new Error('reserveOf unavailable')
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
  const tool = createDeploymentTool(provider, artifact, journal, 40, 'exchange')
  const funding = createFundingTool(provider, artifact, tool, fundJournal, 40)
  const client = createPublicClient({ transport: custom(connection.provider) })
  return {
    tool, funding, provider, journal, fundJournal, client, calls,
    originalHash: () => broadcastHash, failReservesAfterSend() { failAfterFunding = true },
    sent: () => calls.filter(c => c.method === 'eth_sendTransaction'),
    wrongChain() { chain = '0x1' }, wrongAccount() { account = '0x1111111111111111111111111111111111111111' },
    send(mode: string) { sendMode = mode }, receipt(mode: string) { receiptMode = mode }, read(mode: string) { readMode = mode },
    emit() { listeners.get('chainChanged')?.forEach(fn => fn()) },
    async deploy() { await tool.connect(); await tool.prepare('exchange'); await tool.confirm('exchange'); assert.equal(tool.getSnapshot().records.exchange.status, '成功'); fundingPhase = true },
    async close() { tool.destroy(); funding.destroy(); await connection.close() },
  }
}

test('Exchange constructor, required getters, six quotes, public export and reload lock', async () => {
  const f = await fixture()
  try {
    assert.equal(f.calls.length, 0)
    await f.tool.connect(); await f.tool.prepare('exchange')
    assert.equal(f.sent().length, 0)
    await Promise.all([f.tool.confirm('exchange'), f.tool.confirm('exchange')])
    assert.equal(f.sent().length, 1)
    const tx = f.sent()[0].params![0] as { data: Hex; to?: string; value: string; chainId: string }
    assert.equal(tx.to, undefined); assert.equal(tx.value, '0x0'); assert.equal(tx.chainId, '0xaa36a7')
    assert.deepEqual(decodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, data: tx.data }).args, EXCHANGE_ARGS)
    const r = f.tool.getSnapshot().records.exchange
    assert.equal(r.status, '成功'); assert.equal(r.receiptStatus, 'success'); assert.ok(r.deployedAt)
    assert.equal(await f.client.readContract({ address: r.contractAddress as Hex, abi: artifact.abi, functionName: 'owner' }), DEPLOYER)
    for (const [i, name] of ['dplt', 'assetA', 'assetB'].entries()) assert.equal(await f.client.readContract({ address: r.contractAddress as Hex, abi: artifact.abi, functionName: name }), EXCHANGE_ARGS[i])
    const record = JSON.parse(f.tool.exportRecord())
    assert.deepEqual(record.exchange.constructorArgs, EXCHANGE_ARGS); assert.equal(record.provenance.compiler, '0.8.38')
    await assert.rejects(f.tool.prepare('exchange'), /已有部署嘗試/)
    const restored = createDeploymentTool(f.provider, artifact, f.journal, 40, 'exchange')
    assert.equal(restored.getSnapshot().records.exchange.status, '結果未知')
    await assert.rejects(restored.prepare('exchange'))
    await restored.reconcile('exchange'); assert.equal(restored.getSnapshot().records.exchange.status, '成功')
    assert.equal(f.sent().length, 1); restored.destroy()
    const historical = f.calls.filter(c => c.method === 'eth_getCode' || c.method === 'eth_call')
    assert.ok(historical.every(c => c.params?.[1] === 'latest'))
  } finally { await f.close() }
})
for (const kind of ['chain', 'account', 'event']) test(`Exchange blocks wrong ${kind}`, async () => {
  const f = await fixture()
  try {
    if (kind === 'event') { await f.tool.connect(); await f.tool.prepare('exchange'); f.emit(); await f.tool.confirm('exchange').catch(() => {}) }
    else { if (kind === 'chain') f.wrongChain(); else f.wrongAccount(); await assert.rejects(f.tool.connect()) }
    assert.equal(f.sent().length, 0)
  } finally { await f.close() }
})
for (const mode of ['reverted', 'timeout', 'unknown', 'reject', 'wrong', 'fail', 'no-code']) test(`Exchange ${mode}: failure/unknown never resends`, async () => {
  const f = await fixture()
  try {
    await f.tool.connect(); await f.tool.prepare('exchange')
    if (['reverted', 'timeout'].includes(mode)) f.receipt(mode)
    else if (['unknown', 'reject'].includes(mode)) f.send(mode)
    else f.read(mode)
    await f.tool.confirm('exchange')
    assert.equal(f.tool.getSnapshot().records.exchange.status, ['reverted', 'reject'].includes(mode) ? '失敗' : '結果未知')
    if (mode !== 'reject') await assert.rejects(f.tool.prepare('exchange'))
    if (mode === 'timeout') { f.receipt(''); await f.tool.reconcile('exchange'); assert.equal(f.tool.getSnapshot().records.exchange.status, '成功') }
    assert.equal(f.sent().length, 1)
  } finally { await f.close() }
})

test('three independent transfer funding operations, delta amounts, targets reached and actual reserves', async () => {
  const f = await fixture()
  try {
    await f.deploy(); await f.funding.refresh()
    assert.equal(f.funding.getSnapshot().owner, DEPLOYER); assert.equal(f.funding.getSnapshot().paused, false)
    for (const token of RESERVES) {
      await f.funding.prepare(token.id)
      const p = f.funding.getSnapshot().prepared!
      assert.equal(p.amount, token.target)
      const before = f.sent().length
      await Promise.all([f.funding.confirm(), f.funding.confirm()])
      assert.equal(f.sent().length, before + 1)
      const tx = f.sent().at(-1)!.params![0] as { to: string; data: Hex; value: string }
      assert.equal(tx.to, token.address); assert.equal(tx.value, '0x0')
      const transfer = decodeFunctionData({ abi: (await import('viem')).erc20Abi, data: tx.data })
      assert.equal(transfer.functionName, 'transfer'); assert.deepEqual(transfer.args, [p.address, token.target])
      assert.equal(f.funding.getSnapshot().attempts.at(-1)!.status, '成功')
      assert.equal(f.funding.getSnapshot().balances[token.id], token.target)
      await assert.rejects(f.funding.prepare(token.id), /已達目標/)
    }
    assert.equal(f.sent().length, 4)
    assert.equal(JSON.parse(f.funding.exportRecord()).attempts.length, 3)
  } finally { await f.close() }
})

test('partial reserve funds only the shortfall and does not trust a changed reserve at confirm', async () => {
  const f = await fixture()
  try {
    await f.deploy()
    const address = f.tool.getSnapshot().records.exchange.contractAddress as Hex
    const { encodeFunctionData, erc20Abi } = await import('viem')
    const transfer = async () => f.provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: RESERVES[0].address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [address, parseEther('100')] }), gas: '0x186a0' }] })
    await transfer(); await f.funding.prepare('DPLT')
    assert.equal(f.funding.getSnapshot().prepared!.amount, parseEther('900'))
    await transfer()
    const count = f.sent().length
    await assert.rejects(f.funding.confirm(), /庫存／Gas 已變更/)
    assert.equal(f.sent().length, count)
    await f.funding.prepare('DPLT'); assert.equal(f.funding.getSnapshot().prepared!.amount, parseEther('800'))
  } finally { await f.close() }
})

for (const kind of ['unverified', 'query-error', 'wrong-account', 'wrong-chain', 'event']) test(`funding blocks ${kind}`, async () => {
  const f = await fixture()
  try {
    if (kind !== 'unverified') await f.deploy()
    if (kind === 'query-error') { await f.funding.refresh(); f.read('fail') }
    if (kind === 'wrong-account') f.wrongAccount()
    if (kind === 'wrong-chain') f.wrongChain()
    if (kind === 'event') { await f.funding.prepare('DPLT'); f.emit(); await assert.rejects(f.funding.confirm()) }
    else await assert.rejects(f.funding.prepare('DPLT'))
    assert.equal(Object.keys(f.funding.getSnapshot().balances).length, 0)
    assert.equal(f.sent().length, kind === 'unverified' ? 0 : 1)
  } finally { await f.close() }
})
for (const mode of ['reverted', 'timeout', 'unknown', 'reject']) test(`funding ${mode}: reconcile original hash and reserves before any new operation`, async () => {
  const f = await fixture()
  try {
    await f.deploy(); await f.funding.prepare('DPLT')
    if (['timeout', 'reverted'].includes(mode)) f.receipt(mode); else f.send(mode)
    await f.funding.confirm().catch(() => {})
    const a = f.funding.getSnapshot().attempts.at(-1)
    if (mode === 'reject') { assert.equal(a!.status, '失敗'); assert.equal(a!.rejected, true); f.send(''); await f.funding.prepare('DPLT') }
    else {
      assert.equal(a!.status, mode === 'reverted' ? '失敗' : '結果未知')
      if (mode !== 'reverted') await assert.rejects(f.funding.prepare('DPLT-A'), /未知交易/)
      if (mode === 'timeout') {
        const restored = createFundingTool(f.provider, artifact, f.tool, f.fundJournal, 40)
        await assert.rejects(restored.prepare('DPLT-A'), /未知交易/)
        f.receipt(''); await restored.reconcile(0)
        assert.equal(restored.getSnapshot().attempts[0].status, '成功')
        assert.equal(restored.getSnapshot().balances.DPLT, RESERVES[0].target)
        await assert.rejects(restored.prepare('DPLT'), /已達目標/)
        restored.destroy()
      }
    }
    assert.equal(f.sent().length, 2)
  } finally { await f.close() }
})

test('funding journal corruption/unavailable storage prevents sends', async () => {
  const f = await fixture()
  try {
    assert.throws(() => createFundingTool(f.provider, artifact, f.tool, { read: () => '{', write() {} }))
    await f.deploy()
    const t = createFundingTool(f.provider, artifact, f.tool, { read: () => null, write() { throw new Error('quota') } })
    await t.prepare('DPLT'); await assert.rejects(t.confirm(), /quota/)
    assert.equal(f.sent().length, 1); t.destroy()
  } finally { await f.close() }
})


test('mined funding with reserveOf failure remains unknown until receipt AND reserves reconcile', async () => {
  const f = await fixture()
  try {
    await f.deploy(); await f.funding.prepare('DPLT'); f.failReservesAfterSend()
    await f.funding.confirm()
    assert.equal(f.funding.getSnapshot().attempts[0].status, '結果未知')
    assert.deepEqual(f.funding.getSnapshot().balances, {})
    await assert.rejects(f.funding.prepare('DPLT-A'), /未知交易/)
    f.read(''); await f.funding.reconcile(0)
    assert.equal(f.funding.getSnapshot().attempts[0].status, '成功')
    assert.equal(f.funding.getSnapshot().balances.DPLT, RESERVES[0].target)
    assert.equal(f.sent().length, 2)
  } finally { await f.close() }
})

test('lost send response recovers using original funding hash after reload, with no duplicate transfer', async () => {
  const f = await fixture()
  try {
    await f.deploy(); await f.funding.prepare('DPLT'); f.send('broadcast-unknown')
    await assert.rejects(f.funding.confirm())
    assert.equal(f.funding.getSnapshot().attempts[0].hash, undefined)
    const restored = createFundingTool(f.provider, artifact, f.tool, f.fundJournal, 40)
    await assert.rejects(restored.prepare('DPLT'), /未知交易/)
    // A deployment hash must never be accepted as a funding transaction.
    await restored.reconcile(0, f.tool.getSnapshot().records.exchange.hash)
    assert.equal(restored.getSnapshot().attempts[0].status, '結果未知')
    assert.equal(restored.getSnapshot().attempts[0].hash, undefined)
    await restored.reconcile(0, f.originalHash())
    assert.equal(restored.getSnapshot().attempts[0].status, '成功')
    await assert.rejects(restored.prepare('DPLT'), /已達目標/)
    assert.equal(f.sent().length, 2); restored.destroy()
  } finally { await f.close() }
})
