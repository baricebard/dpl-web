import { expect, test } from '@playwright/test'
import { decodeFunctionData, formatUnits } from 'viem'
import { amm, ammAbi } from '../../src/config/amm'
import { teachingTokenAbi } from '../../src/config/tokens'
import { addEstimate, minimum, parseAmount, percentLP, removeEstimate, share, slippageBps, swapMetrics } from '../../src/modules/liquidity/services/ammMath'
import { prepareAmm, previewAmm, readAmmSnapshot, validateDeadline } from '../../src/modules/liquidity/services/ammService'
import { ammFixture, hash, swapInput, unit } from '../helpers/amm'
import { secondAddress } from '../helpers/wallet'

for (const tokenIndex of [0, 1] as const) test(`合約正式報價方向 ${tokenIndex}、Fee、價格與最低輸出`, async () => {
  const f = ammFixture(), amount = unit + 1n
  const p = await previewAmm(f.session, { ...swapInput, tokenIndex, amount: formatUnits(amount, 18) }, f.typed)
  const x = f.c.reserves[tokenIndex], y = f.c.reserves[1 - tokenIndex]
  expect(p.amountOut).toBe(y * amount * 997n / (x * 1000n + amount * 997n))
  expect(f.reads).toContain('quoteSwap'); expect(f.reads).toContain('quote')
  expect(p.minAmountOut).toBe(p.amountOut * 9950n / 10000n)
  expect(p.feeNumerator).toBe(amount * 3n)
  const m = swapMetrics(amount, p.amountOut, x, y)
  expect(m.before).toBe(tokenIndex === 0 ? '30' : '0.033333')
  expect(m.impact).not.toBe('0.5')
  expect(p.fixed?.amountOut).toBe(tokenIndex === 0 ? amount * 30n : amount / 30n)
})
test('極小量、非法金額、滑價上下界與整數捨入', () => {
  expect(parseAmount('0.000000000000000001')).toBe(1n)
  for (const value of ['0', '-1', '1e18', 'NaN', '1.', '.1', '1.0000000000000000001']) expect(() => parseAmount(value)).toThrow()
  expect(slippageBps('0')).toBe(0n); expect(slippageBps('5')).toBe(500n); expect(slippageBps('0.01')).toBe(1n)
  for (const value of ['-1', '5.01', 'NaN', '0.001', '1e1']) expect(() => slippageBps(value)).toThrow()
  expect(minimum(999n, 50n)).toBe(994n); expect(minimum(1n, 0n)).toBe(1n)
  expect(() => minimum(1n, 50n)).toThrow('為零')
})
test('期限為 Unix 秒，拒絕已過期與接近過期', () => {
  expect(() => validateDeadline(BigInt(Math.floor(Date.now() / 1000)) - 1n)).toThrow('期限')
  expect(() => validateDeadline(BigInt(Math.floor(Date.now() / 1000)) + 600n)).not.toThrow()
})
for (const operation of ['swap', 'add', 'remove'] as const) test(`${operation} 成功以事件確認並更新權益，calldata 包含最低量與期限`, async () => {
  const f = ammFixture(); f.c.allowances = [100n * unit, 3000n * unit]
  await f.store.prepare(operation, f.session, { ...swapInput, operation })
  const s = f.store.getSnapshot().summary!
  expect(s.deadline).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)) + 590n)
  expect(s.gas).toBe(96_000n)
  await f.store.confirm(s)
  const state = f.store.getSnapshot()
  expect(state.status).toBe('success'); expect(state.transaction?.actual).toBeDefined(); expect(f.sends).toHaveLength(1)
  const decoded = decodeFunctionData({ abi: ammAbi, data: f.sends[0].data })
  expect(decoded.functionName).toBe(operation === 'add' ? 'addLiquidity' : operation === 'remove' ? 'removeLiquidity' : 'swap')
  expect(decoded.args?.at(-1)).toBe(s.deadline)
  expect(state.transaction?.before?.balances[0]).toBe(100n * unit)
  expect(state.transaction?.before?.lp).toBe(50n * unit)
  expect(state.transaction?.after).toEqual(state.snapshot)
  if (operation === 'add') { expect(state.snapshot?.lp).toBe(55n * unit); expect(state.snapshot?.supply).toBe(505n * unit); expect(share(state.snapshot!.lp, state.snapshot!.supply)).toBe('10.891089') }
  if (operation === 'remove') { expect(state.snapshot?.lp).toBe(49n * unit); expect(state.snapshot?.supply).toBe(499n * unit) }
  if (operation === 'swap') expect(state.snapshot?.balances[0]).toBe(99n * unit)
})
test('Add 兩種輸入方向與 Solidity 捨入一致，包含反向分支', async () => {
  const f = ammFixture()
  for (const tokenIndex of [0, 1] as const) {
    const p = await previewAmm(f.session, { ...swapInput, operation: 'add', tokenIndex }, f.typed)
    expect(p.amounts[0] * f.c.supply / f.c.reserves[0] >= p.liquidity).toBe(true)
    expect(p.minLiquidity).toBe(p.liquidity * 9950n / 10000n)
    expect(p.desired[tokenIndex]).toBe(unit)
  }
  expect(addEstimate([7n, 3n], [5n, 3n], 10000n)).toEqual({ amounts: [5n, 3n], liquidity: 10000n })
  expect(addEstimate([7n, 5n], [5n, 3n], 10000n)).toEqual({ amounts: [7n, 4n], liquidity: 13333n })
})
test('Remove 按總供給向下取整，四種百分比只依持有量、不含鎖定 LP', () => {
  expect(removeEstimate(3000n, [103n, 307n], 10030n, 3000n)).toEqual([30n, 91n])
  for (const percent of [25, 50, 75, 100] as const) expect(percentLP(unit + 3n, percent)).toBe(formatUnits((unit + 3n) * BigInt(percent) / 100n, 18))
  expect(() => removeEstimate(3001n, [103n, 307n], 10030n, 3000n)).toThrow('LP')
  expect(() => removeEstimate(1001n, [unit, unit], 2000n, 2000n)).toThrow('永久鎖定')
  expect(() => removeEstimate(1n, [1n, 1n], 1001n, 1n)).toThrow('為零')
})
test('兩資產分別精確 approve，三筆交易獨立、成功不自動注資', async () => {
  const f = ammFixture(), input = { ...swapInput, operation: 'add' as const }
  for (const kind of ['approveDPLT', 'approveA'] as const) {
    f.resetReceipt()
    await f.store.prepare(kind, f.session, input)
    const summary = f.store.getSnapshot().summary!
    expect(summary).toBeDefined()
    const before = f.sends.length
    await f.store.confirm(summary)
    expect(f.store.getSnapshot().status).toBe('success'); expect(f.sends).toHaveLength(before + 1)
    const tx = decodeFunctionData({ abi: teachingTokenAbi, data: f.sends.at(-1)!.data })
    expect(tx.functionName).toBe('approve'); expect(tx.args).toEqual([amm.address, kind === 'approveDPLT' ? unit : 30n * unit])
  }
  expect(f.store.getSnapshot().snapshot?.lp).toBe(50n * unit)
  await f.store.prepare('add', f.session, input)
  expect(f.store.getSnapshot().summary?.kind).toBe('add'); expect(f.sends).toHaveLength(2)
})
test('足夠 allowance 略過 approve；Remove 不需 LP 授權', async () => {
  const f = ammFixture(); f.c.allowances[0] = unit
  await expect(prepareAmm('approveDPLT', f.session, swapInput, f.typed)).rejects.toThrow('已足夠')
  await expect(prepareAmm('swap', f.session, swapInput, f.typed)).resolves.toHaveProperty('kind', 'swap')
  f.c.allowances = [0n, 0n]
  await expect(prepareAmm('remove', f.session, { ...swapInput, operation: 'remove' }, f.typed)).resolves.toHaveProperty('to', amm.address)
})
for (const issue of ['empty', 'reserve', 'rpc', 'balance', 'allowance', 'eth', 'simulation', 'lp', 'identity', 'chain'] as const) test(`必要條件 ${issue} 失敗不送交易`, async () => {
  const f = ammFixture(); f.c.allowances = [unit, 30n * unit]
  if (issue === 'empty') f.c.supply = 0n
  if (issue === 'reserve') f.c.reserves[0] = 0n
  if (issue === 'rpc') f.c.rpcFailure = true
  if (issue === 'balance') f.c.balances[0] = 0n
  if (issue === 'allowance') f.c.allowances[0] = 0n
  if (issue === 'eth') f.c.eth = 0n
  if (issue === 'simulation') f.c.simulationFailure = true
  if (issue === 'lp') f.c.lp = 0n
  if (issue === 'identity') f.c.provider = secondAddress
  if (issue === 'chain') f.c.rpcChain = 1
  await f.store.prepare(issue === 'lp' ? 'remove' : 'swap', f.session, { ...swapInput, operation: issue === 'lp' ? 'remove' : 'swap' })
  expect(f.store.getSnapshot().status).toBe('failed'); expect(f.store.getSnapshot().summary).toBeUndefined(); expect(f.sends).toHaveLength(0)
})
for (const kind of ['approveDPLT', 'swap', 'add', 'remove'] as const) for (const mode of ['reject', 'revert', 'waitTimeout'] as const) test(`${kind} ${mode} 保留原操作與 Hash、不重送`, async () => {
  const f = ammFixture(); if (kind !== 'approveDPLT') f.c.allowances = [unit, 30n * unit]
  f.c[mode] = true
  const operation = kind === 'add' || kind === 'remove' ? kind : 'swap'
  await f.store.prepare(kind, f.session, { ...swapInput, operation })
  await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe(mode === 'waitTimeout' ? 'unknown' : 'failed')
  if (mode === 'waitTimeout') {
    expect(f.store.getSnapshot().transaction?.originalHash).toBe(hash)
    await f.store.prepare(kind, f.session, { ...swapInput, operation })
    expect(f.store.getSnapshot().summary).toBeUndefined(); await f.store.track()
    expect(f.store.getSnapshot().status).toBe('success')
  }
  expect(f.sends).toHaveLength(1)
})
test('送出未知且無 Hash 可補回原交易，錯誤 Hash 不覆寫紀錄', async () => {
  const f = ammFixture(); f.c.sendTimeout = true
  await f.store.prepare('approveDPLT', f.session, swapInput); await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe('unknown')
  await f.store.prepare('approveDPLT', f.session, swapInput); expect(f.sends).toHaveLength(1)
  f.c.wrongTx = true; await f.store.recover(hash); expect(f.store.getSnapshot().transaction?.originalHash).toBeUndefined()
  f.c.wrongTx = false; await f.store.recover(hash); expect(f.store.getSnapshot().status).toBe('success')
})
for (const mode of ['form', 'account', 'chain', 'event', 'expired', 'deadline', 'gas', 'quote', 'allowance'] as const) test(`送出前 ${mode} 變動重新檢查`, async () => {
  const f = ammFixture(); f.c.allowances[0] = unit
  await f.store.prepare('swap', f.session, swapInput)
  const s = f.store.getSnapshot().summary!
  if (mode === 'form') f.store.invalidate()
  if (mode === 'account') f.c.account = secondAddress
  if (mode === 'chain') f.c.walletChain = '0x1'
  if (mode === 'event') f.c.current = false
  if (mode === 'expired') s.createdAt -= 121_000
  if (mode === 'deadline') s.deadline = 1n
  if (mode === 'gas') f.c.gasPrice *= 2n
  if (mode === 'quote') f.c.quoteOverride = 1n
  if (mode === 'allowance') f.c.allowances[0] = 0n
  await f.store.confirm(s); expect(f.sends).toHaveLength(0); expect(f.store.getSnapshot().summary).toBeUndefined()
})
for (const mode of ['reorg', 'wrongTx', 'noEvent'] as const) test(`Receipt ${mode} 不標示成功`, async () => {
  const f = ammFixture(); f.c.allowances[0] = unit; f.c[mode] = true
  await f.store.prepare('swap', f.session, swapInput); await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe('unknown'); expect(f.store.getSnapshot().transaction?.originalHash).toBe(hash)
})
test('重複點擊只送一筆，切換後仍追蹤原帳號交易', async () => {
  const f = ammFixture(); f.c.allowances[0] = unit
  await f.store.prepare('swap', f.session, swapInput)
  const s = f.store.getSnapshot().summary!
  f.beforeSend(() => { f.c.current = false; f.store.invalidate(true) })
  await Promise.all([f.store.confirm(s), f.store.confirm(s)])
  expect(f.sends).toHaveLength(1); expect(f.store.getSnapshot().transaction).toMatchObject({ account: s.session.address, chainId: 11155111, originalHash: hash })
  expect(f.store.getSnapshot().snapshot).toBeUndefined()
})
test('固定匯率失敗或單筆超限不影響 AMM 合約報價', async () => {
  const f = ammFixture(); f.c.fixedFailure = true
  const p = await previewAmm(f.session, swapInput, f.typed)
  expect(p.amountOut).toBeGreaterThan(0n); expect(p.fixed?.error).toContain('逾時')
  const large = await previewAmm(f.session, { ...swapInput, amount: '11' }, f.typed)
  expect(large.fixed?.error).toContain('單筆上限')
})
test('快照同時查詢去重、成功快取；失敗不補零', async () => {
  const f = ammFixture()
  await Promise.all([readAmmSnapshot(f.session, f.typed), readAmmSnapshot(f.session, f.typed)])
  const count = f.reads.length
  await readAmmSnapshot(f.session, f.typed); expect(f.reads).toHaveLength(count)
  f.c.rpcFailure = true; await f.store.refresh(f.session, true)
  expect(f.store.getSnapshot().snapshot).toBeUndefined(); expect(f.store.getSnapshot().error).toContain('查詢失敗')
})
test('等待模擬中表單改變，舊回應不建立摘要', async () => {
  const f = ammFixture(); let release!: () => void
  f.defer(() => new Promise<void>(resolve => { release = resolve }))
  const pending = f.store.prepare('approveDPLT', f.session, swapInput)
  await expect.poll(() => !!release).toBe(true)
  f.store.invalidate(); release(); await pending
  expect(f.store.getSnapshot().summary).toBeUndefined()
})

