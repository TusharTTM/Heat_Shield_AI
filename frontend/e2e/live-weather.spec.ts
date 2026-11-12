import { expect, test, type Page } from '@playwright/test'
import { getSimpleRisk, heatIndexC, riskFromHeatIndex } from '../src/data/heat'
import { riskRecommendations } from '../src/data/guidance'
import { regions } from '../src/data/regions'

const forecastHost = 'https://api.open-meteo.com/v1/forecast'

interface ApiCurrent {
  time: string
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  wind_speed_10m: number
}

interface ApiDaily {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
}

interface ApiPayload {
  current: ApiCurrent
  daily: ApiDaily
  hourly: { time: string[]; temperature_2m: number[] }
  utc_offset_seconds: number
}

function isFullWeatherRequest(url: string) {
  return url.startsWith(forecastHost) && url.includes('daily=') && url.includes('forecast_days=5')
}

function isCurrentOnlyRequest(url: string) {
  return url.startsWith(forecastHost) && url.includes('current=') && !url.includes('daily=')
}

async function selectCity(page: Page, name: string, state: string) {
  await page.getByRole('button', { name: /^Location:/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose a location' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('searchbox', { name: 'Search cities or states' }).fill(name)
  await dialog.getByRole('button', { name: `${name} ${state}` }).click()
  await expect(dialog).toBeHidden()
}

function expectedRisk(current: ApiCurrent) {
  const index = heatIndexC(current.temperature_2m, current.relative_humidity_2m)
  const level = getSimpleRisk(riskFromHeatIndex(index))
  return { index, level, label: level[0].toUpperCase() + level.slice(1) }
}

/**
 * Secondary measurements, daytime hours and provenance notes live inside the Dashboard's
 * expandable drawer, so open it explicitly (idempotently) rather than relying on toggle state.
 */
async function openDashboardDetails(page: Page) {
  const drawer = page.locator('details.secondary-details-drawer')
  if (!(await drawer.evaluate((element: HTMLDetailsElement) => element.open))) {
    await page.locator('details.secondary-details-drawer > summary').click()
  }
  await expect(drawer).toHaveJSProperty('open', true)
}

async function expectHomeRisk(page: Page, current: ApiCurrent) {
  const risk = expectedRisk(current)
  await expect(page.locator('.uploaded-alert')).toBeVisible()
  await expect(page.locator('.key-readings-grid .weather-card').nth(1)).toContainText(`${risk.index.toFixed(1)}°C`)
  await expect(page.locator('.key-readings-grid .uploaded-action-tile').first()).toContainText(risk.level)
  await expect(page.locator('.uploaded-alert-footer')).toContainText('Official government feed not connected')
  await openDashboardDetails(page)
}

async function expectHours(page: Page, payload: ApiPayload) {
  const cards = page.locator('.hour-item')
  await expect(cards).toHaveCount(6)
  for (const [index, hour] of [8, 10, 12, 14, 16, 18].entries()) {
    const target = `${payload.current.time.slice(0, 10)}T${String(hour).padStart(2, '0')}:00`
    const hourlyIndex = payload.hourly.time.indexOf(target)
    expect(hourlyIndex).toBeGreaterThanOrEqual(0)
    await expect(cards.nth(index)).toContainText(`${payload.hourly.temperature_2m[hourlyIndex].toFixed(1)}°`)
  }
}

async function expectTimestamps(page: Page, payload: ApiPayload) {
  const note = page.locator('.source-note').filter({ hasText: 'Open-Meteo weather model' })
  await expect(note).toHaveCount(1)
  await expect(note).toContainText('Last updated:')
  await expect(note).toContainText('Open-Meteo')
  // Provenance explanation folds into the strip's own disclosure.
  const noteDetail = note.locator('.source-note-detail')
  if (!(await noteDetail.evaluate((element: HTMLDetailsElement) => element.open))) {
    await noteDetail.locator('> summary').click()
  }
  await expect(noteDetail).toContainText('CC BY 4.0')
  const timestamps = note.locator('time')
  await expect(timestamps).toHaveCount(2)
  const expectedObservedAt = new Date(Date.parse(`${payload.current.time}Z`) - payload.utc_offset_seconds * 1000).toISOString()
  await expect(timestamps.nth(0)).toHaveAttribute('datetime', expectedObservedAt)
  const retrievedAt = await timestamps.nth(1).getAttribute('datetime')
  expect(retrievedAt && Number.isFinite(Date.parse(retrievedAt))).toBe(true)
}

async function expectForecast(page: Page, daily: ApiDaily) {
  const cards = page.locator('.forecast-day')
  await expect(cards).toHaveCount(5)
  await expect(page.locator('.forecast-high-label')).toHaveCount(5)
  const hottestIndex = daily.temperature_2m_max.reduce((peak, value, index, values) => value > values[peak] ? index : peak, 0)
  for (let index = 0; index < 5; index += 1) {
    await expect(cards.nth(index).locator('.forecast-high-label')).toHaveText('High')
    await expect(cards.nth(index).locator(':scope > strong')).toHaveText(`${daily.temperature_2m_max[index].toFixed(1)}°C`)
    await expect(cards.nth(index)).toContainText(`Low ${daily.temperature_2m_min[index].toFixed(1)}°C`)
  }
  await expect(page.locator('.forecast-day.hottest')).toHaveCount(1)
  await expect(cards.nth(hottestIndex)).toHaveClass(/hottest/)
  await expect(cards.nth(hottestIndex)).toContainText('Hottest')
  const chart = page.getByRole('img', { name: /Five-day Open-Meteo model daily high and low temperature chart/i })
  await expect(chart).toBeVisible()
  await expect(chart).toHaveAttribute('aria-label', new RegExp(`${daily.temperature_2m_max[0].toFixed(1)} degrees Celsius`))
  const chartLabel = await chart.getAttribute('aria-label')
  expect(chartLabel).toBeTruthy()
  for (let index = 0; index < 5; index += 1) {
    expect(chartLabel).toContain(`${daily.temperature_2m_max[index].toFixed(1)} degrees Celsius`)
    expect(chartLabel).toContain(`${daily.temperature_2m_min[index].toFixed(1)} degrees Celsius`)
  }
  expect(chartLabel).toContain(`${daily.temperature_2m_max[hottestIndex].toFixed(1)} degrees Celsius`)
  expect(chartLabel).toContain('Weather-model estimates, not AI/ML predictions.')
}

async function expectResponsiveChart(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  const canvas = page.locator('.forecast-chart-card canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(() => canvas.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(390)
  const sizing = await page.evaluate(() => {
    const canvasRect = document.querySelector('.forecast-chart-card canvas')!.getBoundingClientRect()
    const containerRect = document.querySelector('.forecast-chart-card .chart-container')!.getBoundingClientRect()
    return { canvasWidth: canvasRect.width, containerWidth: containerRect.width, pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }
  })
  expect(sizing.canvasWidth).toBeGreaterThan(250)
  expect(sizing.canvasWidth).toBeLessThanOrEqual(sizing.containerWidth + 1)
  expect(sizing.pageWidth).toBeLessThanOrEqual(sizing.viewportWidth)
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('real responses populate forecast, heat-index guidance, timestamps and every selected-location view', async ({ page }) => {
  test.setTimeout(180000)
  const fullResponses: string[] = []
  page.on('response', (response) => {
    if (isFullWeatherRequest(response.url())) fullResponses.push(response.url())
    if (response.url().startsWith(forecastHost)) console.log(`PROVIDER RESPONSE: ${response.status()} ${response.url()}`)
  })
  page.on('request', (request) => {
    if (request.url().startsWith(forecastHost)) console.log(`PROVIDER REQUEST: ${request.method()} ${request.url()}`)
  })
  page.on('requestfailed', (request) => console.log(`BROWSER REQUEST FAILED: ${request.url()} · ${request.failure()?.errorText ?? 'unknown error'}`))
  page.on('pageerror', (error) => console.log(`BROWSER PAGE ERROR: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`BROWSER CONSOLE ERROR: ${message.text()}`)
  })

  console.log('STAGE: Mumbai current weather and heat-index dashboard')
  const mumbaiResponsePromise = page.waitForResponse((response) => isFullWeatherRequest(response.url()) && response.url().includes('latitude=19.076'), { timeout: 30000 })
  // Capture the current-only provider requests when the test later opens the Risk Map.
  const dashboardCityPromises = regions.map((region) => ({
    region,
    response: page.waitForResponse((candidate) => isCurrentOnlyRequest(candidate.url()) && candidate.url().includes(`latitude=${region.latitude}`), { timeout: 90000 }),
  }))
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('STAGE: Mumbai document loaded; awaiting provider response')
  const mumbaiResponse = await mumbaiResponsePromise.catch(async (error: unknown) => {
    console.log(`MUMBAI RESPONSE WAIT ERROR: ${error instanceof Error ? error.stack : String(error)}`)
    const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => 'body unavailable')
    const scripts = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src)).catch(() => [])
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, duration: Math.round(entry.duration), initiator: (entry as PerformanceResourceTiming).initiatorType }))).catch(() => [])
    console.log(`PAGE BODY ON PROVIDER TIMEOUT: ${body.slice(0, 3000)}`)
    console.log(`PAGE SCRIPTS: ${JSON.stringify(scripts)}`)
    console.log(`PAGE RESOURCES: ${JSON.stringify(resources).slice(0, 6000)}`)
    throw error
  })
  console.log('STAGE: Mumbai provider response received; validating dashboard')
  expect(mumbaiResponse.ok()).toBe(true)
  const mumbai = await mumbaiResponse.json() as ApiPayload
  const current = mumbai.current

  const keyCards = page.locator('.key-readings-grid .weather-card')
  await expect(page.locator('.skip-link')).toHaveCount(1)
  await expect(page).toHaveTitle('Environmental dashboard for Mumbai · HeatShield AI')
  await expect(keyCards).toHaveCount(5)
  await expect(keyCards.nth(0)).toContainText(current.temperature_2m.toFixed(1))
  await expect(keyCards.nth(1)).toContainText(`${expectedRisk(current).index.toFixed(1)}°C`)
  await expect(keyCards.nth(2)).toContainText(`${current.relative_humidity_2m}%`)

  await openDashboardDetails(page)
  const secondaryCards = page.locator('.secondary-weather-card')
  await expect(secondaryCards).toHaveCount(2)
  await expect(secondaryCards.nth(0)).toContainText('Wind speed')
  await expect(secondaryCards.nth(0)).toContainText(current.wind_speed_10m.toFixed(1))
  await expect(secondaryCards.nth(0)).toContainText('km/h')
  await expectHomeRisk(page, current)
  await expectHours(page, mumbai)
  await expectTimestamps(page, mumbai)
  const airNote = page.locator('.source-note').filter({ hasText: 'Open-Meteo/CAMS air-quality model' })
  await expect(airNote).toHaveCount(1, { timeout: 25000 })
  const airNoteDetail = airNote.locator('.source-note-detail')
  if (!(await airNoteDetail.evaluate((element: HTMLDetailsElement) => element.open))) {
    await airNoteDetail.locator('> summary').click()
  }
  await expect(airNoteDetail).toContainText(/not physical IoT sensor readings or ML predictions/i)
  await expect(page.getByText('Official CAP backend not configured')).toBeVisible()
  await expect(page.getByText('CPCB backend not configured')).toBeVisible()

  console.log('STAGE: Mumbai Disaster Monitor, Alerts and About multi-hazard boundaries')
  await page.getByRole('link', { name: 'Disaster Monitor', exact: true }).click()
  await expect(page).toHaveTitle('Disaster Monitor for Mumbai · HeatShield AI')
  // Coverage limits now live in a labelled drawer; open it before asserting the copy is present.
  await page.getByText('Monitoring coverage & limitations (floods, cyclones, lightning, drought)').click()
  await expect(page.getByText('Monitoring coverage and limitations')).toBeVisible()
  await expect(page.getByText('Official CAP backend not configured')).toBeVisible()
  await expect(page.getByText('CPCB backend not configured')).toBeVisible()

  await page.getByRole('link', { name: 'Alerts', exact: true }).click()
  await expect(page).toHaveTitle('Alerts for Mumbai · HeatShield AI')
  await expect(page.getByText('Official CAP backend not configured')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Generated assessment notices' })).toBeVisible()

  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page).toHaveTitle('About · HeatShield AI')
  await expect(page.getByText('Open-Meteo integration')).toBeVisible()
  await expect(page.getByText('CAMS model · not CPCB')).toBeVisible()

  console.log('STAGE: Mumbai five-day high/low chart and responsive forecast')
  await page.getByRole('link', { name: 'Forecast', exact: true }).click()
  await expect(page).toHaveTitle('5-day forecast for Mumbai · HeatShield AI')
  await expect(page.getByRole('main')).toBeFocused()
  await expectForecast(page, mumbai.daily)
  await expectTimestamps(page, mumbai)
  await expectResponsiveChart(page)
  expect(fullResponses).toHaveLength(1)

  console.log('STAGE: Pune forecast, current dashboard and Safety selection')
  const puneResponsePromise = page.waitForResponse((response) => isFullWeatherRequest(response.url()) && response.url().includes('latitude=18.5204'), { timeout: 30000 })
  await selectCity(page, 'Pune', 'Maharashtra')
  const puneResponse = await puneResponsePromise
  expect(puneResponse.ok()).toBe(true)
  const pune = await puneResponse.json() as ApiPayload
  await expectForecast(page, pune.daily)
  await expectTimestamps(page, pune)

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Environmental dashboard for Pune' })).toBeVisible()
  const puneKeyCards = page.locator('.key-readings-grid .weather-card')
  await expect(puneKeyCards).toHaveCount(5)
  await expect(puneKeyCards.nth(0)).toContainText(pune.current.temperature_2m.toFixed(1))
  await expect(puneKeyCards.nth(1)).toContainText(`${expectedRisk(pune.current).index.toFixed(1)}°C`)
  await expect(puneKeyCards.nth(2)).toContainText(`${pune.current.relative_humidity_2m}%`)
  await expectHomeRisk(page, pune.current)
  await expectHours(page, pune)
  await expectTimestamps(page, pune)
  expect(fullResponses).toHaveLength(2)

  await page.getByRole('link', { name: 'Safety Guide', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Guidance for Pune', exact: true })).toBeVisible()
  const puneRisk = expectedRisk(pune.current)
  const heatGuidance = page.locator('[aria-labelledby="selected-guidance-title"]')
  await expect(heatGuidance.locator('.selected-guidance-action')).toHaveText(riskRecommendations[puneRisk.level])
  await expect(heatGuidance.locator('.risk-explanation')).toContainText(`${puneRisk.index.toFixed(1)}°C heat index`)
  await expect(page.locator('[aria-labelledby="risk-level-guide-title"] .risk-threshold')).toHaveCount(4)
  await expect(page.locator('[aria-labelledby="aqi-guide-title"] .risk-threshold')).toHaveCount(6)
  await expect(page.locator('[aria-labelledby="european-aqi-guide-title"] .risk-threshold')).toHaveCount(6)
  await expectTimestamps(page, pune)

  console.log('STAGE: Added Bengaluru full forecast, dashboard and Safety workflow')
  const bengaluruResponsePromise = page.waitForResponse((response) => isFullWeatherRequest(response.url()) && response.url().includes('latitude=12.9716'), { timeout: 30000 })
  await selectCity(page, 'Bengaluru', 'Karnataka')
  const bengaluruResponse = await bengaluruResponsePromise
  expect(bengaluruResponse.ok()).toBe(true)
  const bengaluru = await bengaluruResponse.json() as ApiPayload
  const bengaluruRisk = expectedRisk(bengaluru.current)
  await expect(page.getByRole('heading', { name: 'Guidance for Bengaluru', exact: true })).toBeVisible()
  await expect(heatGuidance.locator('.selected-guidance-action')).toHaveText(riskRecommendations[bengaluruRisk.level])
  await expectTimestamps(page, bengaluru)

  await page.getByRole('link', { name: 'Forecast', exact: true }).click()
  await expectForecast(page, bengaluru.daily)
  await expectTimestamps(page, bengaluru)
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Environmental dashboard for Bengaluru' })).toBeVisible()
  const bengaluruKeyCards = page.locator('.key-readings-grid .weather-card')
  await expect(bengaluruKeyCards).toHaveCount(5)
  await expect(bengaluruKeyCards.nth(0)).toContainText(bengaluru.current.temperature_2m.toFixed(1))
  await expect(bengaluruKeyCards.nth(1)).toContainText(`${expectedRisk(bengaluru.current).index.toFixed(1)}°C`)
  await expect(bengaluruKeyCards.nth(2)).toContainText(`${bengaluru.current.relative_humidity_2m}%`)
  await expectHomeRisk(page, bengaluru.current)
  await expectHours(page, bengaluru)
  await expectTimestamps(page, bengaluru)
  expect(fullResponses).toHaveLength(3)

  console.log(`STAGE: ${regions.length} real current-only map responses and marker risk colours`)
  await page.getByRole('link', { name: 'Risk Map', exact: true }).click()
  const mapPayloads = await Promise.all(dashboardCityPromises.map(async ({ region, response }) => {
    const apiResponse = await response
    expect(apiResponse.ok()).toBe(true)
    return { region, payload: await apiResponse.json() as ApiPayload }
  }))
  await expect(page.locator('.leaflet-interactive')).toHaveCount(regions.length)
  await expect(page).toHaveTitle('Heat and air-quality risk map for Bengaluru · HeatShield AI')
  await expect(page.locator('.page-actions .badge')).toHaveText('Open-Meteo model')
  const riskColors = { low: '#2f8a62', moderate: '#d99a2b', high: '#df742b', extreme: '#c93f45' }
  for (const [index, entry] of mapPayloads.entries()) {
    const risk = expectedRisk(entry.payload.current)
    await expect(page.locator('.leaflet-interactive').nth(index)).toHaveAttribute('fill', riskColors[risk.level])
  }
  const puneMapIndex = regions.findIndex((region) => region.slug === 'pune')
  const puneMap = mapPayloads[puneMapIndex].payload
  await expect(page.locator('.location-panel h2')).toHaveText('Bengaluru')
  await page.locator('.leaflet-interactive').nth(puneMapIndex).click()
  await expect(page.locator('.location-panel h2')).toHaveText('Pune')
  await expect(page.locator('.map-popup > strong')).toHaveText('Pune')
  await expect(page.locator('.map-popup > span').first()).toContainText(`${puneMap.current.temperature_2m.toFixed(1)}°C`)
  await expect(page.locator('.map-popup > span').first()).toContainText(`${puneMap.current.apparent_temperature.toFixed(1)}°C`)
  await expect(page.locator('.map-popup .risk-badge')).toHaveText(expectedRisk(puneMap.current).label)
  await expect(page.locator('.map-popup')).toContainText(/not a physical sensor/i)
  await expectTimestamps(page, pune)
  await page.getByRole('button', { name: 'Air pollution' }).click()
  await expect(page.getByRole('heading', { name: 'Modelled US + European AQI by location' })).toBeVisible()
  await expect(page.locator('.leaflet-interactive')).toHaveCount(regions.length)
  await page.getByRole('button', { name: 'Heat risk' }).click()
  expect(fullResponses).toHaveLength(3)

  console.log('STAGE: Keyboard focus and responsive navigation regressions')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.locator('#mobile-navigation').getByRole('link', { name: 'Risk Map', exact: true }).click()
  await expect(page.locator('#mobile-navigation')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.locator('#mobile-navigation')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.locator('#mobile-navigation')).toBeHidden()
  await expect(page.locator('.menu-button')).toHaveAttribute('aria-expanded', 'false')

  console.log(JSON.stringify({
    liveBrowserVerified: true,
    applicationUrl: page.url(),
    forecast: { dailyHighAndLowCards: 5, chartSeries: ['high', 'low'], hottestDayHighlighted: true, responsiveWidth: 390 },
    mumbai: {
      observedAt: current.time, temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature, humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m, heatIndex: expectedRisk(current).index, risk: expectedRisk(current).level,
      forecastDays: mumbai.daily.time.length,
    },
    pune: {
      observedAt: pune.current.time, temperature: pune.current.temperature_2m,
      heatIndex: puneRisk.index, risk: puneRisk.level, forecastDays: pune.daily.time.length,
    },
    bengaluru: {
      observedAt: bengaluru.current.time, temperature: bengaluru.current.temperature_2m,
      heatIndex: bengaluruRisk.index, risk: bengaluruRisk.level, forecastDays: bengaluru.daily.time.length,
    },
    addedLocations: regions.slice(7).map((region) => region.slug),
    map: {
      currentOnlyMarkers: mapPayloads.length,
      markerRiskLevels: Object.fromEntries(mapPayloads.map((entry) => [entry.region.slug, expectedRisk(entry.payload.current).level])),
      puneObservedAt: puneMap.current.time, puneTemperature: puneMap.current.temperature_2m,
    },
    fullRequestsAfterCachedNavigation: fullResponses.length,
    navigation: { singleSkipLink: true, routeTitles: true, routeFocus: true, mobileCurrentRouteFocus: true, desktopMenuCollapse: true },
  }))
})
