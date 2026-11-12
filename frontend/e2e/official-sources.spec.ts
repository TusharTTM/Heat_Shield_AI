import { expect, test, type Page, type Route } from '@playwright/test'
import { currentOfficialAirPayload, officialAlertsPayload, stationObservation } from '../src/test/officialFixtures'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders })
    return
  }
  await route.fulfill({ status, headers: corsHeaders, json: body })
}

function weatherPayload() {
  return {
    utc_offset_seconds: 19800,
    current: { time: '2026-11-08T14:30', temperature_2m: 34.8, apparent_temperature: 37.2, relative_humidity_2m: 62, weather_code: 2, wind_speed_10m: 11.4, rain: 0, precipitation: 0, wind_gusts_10m: 18.2 },
    daily: {
      time: ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'],
      temperature_2m_max: [35.1, 35.8, 36.2, 35.6, 34.9], temperature_2m_min: [27, 27.2, 27.7, 27.4, 27.1], weather_code: [2, 2, 1, 0, 61],
      precipitation_sum: [0, 0, 0, 0, 2], rain_sum: [0, 0, 0, 0, 2], precipitation_probability_max: [0, 0, 0, 10, 60], wind_gusts_10m_max: [20, 21, 19, 18, 24], uv_index_max: [6, 6, 5, 5, 4],
    },
    hourly: {
      time: [8, 10, 12, 14, 16, 18].map((hour) => `2026-11-08T${String(hour).padStart(2, '0')}:00`),
      temperature_2m: [30.1, 32.7, 34.3, 35.1, 34, 32.8], relative_humidity_2m: [65, 62, 60, 58, 61, 64],
    },
  }
}

function airPayload() {
  const times = Array.from({ length: 30 }, (_, index) => `2026-11-${String(8 + Math.floor((13 + index) / 24)).padStart(2, '0')}T${String((13 + index) % 24).padStart(2, '0')}:00`)
  const series = (start: number) => times.map((_, index) => start + index)
  return {
    utc_offset_seconds: 19800,
    current: { time: '2026-11-08T14:00', us_aqi: 125, european_aqi: 55, pm10: 88.4, pm2_5: 45.2, carbon_monoxide: 420.5, nitrogen_dioxide: 31.1, sulphur_dioxide: 8.2, ozone: 64.3 },
    hourly: { time: times, us_aqi: series(124), european_aqi: series(54), pm10: series(87.4), pm2_5: series(44.2), carbon_monoxide: series(419.5), nitrogen_dioxide: series(30.1), sulphur_dioxide: series(7.2), ozone: series(63.3) },
  }
}

async function mockModels(page: Page) {
  await page.route(/^https:\/\/api\.open-meteo\.com\/v1\/forecast/, (route) => fulfillJson(route, weatherPayload()))
  await page.route(/^https:\/\/air-quality-api\.open-meteo\.com\/v1\/air-quality/, (route) => fulfillJson(route, airPayload()))
}

async function mockOfficialSuccess(page: Page) {
  await page.route('https://backend.test/api/v1/official/alerts/mumbai', (route) => fulfillJson(route, officialAlertsPayload()))
  await page.route('https://backend.test/api/v1/official/air-quality/current/mumbai', (route) => fulfillJson(route, currentOfficialAirPayload()))
  await page.route(/^https:\/\/backend\.test\/api\/v1\/official\/air-quality\/history\/mumbai/, (route) => fulfillJson(route, {
    region: 'mumbai', count: 2, status: 'stored_station_observations', items: [stationObservation, { ...stationObservation, observed_at: '2026-11-08T07:30:00Z', retrieved_at: '2026-11-08T08:00:00Z', aqi: 150 }],
  }))
}

test.beforeEach(async ({ page }) => {
  await mockModels(page)
})

