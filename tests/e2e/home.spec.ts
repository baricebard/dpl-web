import { expect, test } from '@playwright/test'

test('Pages 子路徑可載入、重新整理，Wallet 與 Faucet 開放且保留其餘模組', async ({ page }) => {
  const errors: string[] = []
  const failedAssets: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    if (response.status() >= 400) failedAssets.push(response.url())
  })
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url())
  })
  await page.goto('./')
  await expect(page).toHaveTitle(/DeFi Portfolio Lab/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('DeFi Portfolio Lab.')
  await expect(page.getByRole('heading', { name: 'Ethereum Sepolia' })).toBeVisible()
  await expect(page.getByText('零真實資金，專注理解。')).toBeVisible()
  for (const name of ['Token', 'Exchange', 'Liquidity', 'Portfolio']) {
    await expect(page.getByRole('button', { name: `${name}：尚未開放`, exact: true })).toBeDisabled()
  }
  await expect(page.getByRole('link', { name: 'Wallet：開啟錢包介面' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Faucet：開啟領取指引' })).toBeVisible()
  await expect(page.getByText('尚未連接網路')).toBeVisible()
  await page.getByRole('link', { name: '探索學習模組' }).click()
  await expect(page).toHaveURL(/\/dpl-web\/#modules$/)
  await expect(page.getByRole('heading', { name: '你的 DeFi 學習地圖' })).toBeInViewport()
  await page.reload()
  await expect(page.getByRole('heading', { name: '你的 DeFi 學習地圖' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  expect(failedAssets).toEqual([])
  expect(externalRequests).toEqual([])
})

test('鍵盤可跳至主內容並使用導覽', async ({ page }) => {
  await page.goto('./')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳至主要內容' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await page.getByRole('link', { name: '關於實驗室' }).click()
  await expect(page.getByRole('heading', { name: '從理解開始，循序實踐。' })).toBeInViewport()
})
