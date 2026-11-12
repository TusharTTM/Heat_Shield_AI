import { expect, test } from '@playwright/test'
import { heatIndexC } from '../src/data/heat'

const forecastUrl = 'https://api.open-meteo.com/v1/forecast'

test('live weather fills the uploaded Dashboard and all three screens navigate', async ({ page }) => {
  test.setTimeout(90000)
  await page.addInitScript(() => localStorage.removeItem('hs-region'))
  const weatherResponsePromise = page.waitForResponse((response) => {
    const url = response.url()
    return url.startsWith(forecastUrl) && url.includes('latitude=19.076') && url.includes('daily=')
  }, { timeout: 30000 })

  await page.goto('./', { waitUntil: 'domcontentloaded' })
  const weatherResponse = await weatherResponsePromise
  expect(weatherResponse.ok()).toBe(true)
  const payload = await weatherResponse.json()
  const current = payload.current as { temperature_2m: number; relative_humidity_2m: number }

  await expect(page.getByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeVisible()
  await expect(page).toHaveTitle('Dashboard · Heat Shield AI')
  const cards = page.locator('.key-readings-grid .weather-card')
  await expect(cards).toHaveCount(5)
  await expect(cards.nth(0)).toContainText(`${current.temperature_2m.toFixed(1)}°C`)
  await expect(cards.nth(1)).toContainText(`${heatIndexC(current.temperature_2m, current.relative_humidity_2m).toFixed(1)}°C`)
  await expect(cards.nth(2)).toContainText(`${current.relative_humidity_2m}%`)
  await expect(page.getByRole('heading', { name: 'AI suggestions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Heat mission progress' })).toBeVisible()

  await page.getByRole('link', { name: /AI Assistant/ }).click()
  await expect(page.getByRole('heading', { name: 'Heat Shield AI' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Ask Heat Shield' })).toBeVisible()

  await page.getByRole('link', { name: 'Menu' }).click()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recents' })).toBeVisible()
  await page.getByRole('link', { name: 'New Chat' }).click()
  await expect(page.getByRole('heading', { name: 'Heat Shield AI' })).toBeVisible()

  const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport)
})
