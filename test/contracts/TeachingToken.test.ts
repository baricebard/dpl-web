import { teachingTokenRuntime } from '../../src/config/teachingTokenRuntime.ts'
import { matchesRuntime } from '../../src/lib/web3/runtimeIntegrity.ts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { artifacts, network } from 'hardhat'
import { getAddress, zeroAddress } from 'viem'
import TeachingTokens from '../../ignition/modules/TeachingTokens.ts'
import { INITIAL_SUPPLY, prepareSepoliaPlan, TOKENS } from '../../scripts/contracts/spec.ts'

describe('TeachingToken — local EDR only', async () => {
  const connection = await network.create()
  const { viem } = connection
  const client = await viem.getPublicClient()
  const [deployer, teacher, student, spender] = await viem.getWalletClients()
  const holder = teacher.account.address
  const recipient = student.account.address
  const delegate = spender.account.address
  const fixture = async () => viem.deployContract('TeachingToken', [TOKENS[0].name, TOKENS[0].symbol, holder, INITIAL_SUPPLY])
  const send = async (tx: Promise<`0x${string}`>) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await tx })
    assert.equal(receipt.status, 'success')
    return receipt
  }

  for (const spec of TOKENS) {
    describe(spec.symbol, () => {
      it('deploys bytecode with the exact name and symbol', async () => {
        const token = await viem.deployContract('TeachingToken', [spec.name, spec.symbol, holder, INITIAL_SUPPLY])
        assert.equal(matchesRuntime(await client.getCode({ address: token.address }), teachingTokenRuntime), true)
        assert.equal(await token.read.name(), spec.name)
        assert.equal(await token.read.symbol(), spec.symbol)
      })
      it('has 18 decimals and assigns the entire integer supply to the explicit teacher', async () => {
        const token = await viem.deployContract('TeachingToken', [spec.name, spec.symbol, holder, INITIAL_SUPPLY])
        assert.equal(await token.read.decimals(), 18)
        assert.equal(await token.read.totalSupply(), 1_000_000_000_000_000_000_000_000n)
        assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY)
        assert.equal(await token.read.balanceOf([deployer.account.address]), 0n)
      })
    })
  }

  it('emits the constructor mint Transfer event to the teacher', async () => {
    const token = await fixture()
    const events = await client.getContractEvents({ address: token.address, abi: token.abi, eventName: 'Transfer', fromBlock: 0n, strict: true })
    assert.equal(events.length, 1)
    assert.deepEqual(events[0].args, { from: zeroAddress, to: getAddress(holder), value: INITIAL_SUPPLY })
  })

  it('transfers the exact amount without tax, updates both balances and emits Transfer', async () => {
    const token = await fixture()
    const amount = 123n * 10n ** 18n
    const receipt = await send(token.write.transfer([recipient, amount], { account: teacher.account }))
    assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY - amount)
    assert.equal(await token.read.balanceOf([recipient]), amount)
    assert.equal(await token.read.balanceOf([deployer.account.address]), 0n)
    const events = await client.getContractEvents({ address: token.address, abi: token.abi, eventName: 'Transfer', fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber, strict: true })
    assert.equal(events.length, 1)
    assert.deepEqual(events[0].args, { from: getAddress(holder), to: getAddress(recipient), value: amount })
  })

  it('reverts on insufficient balance and leaves state unchanged', async () => {
    const token = await fixture()
    await viem.assertions.revertWithCustomError(token.write.transfer([recipient, INITIAL_SUPPLY + 1n], { account: teacher.account }), token, 'ERC20InsufficientBalance')
    assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY)
    assert.equal(await token.read.balanceOf([recipient]), 0n)
  })

  it('reverts on transfer to the zero address', async () => {
    const token = await fixture()
    await viem.assertions.revertWithCustomError(token.write.transfer([zeroAddress, 1n], { account: teacher.account }), token, 'ERC20InvalidReceiver')
  })

  it('approves an exact allowance and emits Approval', async () => {
    const token = await fixture()
    await viem.assertions.emitWithArgs(token.write.approve([delegate, 100n], { account: teacher.account }), token, 'Approval', [getAddress(holder), getAddress(delegate), 100n])
    assert.equal(await token.read.allowance([holder, delegate]), 100n)
  })

  it('transferFrom moves exact balances and decreases finite allowance', async () => {
    const token = await fixture()
    await send(token.write.approve([delegate, 100n], { account: teacher.account }))
    await send(token.write.transferFrom([holder, recipient, 40n], { account: spender.account }))
    assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY - 40n)
    assert.equal(await token.read.balanceOf([recipient]), 40n)
    assert.equal(await token.read.allowance([holder, delegate]), 60n)
  })

  it('rejects excess transferFrom without changing allowance or balances', async () => {
    const token = await fixture()
    await send(token.write.approve([delegate, 10n], { account: teacher.account }))
    await viem.assertions.revertWithCustomError(token.write.transferFrom([holder, recipient, 11n], { account: spender.account }), token, 'ERC20InsufficientAllowance')
    assert.equal(await token.read.allowance([holder, delegate]), 10n)
    assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY)
    assert.equal(await token.read.balanceOf([recipient]), 0n)
  })

  it('rejects an unapproved spender', async () => {
    const token = await fixture()
    await viem.assertions.revertWithCustomError(token.write.transferFrom([holder, recipient, 1n], { account: student.account }), token, 'ERC20InsufficientAllowance')
  })

  it('rejects a zero initial holder at deployment', async () => {
    const token = await fixture()
    // Assert the OpenZeppelin error rather than accepting an arbitrary deployment failure.
    await viem.assertions.revertWithCustomError(viem.deployContract('TeachingToken', ['Invalid', 'BAD', zeroAddress, INITIAL_SUPPLY]), token, 'ERC20InvalidReceiver')
  })

  it('accepts custom constructor metadata and a base-unit supply', async () => {
    const token = await viem.deployContract('TeachingToken', ['Custom', 'C', holder, 7n])
    assert.equal(await token.read.totalSupply(), 7n)
    assert.equal(await token.read.balanceOf([holder]), 7n)
    assert.equal(await token.read.name(), 'Custom')
  })

  it('exposes only standard ERC20 functions, with no mint or administration', async () => {
    const { abi } = await artifacts.readArtifact('TeachingToken')
    assert.deepEqual(abi.filter((entry) => entry.type === 'function').map((entry) => entry.name).sort(), [
      'allowance', 'approve', 'balanceOf', 'decimals', 'name', 'symbol', 'totalSupply', 'transfer', 'transferFrom',
    ].sort())
    const token = await fixture()
    // Unknown mint selector must also fail on deployed bytecode.
    await assert.rejects(client.call({ account: deployer.account, to: token.address, data: '0x40c10f19' }))
  })

  it('deploys the actual Ignition module as three independent instances', async () => {
    const { dplt, assetA, assetB } = await connection.ignition.deploy(TeachingTokens, { parameters: { TeachingTokens: { initialHolder: holder } } })
    assert.equal(new Set([dplt.address, assetA.address, assetB.address]).size, 3)
    for (const [i, token] of [dplt, assetA, assetB].entries()) {
      assert.equal(await token.read.name(), TOKENS[i].name)
      assert.equal(await token.read.symbol(), TOKENS[i].symbol)
      assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY)
    }
    await send(dplt.write.transfer([recipient, 77n], { account: teacher.account }))
    await send(assetA.write.approve([delegate, 9n], { account: teacher.account }))
    assert.equal(await dplt.read.balanceOf([recipient]), 77n)
    for (const token of [assetA, assetB]) {
      assert.equal(await token.read.balanceOf([recipient]), 0n)
      assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY)
    }
    assert.equal(await dplt.read.allowance([holder, delegate]), 0n)
    assert.equal(await assetB.read.allowance([holder, delegate]), 0n)
    for (const token of [dplt, assetA, assetB]) assert.equal(await token.read.totalSupply(), INITIAL_SUPPLY)
  })

  it('preserves integer precision for one base unit and fractional token transfers', async () => {
    const token = await fixture()
    for (const amount of [1n, 123_456_789_012_345_678n]) {
      await send(token.write.transfer([recipient, amount], { account: teacher.account }))
    }
    assert.equal(await token.read.balanceOf([recipient]), 123_456_789_012_345_679n)
    assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY - 123_456_789_012_345_679n)
  })

  it('keeps fixed supply across transfer, approve, transferFrom and revocation', async () => {
    const token = await fixture()
    const operations = [
      () => token.write.transfer([recipient, 1n], { account: teacher.account }),
      () => token.write.approve([delegate, 100n], { account: teacher.account }),
      () => token.write.transferFrom([holder, recipient, 50n], { account: spender.account }),
      () => token.write.approve([delegate, 0n], { account: teacher.account }),
    ]
    for (const operation of operations) {
      await send(operation())
      assert.equal(await token.read.totalSupply(), INITIAL_SUPPLY)
      assert.equal((await token.read.balanceOf([holder])) + (await token.read.balanceOf([recipient])), INITIAL_SUPPLY)
    }
  })

  it('allows standard zero-value and self transfers without changing supply', async () => {
    const token = await fixture()
    await send(token.write.transfer([recipient, 0n], { account: teacher.account }))
    await send(token.write.transfer([holder, 1n], { account: teacher.account }))
    assert.equal(await token.read.balanceOf([holder]), INITIAL_SUPPLY)
    assert.equal(await token.read.totalSupply(), INITIAL_SUPPLY)
  })
})

describe('Sepolia preparation guards (offline)', () => {
  it('rejects mainnet, local and missing chain IDs', () => {
    for (const id of [1, 31337, Number.NaN]) assert.throws(() => prepareSepoliaPlan(id, '0x0000000000000000000000000000000000000001'), /Sepolia/)
  })
  it('rejects missing, malformed, bad-checksum and zero teacher addresses', () => {
    for (const holder of ['', '0x123', zeroAddress, '0x52908400098527886E0F7030069857D2E4169Ee7']) assert.throws(() => prepareSepoliaPlan(11155111, holder), /nonzero address/)
  })
  it('prepares three exact constructor argument sets without inferring the deployer', () => {
    const holder = '0x0000000000000000000000000000000000000001'
    const plan = prepareSepoliaPlan(11155111, holder)
    assert.equal(plan.length, 3)
    for (const [i, item] of plan.entries()) {
      assert.equal(item.chainId, 11155111)
      assert.deepEqual(item.constructorArgs, [TOKENS[i].name, TOKENS[i].symbol, holder, INITIAL_SUPPLY])
    }
  })
})
