import { expect, test } from '@playwright/test'
import { displayEther, sepoliaAddressUrl } from '../../src/lib/web3/display'
import { createBalanceStore } from '../../src/lib/web3/balanceStore'

test('安全地址 URL 與整數字串格式', () => {
  for (const input of [null, '', 'javascript:alert(1)', '0x123', '0x1111111111111111111111111111111111111111/evil']) expect(sepoliaAddressUrl(input)).toBeNull()
  expect(displayEther(1234567890123456789n)).toBe('1.234567')
  expect(displayEther(1n)).toBe('< 0.000001')
  expect(displayEther(10n ** 40n)).toBe('10000000000000000000000')
  expect(displayEther(0n)).toBe('0')
})

test('無地址讀取 store 不發查詢', async () => {
  const store = createBalanceStore(null)
  await store.refresh()
  expect(store.getSnapshot()).toEqual({ status: 'idle', data: null, error: null, retryAt: 0 })
})