test('只剩永久鎖定 LP 的已初始化池仍可 Swap 與 Add，不提供初始化', async () => {
  const f = ammFixture(); f.c.supply = 1000n; f.c.lp = 0n
  const swap = await previewAmm(f.session, swapInput, f.typed)
  expect(swap.amountOut).toBeGreaterThan(0n)
  const add = await previewAmm(f.session, { ...swapInput, operation: 'add' }, f.typed)
  expect(add.liquidity).toBe(10n)
  expect(add.minLiquidity).toBe(9n)
})
test('最新報價在原滑價內可成交，calldata 不降低原最低量', async () => {
  const f = ammFixture(); f.c.allowances[0] = unit
  await f.store.prepare('swap', f.session, swapInput)
  const s = f.store.getSnapshot().summary!
  f.c.quoteOverride = s.amountOut - s.amountOut / 1000n
  await f.store.confirm(s)
  expect(f.store.getSnapshot().status).toBe('success')
  const decoded = decodeFunctionData({ abi: ammAbi, data: f.sends[0].data })
  expect(decoded.functionName).toBe('swap')
  if (decoded.functionName === 'swap') expect(decoded.args[2]).toBe(s.minAmountOut)
})
test('授權 Receipt 成功但 allowance 不足仍阻擋 Swap，更新 RPC 失敗不補零', async () => {
  const f = ammFixture(); f.c.updateAllowance = false
  await f.store.prepare('approveDPLT', f.session, swapInput); await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe('success')
  expect(f.store.getSnapshot().error).toContain('allowance 仍不足')
  await f.store.prepare('swap', f.session, swapInput)
  expect(f.store.getSnapshot().status).toBe('failed'); expect(f.sends).toHaveLength(1)
  f.c.rpcFailure = true; await f.store.refresh(f.session, true)
  expect(f.store.getSnapshot().snapshot).toBeUndefined()
})

