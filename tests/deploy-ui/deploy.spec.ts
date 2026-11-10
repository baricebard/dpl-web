import { test, expect } from '@playwright/test'
import { DEPLOYER } from '../../tools/deploy/config'

test('EIP-6963 MetaMask: explicit connect, prepare, acknowledge, reject, no automatic sends', async ({ page }) => {
  await page.addInitScript(({ deployer }) => {
    const calls: string[] = []
    const provider = {
      request: async ({ method }: { method: string }) => {
        calls.push(method)
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [deployer]
        if (method === 'eth_chainId') return '0xaa36a7'
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000'
        if (method === 'eth_estimateGas') return '0x7a120'
        if (method === 'eth_gasPrice') return '0x3b9aca00'
        if (method === 'eth_sendTransaction') throw { code: 4001 }
        throw new Error('Unexpected RPC ' + method)
      },
      on() {}, removeListener() {},
    }
    Object.assign(window, { calls, ethereum: { request() { throw new Error('Wrong injected wallet') } } })
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.metamask' }, provider } }))
    })
  }, { deployer: DEPLOYER })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'DPL 本機 Sepolia 部署工具' })).toBeVisible()
  const calls = () => page.evaluate(() => (window as unknown as { calls: string[] }).calls)
  expect(await calls()).toEqual([])
  await page.getByRole('button', { name: '連接／重新核對 MetaMask 與餘額' }).click()
  await expect(page.getByText('指定帳號與 Sepolia 已確認', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '準備部署 DPLT', exact: true }).click()
  await expect(page.getByRole('status').first()).toHaveText('等待使用者確認')
  const confirm = page.getByRole('button', { name: '確認部署 DPLT（將請求 MetaMask）', exact: true })
  await expect(confirm).toBeDisabled()
  expect((await calls()).filter(x => x === 'eth_sendTransaction')).toHaveLength(0)
  await page.getByRole('checkbox').check()
  await confirm.click()
  await expect(page.getByText('使用者拒絕簽署，未送出交易，可重新準備')).toBeVisible()
  expect((await calls()).filter(x => x === 'eth_sendTransaction')).toHaveLength(1)
  await page.reload()
  await expect(page.getByRole('status').first()).toHaveText('尚未部署')
  expect(await calls()).toEqual([])
})

test('local server rejects remote Host', async ({ request }) => {
  const response = await request.get('/', { headers: { Host: 'example.com' } })
  expect(response.status()).toBe(403)
})

test('cross-tab unknown attempt and Web Lock block duplicate sends', async ({ context }) => {
  await context.addInitScript(({ deployer }) => {
    const calls: string[] = []
    const provider = {
      async request({ method }: { method: string }) {
        calls.push(method)
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [deployer]
        if (method === 'eth_chainId') return '0xaa36a7'
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000'
        if (method === 'eth_estimateGas') return '0x7a120'
        if (method === 'eth_gasPrice') return '0x3b9aca00'
        throw new Error('Mock transport error; send outcome unknown')
      }, on() {}, removeListener() {},
    }
    Object.assign(window, { calls })
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.metamask' }, provider } })))
  }, { deployer: DEPLOYER })
  const first = await context.newPage(), second = await context.newPage()
  await first.goto('/'); await second.goto('/')
  // Hold a lock exactly as another active deployment tab would.
  await first.evaluate(key => {
    void navigator.locks.request(key, () => new Promise<void>(resolve => {
      Object.assign(window, { releaseDeploymentLock: resolve })
    }))
  }, `dpl-sepolia-deployment-v1:${DEPLOYER}`)
  await expect.poll(() => first.evaluate(() => 'releaseDeploymentLock' in window)).toBe(true)
  await second.getByRole('button', { name: '連接／重新核對 MetaMask 與餘額' }).click()
  await expect(second.getByRole('alert')).toContainText('另一分頁正在處理部署')
  await first.evaluate(() => (window as unknown as { releaseDeploymentLock(): void }).releaseDeploymentLock())
  await first.getByRole('button', { name: '連接／重新核對 MetaMask 與餘額' }).click()
  await first.getByRole('button', { name: '準備部署 DPLT', exact: true }).click()
  await first.getByRole('checkbox').check()
  await first.getByRole('button', { name: '確認部署 DPLT（將請求 MetaMask）', exact: true }).click()
  await expect(first.getByRole('status').first()).toHaveText('結果未知')
  await second.getByRole('button', { name: '連接／重新核對 MetaMask 與餘額' }).click()
  await second.getByRole('button', { name: '準備部署 DPLT', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('已有部署嘗試')
  expect(await second.evaluate(() => (window as unknown as { calls: string[] }).calls.filter(c => c === 'eth_sendTransaction'))).toHaveLength(0)
  await first.reload()
  await expect(first.getByRole('status').first()).toHaveText('結果未知')
  await expect(first.getByRole('button', { name: '準備部署 DPLT', exact: true })).toBeDisabled()
})