/** Official CAP/CPCB panels live in the Dashboard's expandable details drawer. */
async function openDashboardDetails(page: Page) {
  const drawer = page.locator('details.secondary-details-drawer')
  if (!(await drawer.evaluate((element: HTMLDetailsElement) => element.open))) {
    await page.locator('details.secondary-details-drawer > summary').click()
  }
  await expect(drawer).toHaveJSProperty('open', true)
}

test('official CAP and CPCB panels work beside model screening on desktop', async ({ page }) => {
  await mockOfficialSuccess(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Temperature', exact: true })).toBeVisible()
  await expect(page.getByLabel('Official warnings versus model screening')).toContainText('Official government warnings')
  await openDashboardDetails(page)
  await expect(page.getByRole('heading', { name: 'Heavy rainfall warning for Mumbai', exact: true })).toBeVisible()
  await expect(page.getByText('Follow local authority instructions.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Original CAP XML/ })).toHaveAttribute('href', 'https://sachet.ndma.gov.in/FetchXMLFile?identifier=cap-test-1')
  await expect(page.getByText('Indian CPCB AQI 175 · Moderate')).toBeVisible()
  await expect(page.locator('.station-pollutant-table').getByText('µg/m³')).toBeVisible()
  await expect(page.getByText(/Indian CPCB AQI: 150 → 175/)).toBeVisible()
  // Scope to the air-quality card: the screening-scale disclosure also mentions "US AQI"
  await expect(page.locator('.air-quality-card')).toContainText(/US AQI/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.getByRole('link', { name: 'Disaster Monitor', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Heavy rainfall warning for Mumbai' })).toBeVisible()
  await expect(page.getByText('Indian CPCB AQI 175 · Moderate')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.getByRole('link', { name: 'Alerts', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Heavy rainfall warning for Mumbai' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Generated assessment notices' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('official panels remain usable without page overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockOfficialSuccess(page)
  await page.goto('/')
  await openDashboardDetails(page)
  const cap = page.locator('.official-cap-panel')
  await cap.scrollIntoViewIfNeeded()
  await expect(cap.getByRole('heading', { name: 'Heavy rainfall warning for Mumbai' })).toBeVisible()
  const station = page.locator('.official-air-quality-panel')
  await station.scrollIntoViewIfNeeded()
  await expect(station.getByText('Indian CPCB AQI 175 · Moderate')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.goto('/monitor')
  await expect(page.locator('.official-cap-panel').getByRole('heading', { name: 'Heavy rainfall warning for Mumbai' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.goto('/alerts')
  await expect(page.locator('.official-cap-panel').getByRole('heading', { name: 'Heavy rainfall warning for Mumbai' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('provider and credential failures show no substitute official data', async ({ page }) => {
  await page.route('https://backend.test/api/v1/official/alerts/mumbai', (route) => fulfillJson(route, { code: 'SACHET_UNAVAILABLE', detail: 'Software-mocked SACHET outage.' }, 503))
  await page.route('https://backend.test/api/v1/official/air-quality/current/mumbai', (route) => fulfillJson(route, { code: 'CPCB_NOT_CONFIGURED', detail: 'Software-mocked missing server credential.' }, 503))
  await page.route(/^https:\/\/backend\.test\/api\/v1\/official\/air-quality\/history\/mumbai/, (route) => fulfillJson(route, { region: 'mumbai', count: 0, status: 'empty', items: [] }))
  await page.goto('/')
  await openDashboardDetails(page)
  await expect(page.getByText('Official CAP feed unavailable')).toBeVisible()
  await expect(page.getByText('Software-mocked SACHET outage.')).toBeVisible()
  await expect(page.getByText('CPCB station observations unavailable')).toBeVisible()
  await expect(page.getByText('Software-mocked missing server credential.')).toBeVisible()
  await expect(page.getByText('Heavy rainfall warning for Mumbai')).toHaveCount(0)
  await expect(page.getByText(/Indian CPCB AQI 175/)).toHaveCount(0)
})
