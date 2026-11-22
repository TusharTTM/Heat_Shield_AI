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
  // The mission-progress score is gone; navigation now sits below the readings
  // grid instead of inside it.
  await expect(page.getByRole('heading', { name: 'Heat mission progress' })).toHaveCount(0)
  await expect(page.locator('.key-readings-grid .uploaded-action-tile')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'More from Heat Shield' })).toBeVisible()

  await page.getByRole('link', { name: /AI Assistant/ }).click()
  await expect(page.getByRole('heading', { name: 'Heat Shield AI' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Ask Heat Shield' })).toBeVisible()

  await page.getByRole('button', { name: 'Open menu' }).click()
  // Chat history is a single list headed "Chat history"; the old Pinned/Recents
  // split no longer exists. "New Chat" is a button in the drawer.
  const drawer = page.getByRole('complementary', { name: 'Menu' })
  await expect(drawer.getByRole('heading', { name: 'Chat history' })).toBeVisible()
  await drawer.getByRole('button', { name: 'New Chat' }).click()
  await expect(page.getByRole('heading', { name: 'Heat Shield AI' })).toBeVisible()

  const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport)

  // Web Interface Guidelines, the parts only a real browser can prove.
  // 1. The skip link is the first tab stop and it moves focus into <main>.
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main-content')

  // 2. Every tab stop paints a visible focus ring, or hands it to a parent that
  //    does (the search field and the composer do this via :focus-within).
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeVisible()
  const ringless: string[] = []
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab')
    const state = await page.evaluate(() => {
      const node = document.activeElement as HTMLElement | null
      if (!node || node === document.body) return null
      const parent = node.parentElement ? getComputedStyle(node.parentElement) : null
      const painted = (style: CSSStyleDeclaration | null) =>
        !!style && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
      const ring = painted(getComputedStyle(node)) || painted(parent)
      return { ring, label: `${node.tagName}.${node.className.toString().slice(0, 40)}` }
    })
    if (state && !state.ring && !ringless.includes(state.label)) ringless.push(state.label)
  }
  expect(ringless).toEqual([])

  // 2b. Rendered touch targets clear 44x44. A stylesheet check cannot see the
  //     cascade, so this measures the real computed boxes.
  const smallTargets = await page.evaluate(() => {
    const out: string[] = []
    // Buttons and styled controls only: an inline link inside a sentence is
    // exempt by WCAG 2.2 (inline exception) and would fail this unfairly.
    const controls = document.querySelectorAll<HTMLElement>(
      'button:not([disabled]), .dashboard-shortcut, .icon-text-button, .profile-button, .assistant-suggestion-chip, .settings-switch, .chat-history-action, .city-picker-trigger',
    )
    for (const node of controls) {
      const box = node.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue // visually hidden
      if (box.height < 44 - 0.5 || box.width < 44 - 0.5) {
        out.push(`${node.tagName}.${node.className.toString().slice(0, 34)} ${Math.round(box.width)}x${Math.round(box.height)}`)
      }
    }
    return out
  })
  expect(smallTargets).toEqual([])

  // 3. Nothing catches the pointer on a tap target for longer than a frame:
  //    touch-action must never be the default `auto` on a control.
  const autoTouch = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a[href], button')]
    .filter((node) => getComputedStyle(node).touchAction === 'auto')
    .map((node) => node.tagName + '.' + node.className.toString().slice(0, 40)))
  expect(autoTouch).toEqual([])
})