test('成功後重新查詢失敗不能沿用上一份交易後快照', async () => {
  const f = ammFixture(); f.c.allowances = [100n * unit, 3000n * unit]
  await f.store.prepare('swap', f.session, swapInput)
  await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().transaction?.after?.balances[0]).toBe(99n * unit)
  f.c.rpcFailure = true
  await f.store.track()
  expect(f.store.getSnapshot().status).toBe('success')
  expect(f.store.getSnapshot().transaction?.actual).toBeDefined()
  expect(f.store.getSnapshot().transaction?.after).toBeUndefined()
  expect(f.store.getSnapshot().transaction?.before?.balances[0]).toBe(100n * unit)
})
test('切換操作封存已完成紀錄，不沿用結果；未知交易繼續鎖定', async () => {
  const f = ammFixture(); f.c.allowances = [100n * unit, 3000n * unit]
  await f.store.prepare('swap', f.session, swapInput)
  await f.store.confirm(f.store.getSnapshot().summary!)
  f.store.invalidate()
  expect(f.store.getSnapshot().status).toBe('idle')
  expect(f.store.getSnapshot().transaction).toBeUndefined()
  expect(f.store.getSnapshot().history[0].originalHash).toBe(hash)
  f.resetReceipt(); f.c.waitTimeout = true
  await f.store.prepare('add', f.session, { ...swapInput, operation: 'add' })
  await f.store.confirm(f.store.getSnapshot().summary!)
  f.store.invalidate(true)
  expect(f.store.getSnapshot().status).toBe('unknown')
  expect(f.store.getSnapshot().transaction?.originalHash).toBe(hash)
  await f.store.prepare('remove', f.session, { ...swapInput, operation: 'remove' })
  expect(f.store.getSnapshot().summary).toBeUndefined()
  expect(f.sends).toHaveLength(2)
})

