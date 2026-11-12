import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { artifacts, network } from 'hardhat'
import { encodeFunctionData, getAddress, maxUint256, zeroAddress } from 'viem'
import PoolModule from '../../ignition/modules/DPLAMMPool.ts'

const U = 10n ** 18n
const CAP = 2n ** 112n - 1n
const LOCK = '0x000000000000000000000000000000000000dEaD'
const sqrt = (n: bigint) => {
  let x = n, y = (x + 1n) / 2n
  while (y < x) { x = y; y = (x + n / x) / 2n }
  return x
}
const output = (input: bigint, rin: bigint, rout: bigint) => rout * input * 997n / (rin * 1000n + input * 997n)

describe('DPLAMMPool — local EDR only', async () => {
  const connection = await network.create()
  const { viem } = connection
  const client = await viem.getPublicClient()
  const [teacher, student, outsider] = await viem.getWalletClients()
  const holder = teacher.account.address
  const user = student.account.address
  const send = async (tx: Promise<`0x${string}`>) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await tx })
    assert.equal(receipt.status, 'success')
    return receipt
  }
  const fixture = async (initialize = true, adversarial = false, supply = 1_000_000n * U) => {
    const deployedTokens = await Promise.all(['DPLT', 'DPLT-A'].map((name) =>
      adversarial ? viem.deployContract('AMMTestToken', [holder]) :
        viem.deployContract('TeachingToken', [name, name, holder, supply])))
    const tokens = await Promise.all(deployedTokens.map((t) => viem.getContractAt('TeachingToken', t.address)))
    const pool = await viem.deployContract('DPLAMMPool', [tokens[0].address, tokens[1].address])
    for (const token of tokens) {
      await send(token.write.transfer([user, 10_000n * U], { account: teacher.account }))
      for (const wallet of [teacher, student]) await send(token.write.approve([pool.address, maxUint256], { account: wallet.account }))
    }
    if (initialize) await send(pool.write.addLiquidity([100n * U, 3000n * U, 100n * U, 3000n * U, 1n, maxUint256], { account: teacher.account }))
    return { tokens, pool }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  type PoolError = Extract<Fixture['pool']['abi'][number], { type: 'error' }>['name']
  const fail = (action: Promise<unknown>, pool: Fixture['pool'], name: PoolError) => viem.assertions.revertWithCustomError(action, pool, name)
  const snapshot = async ({ tokens, pool }: Fixture) => ({
    reserves: await pool.read.getReserves(), supply: await pool.read.totalSupply(),
    lp: await Promise.all([holder, user, outsider.account.address, LOCK].map((a) => pool.read.balanceOf([a as `0x${string}`]))),
    tokens: await Promise.all(tokens.map(async (t) => ({
      balances: await Promise.all([holder, user, pool.address].map((a) => t.read.balanceOf([a]))),
      allowance: await Promise.all([holder, user].map((a) => t.read.allowance([a, pool.address]))),
      supply: await t.read.totalSupply(),
    }))),
  })
  const consistent = async (f: Fixture) => {
    const reserves = await f.pool.read.getReserves()
    assert.deepEqual(reserves, await Promise.all(f.tokens.map((t) => t.read.balanceOf([f.pool.address]))))
    assert.equal(await f.pool.read.totalSupply(), (await f.pool.read.balanceOf([holder])) + (await f.pool.read.balanceOf([user])) + (await f.pool.read.balanceOf([LOCK])))
  }

  it('validates immutable token addresses, ERC20 metadata and empty pool', async () => {
    const { pool, tokens } = await fixture(false)
    assert.equal(await pool.read.dplt(), getAddress(tokens[0].address))
    assert.equal(await pool.read.assetA(), getAddress(tokens[1].address))
    assert.equal(await pool.read.name(), 'DPL AMM Liquidity Provider Token')
    assert.equal(await pool.read.symbol(), 'DPL-LP')
    assert.equal(await pool.read.decimals(), 18)
    assert.deepEqual(await pool.read.getReserves(), [0n, 0n])
    assert.equal(await pool.read.totalSupply(), 0n)
    const wrongScale = await viem.deployContract('ExchangeTestToken', [holder, 6])
    const nonToken = await viem.deployContract('AMMNonToken')
    for (const pos of [0, 1]) {
      for (const bad of [zeroAddress, user, nonToken.address, wrongScale.address]) {
        const args = tokens.map((t) => t.address)
        args[pos] = bad
        await fail(viem.deployContract('DPLAMMPool', [args[0], args[1]]), pool, 'InvalidToken')
      }
    }
    await fail(viem.deployContract('DPLAMMPool', [tokens[0].address, tokens[0].address]), pool, 'DuplicateToken')
    await fail(pool.read.quoteSwap([tokens[0].address, U]), pool, 'UninitializedPool')
    await fail(pool.write.swap([tokens[0].address, U, 0n, maxUint256]), pool, 'UninitializedPool')
    await fail(pool.write.removeLiquidity([1n, 0n, 0n, maxUint256]), pool, 'UninitializedPool')
  })

  it('initializes at 1:30, floors sqrt, locks exactly 1000 units and emits deposit/reserves', async () => {
    const f = await fixture(false)
    const { pool } = f
    const root = sqrt(100n * U * 3000n * U)
    await viem.assertions.emitWithArgs(pool.write.addLiquidity([100n * U, 3000n * U, 0n, 0n, root - 1000n, maxUint256]), pool, 'AddLiquidity', [getAddress(holder), 100n * U, 3000n * U, root - 1000n])
    assert.equal(await pool.read.totalSupply(), root)
    assert.equal(await pool.read.balanceOf([holder]), root - 1000n)
    assert.equal(await pool.read.balanceOf([LOCK]), 1000n)
    assert.equal(await pool.read.LOCKED_LIQUIDITY_ADDRESS(), LOCK)
    const [x, y] = await pool.read.getReserves()
    assert.equal(y, 30n * x)
    assert.ok(root * root <= x * y && (root + 1n) ** 2n > x * y)
    const events = await client.getContractEvents({ address: pool.address, abi: pool.abi, eventName: 'ReservesUpdated', fromBlock: 0n, strict: true })
    assert.deepEqual(events.at(-1)?.args, { reserveDPLT: x, reserveDPLTA: y })
    await consistent(f)
  })

  it('allows the first provider to choose a different price without hidden teacher privileges', async () => {
    const { pool } = await fixture(false)
    await send(pool.write.addLiquidity([U, 7n * U, 0n, 0n, 0n, maxUint256], { account: student.account }))
    assert.deepEqual(await pool.read.getReserves(), [U, 7n * U])
  })

  for (const [dx, dy] of [[20n * U, 300n * U], [10n * U, 900n * U]]) {
    it(`uses only proportional amounts from desired ${dx}/${dy}`, async () => {
      const f = await fixture()
      const { tokens, pool } = f
      const supply = await pool.read.totalSupply()
      const before = await snapshot(f)
      const lp = supply / 10n
      await viem.assertions.emitWithArgs(pool.write.addLiquidity([dx, dy, 10n * U, 300n * U, lp, maxUint256], { account: student.account }), pool, 'AddLiquidity', [getAddress(user), 10n * U, 300n * U, lp])
      assert.equal(await pool.read.balanceOf([user]), lp)
      for (const [i, used] of [10n * U, 300n * U].entries()) assert.equal(await tokens[i].read.balanceOf([user]), before.tokens[i].balances[1] - used)
      await consistent(f)
    })
  }

  it('transferred/approved LP carries proportional removal rights; cannot burn anyone else’s LP', async () => {
    const f = await fixture()
    const { pool } = f
    const lp = (await pool.read.balanceOf([holder])) / 4n
    await send(pool.write.approve([user, lp]))
    await send(pool.write.transferFrom([holder, user, lp], { account: student.account }))
    const supply = await pool.read.totalSupply()
    const [x, y] = await pool.read.getReserves()
    const a = lp * x / supply, b = lp * y / supply
    await viem.assertions.emitWithArgs(pool.write.removeLiquidity([lp, a, b, maxUint256], { account: student.account }), pool, 'RemoveLiquidity', [getAddress(user), a, b, lp])
    assert.deepEqual(await pool.read.getReserves(), [x - a, y - b])
    assert.equal(await pool.read.balanceOf([user]), 0n)
    for (const amount of [1n, maxUint256]) await fail(pool.write.removeLiquidity([amount, 0n, 0n, maxUint256], { account: outsider.account }), pool, 'ERC20InsufficientBalance')
    await consistent(f)
  })

  it('permanent lock survives removal of every circulating LP unit', async () => {
    const { pool } = await fixture()
    await send(pool.write.removeLiquidity([await pool.read.balanceOf([holder]), 0n, 0n, maxUint256]))
    assert.equal(await pool.read.totalSupply(), 1000n)
    assert.equal(await pool.read.balanceOf([LOCK]), 1000n)
    const [x, y] = await pool.read.getReserves()
    assert.ok(x > 0n && y > 0n)
    await fail(pool.write.transferFrom([LOCK, holder, 1n]), pool, 'ERC20InsufficientAllowance')
  })

  for (const direction of [0, 1]) {
    it(`quotes and swaps direction ${direction}, retains 0.3% input fee, raises k and changes spot price`, async () => {
      const f = await fixture()
      const { tokens, pool } = f
      const [x, y] = await pool.read.getReserves()
      const [rin, rout] = direction === 0 ? [x, y] : [y, x]
      const amount = direction === 0 ? U : 30n * U
      const expected = output(amount, rin, rout)
      const noFee = rout * amount / (rin + amount)
      const [outToken, quote] = await pool.read.quoteSwap([tokens[direction].address, amount])
      assert.equal(outToken, getAddress(tokens[1 - direction].address))
      assert.equal(quote, expected)
      assert.ok(quote < noFee)
      // Compared with the no-fee marginal spot rate, execution includes fee and curve impact.
      assert.ok(quote * rin < amount * rout)
      const before = await snapshot(f)
      await send(tokens[direction].write.approve([pool.address, amount], { account: student.account }))
      await viem.assertions.emitWithArgs(pool.write.swap([tokens[direction].address, amount, expected, maxUint256], { account: student.account }), pool, 'Swap', [getAddress(user), getAddress(tokens[direction].address), outToken, amount, expected])
      const after = await snapshot(f)
      assert.equal(after.tokens[direction].balances[1], before.tokens[direction].balances[1] - amount)
      assert.equal(after.tokens[1 - direction].balances[1], before.tokens[1 - direction].balances[1] + expected)
      assert.equal(after.reserves[direction], rin + amount) // full input retained, including fee
      assert.equal(after.reserves[1 - direction], rout - expected)
      assert.ok(after.reserves[0] * after.reserves[1] > x * y)
      assert.equal(after.supply, before.supply)
      assert.deepEqual(after.lp, before.lp)
      assert.equal(await tokens[direction].read.allowance([user, pool.address]), 0n)
      await consistent(f)
    })
  }

  for (const [x, y, amount] of [[1001n, 1001n, 2n], [1001n, 30031n, 1n], [10003n, 1009n, 11n], [123456789n, 987654321n, 12345n], [U + 1n, 30n * U + 7n, 31n], [CAP / 2n, CAP / 3n, CAP / 4n]]) {
    it(`matches exact integer reference at rounding boundary ${x}/${y}/${amount}`, async () => {
      const { tokens, pool } = await fixture(false, false, CAP)
      await send(pool.write.addLiquidity([x, y, 0n, 0n, 0n, maxUint256]))
      const quote = (await pool.read.quoteSwap([tokens[0].address, amount]))[1]
      const denominator = x * 1000n + amount * 997n
      const numerator = y * amount * 997n
      assert.equal(quote, numerator / denominator)
      assert.ok(quote * denominator <= numerator && (quote + 1n) * denominator > numerator)
      await send(pool.write.swap([tokens[0].address, amount, quote, maxUint256]))
      const reserves = await pool.read.getReserves()
      assert.ok(reserves[0] * reserves[1] >= x * y)
    })
  }

  it('rejects sqrt at/below minimum; accepts one LP unit above it', async () => {
    const f = await fixture(false)
    for (const [x, y] of [[0n, 1001n], [1001n, 0n], [1n, 1n], [1000n, 1000n], [1000n, 1001n]]) {
      const before = await snapshot(f)
      await fail(f.pool.write.addLiquidity([x, y, 0n, 0n, 0n, maxUint256]), f.pool, x === 0n || y === 0n ? 'InvalidAmount' : 'InsufficientLiquidity')
      assert.deepEqual(await snapshot(f), before)
    }
    await send(f.pool.write.addLiquidity([1001n, 1001n, 0n, 0n, 1n, maxUint256]))
    assert.equal(await f.pool.read.balanceOf([holder]), 1n)
  })

  it('floors later proportional amounts and LP issuance without overissuing', async () => {
    const { pool } = await fixture(false)
    await send(pool.write.addLiquidity([10003n, 30031n, 0n, 0n, 0n, maxUint256]))
    const supply = await pool.read.totalSupply()
    const dx = 997n, dy = dx * 30031n / 10003n
    const expected = [dx * supply / 10003n, dy * supply / 30031n].reduce((a, b) => a < b ? a : b)
    await send(pool.write.addLiquidity([dx, 9999n, 0n, 0n, expected, maxUint256], { account: student.account }))
    assert.deepEqual(await pool.read.getReserves(), [10003n + dx, 30031n + dy])
    assert.equal(await pool.read.balanceOf([user]), expected)
    assert.ok(expected * 10003n <= dx * supply && expected * 30031n <= dy * supply)
  })

  it('rejects zero-rounded deposits, zero-minted LP and zero-rounded removals', async () => {
    const { tokens, pool } = await fixture()
    await fail(pool.write.addLiquidity([1n, 1n, 0n, 0n, 0n, maxUint256]), pool, 'InsufficientLiquidity')
    await fail(pool.write.removeLiquidity([1n, 0n, 0n, maxUint256]), pool, 'ZeroOutput')
    // Increase both reserves without increasing supply: a one-unit deposit cannot mint LP.
    await send(tokens[0].write.transfer([pool.address, 1000n * U]))
    await send(tokens[1].write.transfer([pool.address, 30000n * U]))
    await fail(pool.write.addLiquidity([1n, 30n, 0n, 0n, 0n, maxUint256]), pool, 'InsufficientLiquidity')
  })

  it('rejects unsupported/zero input and zero output in quote and swap', async () => {
    const { tokens, pool } = await fixture()
    for (const [token, amount, error] of [[user, U, 'UnsupportedToken'], [zeroAddress, U, 'UnsupportedToken'], [tokens[0].address, 0n, 'InvalidAmount'], [tokens[1].address, 1n, 'ZeroOutput']] as const) {
      await fail(pool.read.quoteSwap([token, amount]), pool, error)
      await fail(pool.write.swap([token, amount, 0n, maxUint256]), pool, error)
    }
  })

  it('minimum token amounts and minimum LP protect initial and subsequent deposits atomically', async () => {
    for (const initialize of [false, true]) {
      const f = await fixture(initialize)
      const supply = initialize ? await f.pool.read.totalSupply() : sqrt(100n * U * 3000n * U) - 1000n
      for (const [minX, minY, minLP, error] of [[100n * U + 1n, 0n, 0n, 'InsufficientMinimumAmount'], [0n, 3000n * U + 1n, 0n, 'InsufficientMinimumAmount'], [0n, 0n, supply + 1n, 'InsufficientLiquidity']] as const) {
        const before = await snapshot(f)
        await fail(f.pool.write.addLiquidity([100n * U, 3000n * U, minX, minY, minLP, maxUint256]), f.pool, error)
        assert.deepEqual(await snapshot(f), before)
      }
    }
  })

  it('minimum removal amounts and zero liquidity reject without burns or transfers', async () => {
    const f = await fixture()
    const lp = (await f.pool.read.balanceOf([holder])) / 2n
    for (const args of [[lp, 100n * U, 0n, maxUint256], [lp, 0n, 3000n * U, maxUint256], [0n, 0n, 0n, maxUint256]] as const) {
      const before = await snapshot(f)
      await fail(f.pool.write.removeLiquidity(args), f.pool, args[0] === 0n ? 'InvalidAmount' : 'InsufficientMinimumAmount')
      assert.deepEqual(await snapshot(f), before)
    }
  })

  it('rejects stale swap minima after another trade changes the quote', async () => {
    const f = await fixture()
    const { pool, tokens } = f
    const quote = (await pool.read.quoteSwap([tokens[0].address, U]))[1]
    await send(pool.write.swap([tokens[0].address, 10n * U, 0n, maxUint256]))
    const before = await snapshot(f)
    await fail(pool.write.swap([tokens[0].address, U, quote, maxUint256], { account: student.account }), pool, 'InsufficientMinimumAmount')
    assert.deepEqual(await snapshot(f), before)
  })

  it('rejects expired deadlines for every operation; permits deadline equal to block timestamp in simulation', async () => {
    const f = await fixture()
    const { pool, tokens } = f
    const before = await snapshot(f)
    const now = (await client.getBlock()).timestamp
    await client.simulateContract({ address: pool.address, abi: pool.abi, functionName: 'swap', args: [tokens[0].address, U, 0n, now], account: teacher.account })
    await fail(pool.write.swap([tokens[0].address, U, 0n, now - 1n]), pool, 'ExpiredDeadline')
    await fail(pool.write.addLiquidity([U, 30n * U, 0n, 0n, 0n, now - 1n]), pool, 'ExpiredDeadline')
    await fail(pool.write.removeLiquidity([U, 0n, 0n, now - 1n]), pool, 'ExpiredDeadline')
    assert.deepEqual(await snapshot(f), before)
  })

  it('balance and allowance failures roll back swaps and the second leg of deposits', async () => {
    const f = await fixture()
    const { pool, tokens } = f
    for (const allowance of [0n, U - 1n]) {
      await send(tokens[0].write.approve([pool.address, allowance], { account: student.account }))
      const before = await snapshot(f)
      await viem.assertions.revertWithCustomError(pool.write.swap([tokens[0].address, U, 0n, maxUint256], { account: student.account }), tokens[0], 'ERC20InsufficientAllowance')
      assert.deepEqual(await snapshot(f), before)
    }
    await send(tokens[0].write.approve([pool.address, maxUint256], { account: student.account }))
    let before = await snapshot(f)
    await viem.assertions.revertWithCustomError(pool.write.swap([tokens[0].address, 10001n * U, 0n, maxUint256], { account: student.account }), tokens[0], 'ERC20InsufficientBalance')
    assert.deepEqual(await snapshot(f), before)
    await send(tokens[1].write.approve([pool.address, 0n], { account: student.account }))
    before = await snapshot(f)
    await viem.assertions.revertWithCustomError(pool.write.addLiquidity([U, 30n * U, 0n, 0n, 0n, maxUint256], { account: student.account }), tokens[1], 'ERC20InsufficientAllowance')
    assert.deepEqual(await snapshot(f), before)
  })

  it('rolls back initial locked mint and first token transfer on second-token failure', async () => {
    const f = await fixture(false)
    await send(f.tokens[1].write.approve([f.pool.address, 0n]))
    const before = await snapshot(f)
    await viem.assertions.revertWithCustomError(f.pool.write.addLiquidity([U, 30n * U, 0n, 0n, 0n, maxUint256]), f.tokens[1], 'ERC20InsufficientAllowance')
    assert.deepEqual(await snapshot(f), before)
  })

  it('handles exact reserve cap, one-unit excess and uint256 max without overflow panics', async () => {
    const { tokens, pool } = await fixture(false, false, maxUint256)
    for (const amount of [CAP + 1n, maxUint256]) await fail(pool.write.addLiquidity([amount, U, 0n, 0n, 0n, maxUint256]), pool, 'ReserveLimitExceeded')
    await send(pool.write.addLiquidity([CAP - U, CAP / 2n, 0n, 0n, 0n, maxUint256]))
    for (const amount of [U + 1n, maxUint256]) {
      await fail(pool.read.quoteSwap([tokens[0].address, amount]), pool, 'ReserveLimitExceeded')
      await fail(pool.write.swap([tokens[0].address, amount, 0n, maxUint256]), pool, 'ReserveLimitExceeded')
    }
    await send(pool.write.swap([tokens[0].address, U, 0n, maxUint256]))
    assert.equal((await pool.read.getReserves())[0], CAP)
    await fail(pool.write.addLiquidity([1n, 1n, 0n, 0n, 0n, maxUint256]), pool, 'ReserveLimitExceeded')
    await send(pool.write.removeLiquidity([await pool.read.balanceOf([holder]), 0n, 0n, maxUint256]))
  })

  it('direct transfers before initialization mint nothing, show no price and accrue only after a real deposit', async () => {
    const { tokens, pool } = await fixture(false)
    await send(tokens[0].write.transfer([pool.address, U]))
    await send(tokens[1].write.transfer([pool.address, 2n * U]))
    assert.deepEqual(await pool.read.getReserves(), [0n, 0n])
    await fail(pool.read.quoteSwap([tokens[0].address, U]), pool, 'UninitializedPool')
    await send(pool.write.addLiquidity([U, 30n * U, 0n, 0n, 0n, maxUint256], { account: student.account }))
    assert.equal(await pool.read.balanceOf([holder]), 0n)
    assert.equal(await pool.read.totalSupply(), sqrt(U * 30n * U))
    assert.deepEqual(await pool.read.getReserves(), [2n * U, 32n * U])
  })

  it('donations change quotes and LP claims immediately; later LP cannot capture them for free', async () => {
    const f = await fixture()
    const { pool, tokens } = f
    const supply = await pool.read.totalSupply()
    const quote = (await pool.read.quoteSwap([tokens[0].address, U]))[1]
    await send(tokens[1].write.transfer([pool.address, 3000n * U], { account: student.account }))
    assert.deepEqual(await pool.read.getReserves(), [100n * U, 6000n * U])
    assert.equal(await pool.read.totalSupply(), supply)
    assert.equal(await pool.read.balanceOf([user]), 0n)
    assert.equal((await pool.read.quoteSwap([tokens[0].address, U]))[1], output(U, 100n * U, 6000n * U))
    assert.ok((await pool.read.quoteSwap([tokens[0].address, U]))[1] > quote)
    await send(pool.write.addLiquidity([10n * U, 600n * U, 0n, 0n, 0n, maxUint256], { account: student.account }))
    const lp = await pool.read.balanceOf([user])
    assert.equal(lp, supply / 10n)
    const before = await snapshot(f)
    await send(pool.write.removeLiquidity([lp, 0n, 0n, maxUint256], { account: student.account }))
    const after = await snapshot(f)
    assert.ok(after.tokens[0].balances[1] - before.tokens[0].balances[1] <= 10n * U)
    assert.ok(after.tokens[1].balances[1] - before.tokens[1].balances[1] <= 600n * U)
    await consistent(f)
  })

  it('mixed swaps and multiple LP operations preserve backing, supplies and fee claims', async () => {
    const f = await fixture()
    const { tokens, pool } = f
    const original = await snapshot(f)
    await send(pool.write.addLiquidity([10n * U, 300n * U, 0n, 0n, 0n, maxUint256], { account: student.account }))
    const supply = await pool.read.totalSupply()
    const share = await pool.read.balanceOf([user])
    for (let i = 0; i < 12; i++) {
      const d = i % 2
      const [x, y] = await pool.read.getReserves()
      const amount = d === 0 ? U : 30n * U
      await send(pool.write.swap([tokens[d].address, amount, 0n, maxUint256], { account: (i % 3 === 0 ? student : teacher).account }))
      const [nx, ny] = await pool.read.getReserves()
      assert.ok(nx * ny >= x * y)
      assert.equal(await pool.read.totalSupply(), supply)
      assert.equal(await pool.read.balanceOf([user]), share)
      await consistent(f)
    }
    const [x, y] = await pool.read.getReserves()
    const before = await snapshot(f)
    await send(pool.write.removeLiquidity([share, share * x / supply, share * y / supply, maxUint256], { account: student.account }))
    const after = await snapshot(f)
    assert.equal(after.tokens[0].balances[1] - before.tokens[0].balances[1], share * x / supply)
    assert.equal(after.tokens[1].balances[1] - before.tokens[1].balances[1], share * y / supply)
    for (const i of [0, 1]) assert.equal(after.tokens[i].supply, original.tokens[i].supply)
    await consistent(f)
  })

  it('output-transfer failures revert swaps and removals including LP burns, allowance and events', async () => {
    const f = await fixture(true, true)
    const { tokens, pool } = f
    const bad = await viem.getContractAt('AMMTestToken', tokens[1].address)
    await send(bad.write.setRejectTransfer([true]))
    const before = await snapshot(f)
    await fail(pool.write.swap([tokens[0].address, U, 0n, maxUint256], { gas: 1_000_000n }), pool, 'SafeERC20FailedOperation')
    assert.deepEqual(await snapshot(f), before)
    await fail(pool.write.removeLiquidity([U, 0n, 0n, maxUint256], { gas: 1_000_000n }), pool, 'SafeERC20FailedOperation')
    assert.deepEqual(await snapshot(f), before)
    assert.equal((await client.getContractEvents({ address: pool.address, abi: pool.abi, eventName: 'Swap', fromBlock: 0n })).length, 0)
    assert.equal((await client.getContractEvents({ address: pool.address, abi: pool.abi, eventName: 'RemoveLiquidity', fromBlock: 0n })).length, 0)
  })

  it('blocks callbacks into all three operations during input/output transfers; rolls back completely', async () => {
    const f = await fixture(true, true)
    const { tokens, pool } = f
    const bad = await viem.getContractAt('AMMTestToken', tokens[0].address)
    const calls = [
      encodeFunctionData({ abi: pool.abi, functionName: 'swap', args: [tokens[0].address, U, 0n, maxUint256] }),
      encodeFunctionData({ abi: pool.abi, functionName: 'addLiquidity', args: [U, 30n * U, 0n, 0n, 0n, maxUint256] }),
      encodeFunctionData({ abi: pool.abi, functionName: 'removeLiquidity', args: [1n, 0n, 0n, maxUint256] }),
    ]
    for (const data of calls) {
      await send(bad.write.setCallback([pool.address, data]))
      const before = await snapshot(f)
      await fail(pool.write.swap([tokens[0].address, U, 0n, maxUint256], { gas: 1_000_000n }), pool, 'ReentrancyGuardReentrantCall')
      await fail(pool.write.swap([tokens[1].address, 30n * U, 0n, maxUint256], { gas: 1_000_000n }), pool, 'ReentrancyGuardReentrantCall')
      await fail(pool.write.addLiquidity([U, 30n * U, 0n, 0n, 0n, maxUint256], { gas: 1_000_000n }), pool, 'ReentrancyGuardReentrantCall')
      await fail(pool.write.removeLiquidity([U, 0n, 0n, maxUint256], { gas: 1_000_000n }), pool, 'ReentrancyGuardReentrantCall')
      assert.deepEqual(await snapshot(f), before)
    }
  })

  it('rejects an initialized pool whose nonstandard token has destroyed a reserve', async () => {
    const { pool, tokens } = await fixture(true, true)
    const bad = await viem.getContractAt('AMMTestToken', tokens[0].address)
    await send(bad.write.destroyBalance([pool.address]))
    assert.deepEqual(await pool.read.getReserves(), [0n, 3000n * U])
    await fail(pool.read.quoteSwap([tokens[1].address, U]), pool, 'InsufficientReserve')
    await fail(pool.write.swap([tokens[0].address, U, 0n, maxUint256]), pool, 'InsufficientReserve')
    await fail(pool.write.addLiquidity([U, U, 0n, 0n, 0n, maxUint256]), pool, 'InsufficientReserve')
  })

  it('rejects nonstandard transfer deltas atomically', async () => {
    const f = await fixture(true, true)
    const { pool, tokens } = f
    const bad = await viem.getContractAt('AMMTestToken', tokens[0].address)
    await send(bad.write.setShortTransfer([true]))
    const before = await snapshot(f)
    await fail(pool.write.swap([tokens[0].address, U, 0n, maxUint256]), pool, 'UnexpectedTokenBalance')
    await fail(pool.write.addLiquidity([U, 30n * U, 0n, 0n, 0n, maxUint256]), pool, 'UnexpectedTokenBalance')
    await fail(pool.write.removeLiquidity([U, 0n, 0n, maxUint256]), pool, 'UnexpectedTokenBalance')
    assert.deepEqual(await snapshot(f), before)
  })

  it('exposes only the intended operations, queries and standard ERC20, with no administrative withdrawal or mint', async () => {
    const { abi } = await artifacts.readArtifact('DPLAMMPool')
    assert.deepEqual(abi.filter((e) => e.type === 'function').map((e) => e.name).sort(), [
      'dplt', 'assetA', 'MINIMUM_LIQUIDITY', 'LOCKED_LIQUIDITY_ADDRESS', 'MAX_RESERVE', 'FEE_BPS',
      'getReserves', 'quoteSwap', 'swap', 'addLiquidity', 'removeLiquidity',
      'allowance', 'approve', 'balanceOf', 'decimals', 'name', 'symbol', 'totalSupply', 'transfer', 'transferFrom',
    ].sort())
    const { pool } = await fixture()
    for (const data of ['0x40c10f19', '0x2e1a7d4d', '0x8456cb59'] as const) await assert.rejects(client.call({ account: teacher.account, to: pool.address, data }))
  })

  it('deploys the actual Ignition module with local parameters without approval, funding or initialization', async () => {
    const { tokens } = await fixture(false)
    const before = await Promise.all(tokens.map((t) => t.read.balanceOf([holder])))
    const { pool } = await connection.ignition.deploy(PoolModule, { parameters: { DPLAMMPool: { dplt: tokens[0].address, assetA: tokens[1].address } } })
    assert.equal(await pool.read.dplt(), getAddress(tokens[0].address))
    assert.equal(await pool.read.assetA(), getAddress(tokens[1].address))
    assert.deepEqual(await pool.read.getReserves(), [0n, 0n])
    assert.equal(await pool.read.totalSupply(), 0n)
    assert.deepEqual(await Promise.all(tokens.map((t) => t.read.balanceOf([holder]))), before)
    for (const token of tokens) assert.equal(await token.read.allowance([holder, pool.address]), 0n)
  })
})
