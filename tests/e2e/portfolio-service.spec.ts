import { expect, test } from '@playwright/test'
import { lpUnderlying, percent, portfolioValues, readPortfolio, referenceValue, spotPrice } from '../../src/modules/portfolio/services/portfolioService'
import type { PortfolioClient } from '../../src/modules/portfolio/services/portfolioService'
import { amm } from '../../src/config/amm'
import { tokens } from '../../src/config/tokens'
import { address } from '../helpers/wallet'
const unit = 10n ** 18n
function fixture() {
  const state = { balances: [10n * unit, 300n * unit, 20n * unit], lp: 5n * unit, supply: 50n * unit, reserves: [100n * unit, 3000n * unit], fail: '', chain: 11155111 }
  const blocks: bigint[] = []
  const client = {
    getChainId: async () => state.chain,
    getBlockNumber: async () => 123n,
    getBalance: async ({ blockNumber }: { blockNumber: bigint }) => { blocks.push(blockNumber); return 9n * unit },
    readContract: async ({ address: target, functionName, blockNumber }: { address: string; functionName: string; blockNumber: bigint }) => {
      blocks.push(blockNumber)
      if (functionName === state.fail) throw new Error('RPC failure')
      if (functionName === 'getReserves') return state.reserves
      if (functionName === 'totalSupply') return state.supply
      if (target === amm.address) return state.lp
      return state.balances[tokens.findIndex(t => t.address === target)]
    },
  } as unknown as PortfolioClient
  return { state, client, blocks }
}
test('三種精確參考估值、LP 拆解、不重複計值、ETH 排除與同區塊', async () => {
  const f = fixture(), s = await readPortfolio(address, f.client), v = portfolioValues(s)
  expect(s.balances.map(b => b.value)).toEqual(f.state.balances)
  expect(v.underlying).toEqual([10n * unit, 300n * unit])
  expect(v.values).toEqual([10n * unit, 10n * unit, 3n * unit, 10n * unit, 10n * unit])
  expect(v.total).toBe(43n * unit)
  expect(f.blocks).toHaveLength(7)
  expect(f.blocks.every(b => b === 123n)).toBe(true)
  expect(percent(10n * unit, v.total!)).toBe('23.25')
})
test('最小單位、有理數、極大值向下取整', () => {
  expect(referenceValue(29n, 1)).toBe(0n)
  expect(referenceValue(31n, 1)).toBe(1n)
  expect(referenceValue(19n, 2)).toBe(2n)
  expect(referenceValue(20n, 2)).toBe(3n)
  const large = 2n ** 200n
  expect(referenceValue(large, 1)).toBe(large / 30n)
  expect(lpUnderlying(1n, 3n, [10n, 31n])).toEqual([3n, 10n])
})
test('全零餘額、空池正常為零', async () => {
  const f = fixture(); f.state.balances = [0n, 0n, 0n]; f.state.lp = 0n; f.state.supply = 0n; f.state.reserves = [0n, 0n]
  expect(portfolioValues(await readPortfolio(address, f.client)).total).toBe(0n)
  expect(percent(0n, 0n)).toBe('0')
  expect(spotPrice([0n, 0n])).toBeUndefined()
})
for (const [lp, supply, reserves] of [[1n, 0n, [0n, 0n]], [5n, 4n, [10n, 30n]], [0n, 0n, [1n, 2n]], [1n, 5n, [0n, 30n]]] as const) test(`矛盾 LP ${lp}/${supply}/${reserves} 不可計算`, () => {
  expect(lpUnderlying(lp, supply, reserves)).toBeUndefined()
})
for (const fail of ['balanceOf', 'totalSupply', 'getReserves']) test(`${fail} 失敗不補零或總估值`, async () => {
  const f = fixture(); f.state.fail = fail
  const s = await readPortfolio(address, f.client)
  expect(portfolioValues(s).total).toBeUndefined()
  expect([s.lp, s.supply, s.reserves, ...s.balances].some(r => r.error)).toBe(true)
})
test('AMM 儲備比例與相對差距，變化不影響固定估值', async () => {
  const f = fixture(), before = portfolioValues(await readPortfolio(address, f.client))
  expect(spotPrice(f.state.reserves)?.price).toBe(30n * unit)
  f.state.reserves = [100n * unit, 3300n * unit]
  expect(spotPrice(f.state.reserves)?.deviation).toBe(1000n)
  f.state.lp = 0n
  const v = portfolioValues(await readPortfolio(address, f.client))
  expect(v.values.slice(0, 3)).toEqual(before.values.slice(0, 3))
})
test('RPC 錯鏈與不支援區塊不得回退 latest', async () => {
  const f = fixture(); f.state.chain = 1
  await expect(readPortfolio(address, f.client)).rejects.toThrow('RPC 網路')
  f.state.chain = 11155111; f.client.getBlockNumber = async () => { throw new Error('block unsupported') }
  await expect(readPortfolio(address, f.client)).rejects.toThrow('block unsupported')
})
