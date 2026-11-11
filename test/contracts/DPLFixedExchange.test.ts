import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getAddress, maxUint256, zeroAddress, type Address } from 'viem'
import ExchangeModule from '../../ignition/modules/DPLFixedExchange.ts'
import { prepareExchangePlan } from '../../scripts/contracts/exchange-spec.ts'

const UNIT = 10n ** 18n
const SUPPLY = 1_000_000n * UNIT
const pairs = [
  [0, 1, 30n, 1n], [1, 0, 1n, 30n],
  [2, 1, 9n, 2n], [1, 2, 2n, 9n],
  [0, 2, 20n, 3n], [2, 0, 3n, 20n],
] as const

describe('DPLFixedExchange — local EDR only', async () => {
  const connection = await network.create()
  const { viem } = connection
  const client = await viem.getPublicClient()
  const [deployer, teacher, student, outsider] = await viem.getWalletClients()
  const holder = teacher.account.address
  const user = student.account.address
  const send = async (tx: Promise<`0x${string}`>) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await tx })
    assert.equal(receipt.status, 'success')
    return receipt
  }
  const fixture = async (fund = true) => {
    const tokens = await Promise.all(['DPLT', 'DPLT-A', 'DPLT-B'].map((name) =>
      viem.deployContract('TeachingToken', [name, name, holder, SUPPLY])))
    const addresses = tokens.map((t) => t.address)
    const exchange = await viem.deployContract('DPLFixedExchange', [addresses[0], addresses[1], addresses[2], holder])
    for (const token of tokens) {
      await send(token.write.transfer([user, 1000n * UNIT], { account: teacher.account }))
      if (fund) await send(token.write.transfer([exchange.address, 30_000n * UNIT], { account: teacher.account }))
    }
    return { tokens, addresses, exchange }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  type BalanceToken = { read: {
    balanceOf: (args: readonly [Address]) => Promise<bigint>
    allowance: (args: readonly [Address, Address]) => Promise<bigint>
    totalSupply: () => Promise<bigint>
  } }
  const snapshot = async ({ tokens, exchange }: { tokens: BalanceToken[], exchange: { address: Address } }) => Promise.all(tokens.map(async (t) => [
    await t.read.balanceOf([user]), await t.read.balanceOf([exchange.address]),
    await t.read.allowance([user, exchange.address]), await t.read.totalSupply(),
  ]))
  const expectError = async (action: Promise<unknown>, contract: Fixture['exchange'], name: Extract<Fixture['exchange']['abi'][number], { type: 'error' }>['name']) =>
    viem.assertions.revertWithCustomError(action, contract, name)

  it('deploys with three correct immutable addresses and an explicit owner independent of deployer', async () => {
    const { exchange, addresses } = await fixture(false)
    assert.deepEqual([await exchange.read.dplt(), await exchange.read.assetA(), await exchange.read.assetB()], addresses.map((address) => getAddress(address)))
    assert.equal(await exchange.read.owner(), getAddress(holder))
    assert.notEqual(await exchange.read.owner(), getAddress(deployer.account.address))
    assert.equal(await exchange.read.paused(), false)
  })

  for (const index of [0, 1, 2]) {
    it(`rejects zero, EOA and duplicate token at position ${index}`, async () => {
      const { addresses, exchange } = await fixture(false)
      for (const invalid of [zeroAddress, user, addresses[(index + 1) % 3]]) {
        const args = [...addresses]
        args[index] = invalid
        await expectError(viem.deployContract('DPLFixedExchange', [args[0], args[1], args[2], holder]), exchange,
          invalid === addresses[(index + 1) % 3] ? 'DuplicateToken' : 'InvalidToken')
      }
    })
  }
  it('rejects a zero administrator and non-18-decimal or non-ERC20 contracts', async () => {
    const { addresses, exchange } = await fixture(false)
    await expectError(viem.deployContract('DPLFixedExchange', [addresses[0], addresses[1], addresses[2], zeroAddress]), exchange, 'OwnableInvalidOwner')
    const bad = await viem.deployContract('ExchangeTestToken', [holder, 6])
    for (const invalid of [bad.address, exchange.address]) {
      await expectError(viem.deployContract('DPLFixedExchange', [invalid, addresses[1], addresses[2], holder]), exchange, 'InvalidToken')
    }
  })

  for (const [i, o, n, d] of pairs) {
    it(`quotes exact and fractional base-unit amounts ${i} → ${o}`, async () => {
      const { exchange, addresses: a } = await fixture(false)
      for (const input of [UNIT, 123_456_789_012_345_679n, 31n]) {
        assert.equal(await exchange.read.quote([a[i], a[o], input]), input * n / d)
      }
    })
    it(`round trips ${i} → ${o} without creating base units`, async () => {
      const { exchange, addresses: a } = await fixture(false)
      for (const input of [UNIT, 123_456_789_012_345_679n, 1001n]) {
        const output = await exchange.read.quote([a[i], a[o], input])
        assert.ok(await exchange.read.quote([a[o], a[i], output]) <= input)
      }
    })
    it(`swaps ${i} → ${o} at its exact input cap, preserves all supplies and emits exact event`, async () => {
      const f = await fixture()
      const { tokens, addresses: a, exchange } = f
      const input = [10n * UNIT, 300n * UNIT, 600n * UNIT / 9n][i]
      const output = input * n / d
      await send(tokens[i].write.approve([exchange.address, input], { account: student.account }))
      const before = await snapshot(f)
      await viem.assertions.emitWithArgs(exchange.write.swap([a[i], a[o], input, output], { account: student.account }), exchange, 'Swap',
        [getAddress(user), getAddress(a[i]), getAddress(a[o]), input, output])
      const after = await snapshot(f)
      for (let k = 0; k < 3; k++) {
        const delta = k === i ? -input : k === o ? output : 0n
        assert.equal(after[k][0], before[k][0] + delta)
        assert.equal(after[k][1], before[k][1] - delta)
        assert.equal(after[k][2], 0n)
        assert.equal(after[k][3], SUPPLY)
        assert.equal(await exchange.read.reserveOf([a[k]]), after[k][1])
      }
    })
    it(`rejects one unit above cap and uint256 max for ${i} → ${o} with a clear limit error`, async () => {
      const { exchange, addresses: a } = await fixture(false)
      for (const amount of [[10n * UNIT, 300n * UNIT, 600n * UNIT / 9n][i] + 1n, maxUint256]) {
        await expectError(exchange.read.quote([a[i], a[o], amount]), exchange, 'AmountExceedsLimit')
        await expectError(exchange.write.swap([a[i], a[o], amount, 0n], { account: student.account }), exchange, 'AmountExceedsLimit')
      }
    })
  }

  it('rejects zero input and rounding to zero in both quote and swap', async () => {
    const { exchange, addresses: a } = await fixture(false)
    for (const [i, o, amount, error] of [[0, 1, 0n, 'InvalidAmount'], [1, 0, 29n, 'ZeroOutput'], [1, 2, 4n, 'ZeroOutput'], [2, 0, 6n, 'ZeroOutput']] as const) {
      await expectError(exchange.read.quote([a[i], a[o], amount]), exchange, error)
      await expectError(exchange.write.swap([a[i], a[o], amount, 0n], { account: student.account }), exchange, error)
    }
    assert.equal(await exchange.read.quote([a[1], a[0], 30n]), 1n)
    assert.equal(await exchange.read.quote([a[1], a[2], 5n]), 1n)
    assert.equal(await exchange.read.quote([a[2], a[0], 7n]), 1n)
  })
  it('rejects unsupported input/output/reserve and identical pairs', async () => {
    const { exchange, addresses: a } = await fixture(false)
    for (const [input, output, error] of [[user, a[1], 'UnsupportedToken'], [a[0], zeroAddress, 'UnsupportedToken'], [a[0], a[0], 'SameToken']] as const) {
      await expectError(exchange.read.quote([input, output, UNIT]), exchange, error)
      await expectError(exchange.write.swap([input, output, UNIT, 0n], { account: student.account }), exchange, error)
    }
    await expectError(exchange.read.reserveOf([user]), exchange, 'UnsupportedToken')
  })
  for (const reserve of [0n, 30n * UNIT - 1n]) {
    it(`rejects insufficient actual reserve ${reserve} atomically`, async () => {
      const f = await fixture(false)
      const { exchange, tokens, addresses: a } = f
      if (reserve) await send(tokens[1].write.transfer([exchange.address, reserve], { account: teacher.account }))
      await send(tokens[0].write.approve([exchange.address, UNIT], { account: student.account }))
      const before = await snapshot(f)
      await expectError(exchange.write.swap([a[0], a[1], UNIT, 0n], { account: student.account }), exchange, 'InsufficientReserve')
      assert.deepEqual(await snapshot(f), before)
    })
  }
  it('allows exact reserve exhaustion and minAmountOut zero', async () => {
    const { exchange, tokens, addresses: a } = await fixture(false)
    await send(tokens[1].write.transfer([exchange.address, 30n * UNIT], { account: teacher.account }))
    await send(tokens[0].write.approve([exchange.address, UNIT], { account: student.account }))
    await send(exchange.write.swap([a[0], a[1], UNIT, 0n], { account: student.account }))
    assert.equal(await exchange.read.reserveOf([a[1]]), 0n)
  })
  it('rejects an excessive minimum atomically', async () => {
    const f = await fixture()
    const { exchange, tokens, addresses: a } = f
    await send(tokens[0].write.approve([exchange.address, UNIT], { account: student.account }))
    const before = await snapshot(f)
    await expectError(exchange.write.swap([a[0], a[1], UNIT, 30n * UNIT + 1n], { account: student.account }), exchange, 'InsufficientOutputAmount')
    assert.deepEqual(await snapshot(f), before)
  })
  it('rejects missing/insufficient approval without changing reserves, student balances or allowance', async () => {
    const f = await fixture()
    const { exchange, tokens, addresses: a } = f
    for (const allowance of [0n, UNIT - 1n]) {
      await send(tokens[0].write.approve([exchange.address, allowance], { account: student.account }))
      const before = await snapshot(f)
      await viem.assertions.revertWithCustomError(exchange.write.swap([a[0], a[1], UNIT, 0n], { account: student.account }), tokens[0], 'ERC20InsufficientAllowance')
      assert.deepEqual(await snapshot(f), before)
    }
  })
  it('rejects insufficient student balance atomically even with sufficient approval', async () => {
    const f = await fixture()
    const { exchange, tokens, addresses: a } = f
    await send(tokens[0].write.transfer([holder, 1000n * UNIT], { account: student.account }))
    await send(tokens[0].write.approve([exchange.address, UNIT], { account: student.account }))
    const before = await snapshot(f)
    await viem.assertions.revertWithCustomError(exchange.write.swap([a[0], a[1], UNIT, 0n], { account: student.account }), tokens[0], 'ERC20InsufficientBalance')
    assert.deepEqual(await snapshot(f), before)
  })
  it('permits only owner pause/unpause; quotes remain readable and unpause restores public swaps', async () => {
    const { exchange, tokens, addresses: a } = await fixture()
    for (const account of [student.account, deployer.account]) {
      await expectError(exchange.write.pause({ account }), exchange, 'OwnableUnauthorizedAccount')
      await expectError(exchange.write.unpause({ account }), exchange, 'OwnableUnauthorizedAccount')
    }
    await viem.assertions.emitWithArgs(exchange.write.pause({ account: teacher.account }), exchange, 'Paused', [getAddress(holder)])
    assert.equal(await exchange.read.quote([a[0], a[1], UNIT]), 30n * UNIT)
    await expectError(exchange.write.swap([a[0], a[1], UNIT, 0n], { account: student.account }), exchange, 'EnforcedPause')
    await viem.assertions.emitWithArgs(exchange.write.unpause({ account: teacher.account }), exchange, 'Unpaused', [getAddress(holder)])
    await send(tokens[0].write.approve([exchange.address, UNIT], { account: student.account }))
    await send(exchange.write.swap([a[0], a[1], UNIT, 0n], { account: student.account }))
  })
  for (const paused of [false, true]) {
    it(`withdraws only owner reserves with event, paused=${paused}`, async () => {
      const { exchange, tokens, addresses: a } = await fixture()
      if (paused) await send(exchange.write.pause({ account: teacher.account }))
      const studentBalance = await tokens[0].read.balanceOf([user])
      const recipient = outsider.account.address
      await expectError(exchange.write.withdrawReserve([a[0], UNIT, recipient], { account: student.account }), exchange, 'OwnableUnauthorizedAccount')
      await viem.assertions.emitWithArgs(exchange.write.withdrawReserve([a[0], UNIT, recipient], { account: teacher.account }), exchange, 'ReserveWithdrawn', [getAddress(a[0]), getAddress(recipient), UNIT])
      assert.equal(await exchange.read.reserveOf([a[0]]), 29_999n * UNIT)
      assert.equal(await tokens[0].read.balanceOf([recipient]), UNIT)
      assert.equal(await tokens[0].read.balanceOf([user]), studentBalance)
    })
  }
  it('rejects unsupported withdrawal, zero recipient/amount and excessive withdrawal', async () => {
    const { exchange, addresses: a } = await fixture()
    for (const [token, amount, recipient, error] of [[user, UNIT, holder, 'UnsupportedToken'], [a[0], UNIT, zeroAddress, 'InvalidRecipient'], [a[0], 0n, holder, 'InvalidAmount'], [a[0], 30_000n * UNIT + 1n, holder, 'InsufficientReserve']] as const) {
      await expectError(exchange.write.withdrawReserve([token, amount, recipient], { account: teacher.account }), exchange, error)
    }
  })
  it('transfers ownership without granting the deployer permanent privileges', async () => {
    const { exchange } = await fixture(false)
    await send(exchange.write.transferOwnership([user], { account: teacher.account }))
    await expectError(exchange.write.pause({ account: teacher.account }), exchange, 'OwnableUnauthorizedAccount')
    await send(exchange.write.pause({ account: student.account }))
  })
  it('rolls back input transfer and spent allowance if output transfer returns false', async () => {
    const { tokens, addresses: a } = await fixture(false)
    const output = await viem.deployContract('ExchangeTestToken', [holder, 18])
    const exchange = await viem.deployContract('DPLFixedExchange', [a[0], output.address, a[2], holder])
    await send(output.write.transfer([exchange.address, 30n * UNIT], { account: teacher.account }))
    await send(output.write.setRejectTransfer([true]))
    await send(tokens[0].write.approve([exchange.address, UNIT], { account: student.account }))
    const f = { exchange, addresses: [a[0], output.address, a[2]], tokens: [tokens[0], output, tokens[2]] }
    const before = await snapshot(f)
    await expectError(exchange.write.swap([a[0], output.address, UNIT, 0n], { account: student.account, gas: 1_000_000n }), exchange, 'SafeERC20FailedOperation')
    assert.deepEqual(await snapshot(f), before)
    const events = await client.getContractEvents({ address: exchange.address, abi: exchange.abi, eventName: 'Swap', fromBlock: 0n })
    assert.equal(events.length, 0)
  })
  it('blocks token callbacks reentering swap or withdrawal and rolls back the entire operation', async () => {
    const { tokens, addresses: a } = await fixture(false)
    const input = await viem.deployContract('ExchangeTestToken', [holder, 18])
    const exchange = await viem.deployContract('DPLFixedExchange', [input.address, a[1], a[2], input.address])
    await send(input.write.transfer([user, UNIT], { account: teacher.account }))
    await send(tokens[1].write.transfer([exchange.address, 30n * UNIT], { account: teacher.account }))
    await send(input.write.approve([exchange.address, UNIT], { account: student.account }))
    const f = { exchange, addresses: [input.address, a[1], a[2]], tokens: [input, tokens[1], tokens[2]] }
    for (const data of [
      encodeFunctionData({ abi: exchange.abi, functionName: 'swap', args: [input.address, a[1], UNIT, 0n] }),
      encodeFunctionData({ abi: exchange.abi, functionName: 'withdrawReserve', args: [a[1], UNIT, user] }),
    ]) {
      await send(input.write.setCallback([exchange.address, data]))
      const before = await snapshot(f)
      await expectError(exchange.write.swap([input.address, a[1], UNIT, 0n], { account: student.account, gas: 1_000_000n }), exchange, 'ReentrancyGuardReentrantCall')
      assert.deepEqual(await snapshot(f), before)
    }
  })
  it('deploys the real Ignition module with local addresses, empty reserves and explicit owner', async () => {
    const { addresses: a } = await fixture(false)
    const { exchange } = await connection.ignition.deploy(ExchangeModule, { parameters: { DPLFixedExchange: { dplt: a[0], assetA: a[1], assetB: a[2], administrator: holder } } })
    assert.equal(await exchange.read.owner(), getAddress(holder))
    for (const address of a) assert.equal(await exchange.read.reserveOf([address]), 0n)
  })
})

