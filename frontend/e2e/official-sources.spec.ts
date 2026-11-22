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
  // Menu is a drawer opened by a button on the assistant screen, not a route:
  // the assistant reaches the full menu page through the drawer's own link.
  await page.getByRole('button', { name: 'Open menu' }).click()
  const drawer = page.getByRole('complementary', { name: 'Menu' })
  await expect(drawer.getByRole('heading', { name: 'Chat history' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'New Chat' })).toBeVisible()
  await drawer.getByRole('link', { name: 'Open full menu' }).click()
  // Level-1: the drawer also has an h2 "Menu", which would match a bare
  // heading query while the lazy Menu route is still loading.
  await expect(page.getByRole('heading', { level: 1, name: 'Menu' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Menu' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New Chat' })).toBeVisible()

  const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport)
})
