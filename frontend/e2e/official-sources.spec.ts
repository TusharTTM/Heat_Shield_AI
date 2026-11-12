import { expect, test } from '@playwright/test'

test('the uploaded screens work on mobile with unavailable weather services', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.clear())
  await page.route(/https:\/\/(api|air-quality-api)\.open-meteo\.com\/.*/, (route) => route.abort())

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeVisible()
  await expect(page.locator('.key-readings-grid .weather-card')).toHaveCount(5)
  await expect(page.locator('.key-readings-grid .uploaded-action-tile')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'AI suggestions' })).toBeVisible()

  await page.getByRole('link', { name: /AI Assistant/ }).click()
  await expect(page.getByRole('heading', { name: 'Heat Shield AI' })).toBeVisible()
  await page.getByRole('link', { name: 'Menu' }).click()
  await expect(page.getByRole('heading', { name: 'Menu' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New Chat' })).toBeVisible()

  const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport)
})