describe('Exchange Sepolia preparation — offline only', () => {
  const a = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002', '0x0000000000000000000000000000000000000003', '0x0000000000000000000000000000000000000004'] as const
  it('requires Sepolia chain ID', () => {
    for (const id of [1, 31337, Number.NaN]) assert.throws(() => prepareExchangePlan(id, ...a), /Sepolia/)
  })
  it('validates all explicit addresses and token uniqueness', () => {
    for (let i = 0; i < 4; i++) {
      for (const bad of ['', '0x123', zeroAddress, '0x52908400098527886E0F7030069857D2E4169Ee7']) {
        const args = [...a] as string[]
        args[i] = bad
        assert.throws(() => prepareExchangePlan(11155111, args[0], args[1], args[2], args[3]), /nonzero address/)
      }
    }
    assert.throws(() => prepareExchangePlan(11155111, a[0], a[0], a[2], a[3]), /distinct/)
  })
  it('produces exact constructor and Ignition parameters with no fictional deployment address', () => {
    const plan = prepareExchangePlan(11155111, ...a)
    assert.deepEqual(plan.constructorArgs, a)
    assert.equal(plan.deployedAddress, null)
    assert.deepEqual(plan.parameters.DPLFixedExchange, { dplt: a[0], assetA: a[1], assetB: a[2], administrator: a[3] })
  })
})
