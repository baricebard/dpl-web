import { test, expect } from '@playwright/test'
import { DEPLOYER } from '../../tools/deploy/config'

test('AMM is first, legacy collapsed; explicit summary and acknowledgment before wallet request', async ({ page }) => {
  await page.addInitScript(({ teacher }) => {
    const calls: string[] = []
    const provider = {
      async request({ method }: { method: string }) {
        calls.push(method)
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [teacher]
        if (method === 'eth_chainId') return '0xaa36a7'
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000'
        if (method === 'eth_gasPrice') return '0x3b9aca00'
        if (method === 'eth_estimateGas') return '0x2dc6c0'
        if (method === 'eth_sendTransaction') throw { code: 4001 }
        throw new Error('Unexpected RPC ' + method)
      }, on() {}, removeListener() {},
    }
    Object.assign(window, { calls })
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.metamask' }, provider } })))
  }, { teacher: DEPLOYER })
  await page.goto('/')
  const panel = page.getByRole('region', { name: 'DPL AMM 部署與首次注資' })
  await expect(panel.getByRole('heading', { name: 'DPL AMM Pool — Deployment & Initial Liquidity' })).toBeVisible()
  await expect(page.getByRole('button', { name: '準備部署 DPLT', exact: true })).not.toBeVisible()
  const calls = () => page.evaluate(() => (window as unknown as { calls: string[] }).calls)
  expect(await calls()).toEqual([])
  await panel.getByRole('button', { name: '連接／核對 AMM 教師 MetaMask' }).click()
  await panel.getByRole('button', { name: '準備部署 DPLAMMPool', exact: true }).click()
  await expect(panel.getByText(/費用上限/)).toBeVisible()
  const confirm = panel.getByRole('button', { name: '確認部署 DPLAMMPool（請求 MetaMask）' })
  await expect(confirm).toBeDisabled()
  expect((await calls()).filter(c => c === 'eth_sendTransaction')).toHaveLength(0)
  await panel.getByRole('checkbox').check(); await confirm.click()
  await expect(panel.getByRole('status')).toHaveText('失敗')
  expect((await calls()).filter(c => c === 'eth_sendTransaction')).toHaveLength(1)
  await page.reload()
  await expect(panel.getByRole('status')).toHaveText('尚未部署')
  expect(await calls()).toEqual([])
})

test('AMM uses the shared Web Lock across tabs', async ({ context }) => {
  await context.addInitScript(() => {
    const provider = { request() { throw new Error('Wallet must not be called') }, on() {}, removeListener() {} }
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.metamask' }, provider } })))
  })
  const first = await context.newPage(), second = await context.newPage()
  await first.goto('/'); await second.goto('/')
  await first.evaluate(key => { void navigator.locks.request(key, () => new Promise<void>(resolve => { Object.assign(window, { releaseLock: resolve }) })) }, `dpl-sepolia-deployment-v1:${DEPLOYER}`)
  await expect.poll(() => first.evaluate(() => 'releaseLock' in window)).toBe(true)
  await second.getByRole('button', { name: '連接／核對 AMM 教師 MetaMask' }).click()
  await expect(second.getByRole('region', { name: 'DPL AMM 部署與首次注資' }).getByRole('alert')).toContainText('另一分頁')
  await first.evaluate(() => (window as unknown as { releaseLock(): void }).releaseLock())
})
