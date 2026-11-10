import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { READ_METHODS } from '../../tools/verify/engine.ts'
import { fixture, sourceText } from '../verify/fixtures.ts'

test('no wallet: import, manual read, actual HTTP evidence, reduced balance, export and reset', async ({ page }) => {
  const f = fixture(), methods: string[] = []
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ethereum', { get() { throw new Error('Verifier must never inspect injected wallets') } })
    window.addEventListener('eip6963:requestProvider', () => { throw new Error('No wallet discovery allowed') })
  })
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  // All external HTTPS is intercepted: these are deterministic mock HTTP responses, not Sepolia evidence.
  await page.route('https://**/*', async route => {
    expect(new URL(route.request().url()).hostname).toBe('ethereum-sepolia-rpc.publicnode.com')
    const request = route.request().postDataJSON() as { id: number; method: typeof READ_METHODS[number]; params: unknown[] }
    expect(READ_METHODS).toContain(request.method); methods.push(request.method)
    await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result: await f.rpc(request.method, request.params) } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'DPL 本機唯讀部署驗證' })).toBeVisible()
  await expect(page.getByRole('button', { name: '執行唯讀驗證' })).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('本輪狀態：尚未驗證')
  expect(methods).toHaveLength(0)
  await page.getByLabel(/公開部署紀錄 JSON/).setInputFiles({ name: 'dpl-sepolia-deployment-record.json', mimeType: 'application/json', buffer: Buffer.from(sourceText) })
  await expect(page.getByRole('button', { name: '執行唯讀驗證' })).toBeEnabled()
  expect(methods).toHaveLength(0)
  await page.getByRole('button', { name: '執行唯讀驗證' }).click()
  await expect(page.getByRole('status')).toHaveText('本輪狀態：通過')
  for (const symbol of ['DPLT', 'DPLT-A', 'DPLT-B']) await expect(page.getByRole('heading', { name: `${symbol}：通過`, exact: true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 JSON 驗證結果' }).click()
  const download = await downloadPromise
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.status).toBe('通過'); expect(exported.task06Ready).toBe(false)
  expect(exported.evidence.map((e: { method: string }) => e.method)).toEqual(methods)
  expect(exported.tokens[0].checks.find((c: { name: string }) => c.name.startsWith('教師目前')).actual).toBe('900')
  await page.getByLabel(/公開部署紀錄 JSON/).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect(page.getByRole('alert')).toContainText('只接受')
  await expect(page.getByRole('button', { name: '匯出 JSON 驗證結果' })).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('本輪狀態：尚未驗證')
  expect(pageErrors).toEqual([])
})

test('HTTP/CORS error remains unverified and does not leak old success', async ({ page }) => {
  let requests = 0
  await page.route('https://**/*', async route => { requests++; await route.fulfill({ status: 403, body: 'Forbidden' }) })
  await page.goto('/')
  await page.getByLabel(/公開部署紀錄 JSON/).setInputFiles({ name: 'record.json', mimeType: 'application/json', buffer: Buffer.from(sourceText) })
  await page.getByRole('button', { name: '執行唯讀驗證' }).click()
  await expect(page.getByRole('status')).toHaveText('本輪狀態：尚未驗證')
  await expect(page.getByText(/HTTP request failed/).first()).toBeVisible()
  expect(requests).toBe(1)
})

test('missing artifact does not prevent public reads or falsely pass runtime', async ({ page }) => {
  const f = fixture()
  await page.route('**/*verification-artifact*', route => route.fulfill({ contentType: 'application/javascript', body: 'export default { available: false, error: "Missing Hardhat artifact: run npm run contracts:compile" }' }))
  await page.route('https://**/*', async route => {
    const req = route.request().postDataJSON()
    await route.fulfill({ json: { jsonrpc: '2.0', id: req.id, result: await f.rpc(req.method, req.params) } })
  })
  await page.goto('/')
  await page.getByLabel(/公開部署紀錄 JSON/).setInputFiles({ name: 'record.json', mimeType: 'application/json', buffer: Buffer.from(sourceText) })
  await page.getByRole('button', { name: '執行唯讀驗證' }).click()
  await expect(page.getByRole('status')).toHaveText('本輪狀態：尚未驗證')
  await expect(page.getByText('通過：name()', { exact: true })).toHaveCount(3)
  await expect(page.getByText('尚未驗證：目前 Runtime 完整比對', { exact: true })).toHaveCount(3)
})

test('local server rejects non-local Host', async ({ request }) => {
  expect((await request.get('/', { headers: { Host: 'example.com' } })).status()).toBe(403)
})
