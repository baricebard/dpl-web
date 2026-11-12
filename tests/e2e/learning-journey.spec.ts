import { expect, test } from '@playwright/test'
import { modules } from '../../src/config/modules'
import { calls, mockWallet } from '../helpers/wallet'

test('六階段連續導覽、教材、預期結果與唯讀觀察，不將瀏覽當完成', async ({ page }, info) => {
  await mockWallet(page)
  await page.goto('./#wallet')
  for (const [index, module] of modules.entries()) {
    const panel = page.locator(`#${module.id}`)
    await expect(panel.getByRole('heading', { name: '這一關要學什麼？' })).toBeVisible()
    const nav = panel.getByRole('navigation', { name: `${module.id} 六階段學習導覽` })
    await expect(nav.getByRole('link')).toHaveCount(6)
    await expect(nav.locator('[aria-current="step"]')).toHaveText(`${index + 1}. ${module.name}`)
    await panel.getByText('操作步驟與預期結果', { exact: true }).click()
    await expect(panel).toContainText('以上為預期結果，實際狀態請以下方查詢或交易結果為準。')
    await expect(panel.getByRole('heading', { name: '你學到了什麼？' })).toBeVisible()
    await expect(panel).toContainText('沒有錢包也能閱讀教材')
    const next = modules[index + 1]
    if (next) {
      await panel.getByRole('link', { name: `下一個單元：${next.name} →` }).click()
      await expect(page).toHaveURL(new RegExp(`#${next.id}$`))
    }
  }
  // 自由跨階段，不需先操作 Wallet 或完成任何交易。
  await page.locator('#portfolio').getByRole('navigation').getByRole('link', { name: '4. Exchange' }).click()
  await expect(page).toHaveURL(/#exchange$/)
  await page.reload()
  await expect(page.locator('#exchange').getByRole('heading', { name: '這一關要學什麼？' })).toBeVisible()
  await page.locator('#exchange .learning-intro').screenshot({ path: `/tmp/dpl-learning-${info.project.name}.png` })
  expect((await calls(page)).every(call => !/sendTransaction|sign|requestAccounts/.test(call))).toBe(true)
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
})

test('無 MetaMask、課堂協助及 320px 展開教材不溢出', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 320, height: 850 })
  await page.goto('./#portfolio')
  await expect(page.locator('#wallet')).toContainText('尚未偵測到 MetaMask')
  for (const module of [...modules].reverse()) {
    await page.goto(`./#${module.id}`)
    const panel = page.locator(`#${module.id}`)
    await panel.getByText('操作步驟與預期結果', { exact: true }).click()
    await expect(panel.getByRole('navigation').locator('[aria-current="step"]')).toHaveText(new RegExp(module.name))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.locator('#wallet').getByRole('link', { name: '遇到問題？查看課堂操作協助' }).click()
  const help = page.locator('#classroom-help')
  await help.getByText('常見問題與下一步', { exact: true }).click()
  for (const text of ['Sepolia ETH 不足', '教學代幣不足', 'ERC-20 授權不足', '交易狀態未知', 'Faucet 暫時不可用']) await expect(help.getByText(text, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await help.screenshot({ path: `/tmp/dpl-learning-help-320-${info.project.name}.png` })
  await page.goto('./#liquidity')
  await page.locator('#liquidity .learning-intro').screenshot({ path: `/tmp/dpl-learning-320-${info.project.name}.png` })
  expect(errors).toEqual([])
})