test('前快照取確認送出前的新餘額，不沿用準備摘要的舊餘額', async () => {
  const f = ammFixture(); f.c.allowances = [100n * unit, 3000n * unit]
  await f.store.prepare('swap', f.session, swapInput)
  const summary = f.store.getSnapshot().summary!
  f.c.balances[0] = 90n * unit
  await f.store.confirm(summary)
  expect(f.store.getSnapshot().transaction?.before?.balances[0]).toBe(90n * unit)
  expect(f.store.getSnapshot().transaction?.after?.balances[0]).toBe(89n * unit)
})
test('交易後 RPC 區塊早於 Receipt 時不顯示前後比較', async () => {
  const f = ammFixture(); f.c.allowances = [100n * unit, 3000n * unit]
  const receipt = f.client.getTransactionReceipt
  let mined = false, blocksAfterReceipt = 0
  f.client.getTransactionReceipt = async () => { const result = await receipt(); mined = true; return result }
  f.client.getBlockNumber = async () => mined && blocksAfterReceipt++ > 0 ? 99n : 100n
  await f.store.prepare('swap', f.session, swapInput)
  await f.store.confirm(f.store.getSnapshot().summary!)
  expect(f.store.getSnapshot().status).toBe('success')
  expect(f.store.getSnapshot().transaction?.actual).toBeDefined()
  expect(f.store.getSnapshot().transaction?.after).toBeUndefined()
})
