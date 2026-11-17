import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import type { WeatherData } from '../types'
import { airQualityResult, currentResult, weatherFixture } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})

/** 16:00 IST — after the afternoon peak, inside the hot-night lead window. */
const FIXED_NOW = new Date('2026-11-16T16:00:00+05:30')

/** Fixture weather stamped with the frozen clock and today's forecast dates, so
 * lead-time windows in the early-warning engine behave like they would in prod. */
function freshWeather(slug = 'mumbai'): WeatherData {
  const base = weatherFixture(slug)
  const istDate = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10)
  return {
    ...base,
    heatIndex: 34,
    observedAt: FIXED_NOW.toISOString(),
    retrievedAt: FIXED_NOW.toISOString(),
    forecast: [
      { ...base.forecast[0], date: istDate(FIXED_NOW), min: 27, max: 36, heatIndexMax: 38 },
      { ...base.forecast[1], date: istDate(new Date(FIXED_NOW.getTime() + 86_400_000)), min: 22, max: 31, heatIndexMax: 25 },
    ],
  }
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-text-size')
  document.documentElement.removeAttribute('data-contrast')
  window.scrollTo = vi.fn()
  // Fake only the clock — intervals and timers stay real for the components.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => ({ data: freshWeather(region.slug), freshness: 'current', fromCache: false }))
  vi.mocked(getCurrentWeather).mockReset().mockImplementation(async (region) => currentResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

afterEach(() => vi.useRealTimers())

function renderAt(path: string) {
  return render(
    <AppProvider>
      <WeatherProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </WeatherProvider>
    </AppProvider>,
  )
}

function seedSettings(settings: Record<string, unknown>) {
  localStorage.setItem('hs-settings-v1', JSON.stringify(settings))
}

describe('early warnings on the dashboard', () => {
  it('shows warnings matching the alert types and lead time', async () => {
    seedSettings({ heatAlerts: { types: { hotNights: true } } })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /next 6 hours/i })).toBeInTheDocument()
    expect(screen.getByText('High heat index right now')).toBeInTheDocument()
    expect(screen.getByText('Hot night expected tonight')).toBeInTheDocument()
    expect(screen.getByText(/Screening signals from forecast models/i)).toBeInTheDocument()
  })

  it('disappears when early warnings are switched off in the profile', async () => {
    seedSettings({ heatAlerts: { earlyWarnings: false } })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai', level: 1 })
    expect(screen.queryByRole('heading', { name: /next \d+ hours/i })).not.toBeInTheDocument()
  })

  it('filters out categories whose alert type is disabled — without hiding the situation alert', async () => {
    seedSettings({
      heatAlerts: {
        earlyWarnings: true,
        types: { extremeHeat: false, heatIndex: false, airQuality: false, official: false, hotNights: true },
      },
    })
    renderAt('/')
    expect(await screen.findByText('Hot night expected tonight')).toBeInTheDocument()
    expect(screen.queryByText('High heat index right now')).not.toBeInTheDocument()
    expect(screen.queryByText(/Air quality in the unhealthy screening band/i)).not.toBeInTheDocument()
    // Safety information is never preference-filtered.
    expect(screen.getByLabelText('Official warnings versus model screening')).toBeInTheDocument()
  })

  it('hides tomorrow-only warnings until the lead time reaches them', async () => {
    // Tomorrow crosses the high boundary; today stays calm, so the only warning
    // is the forecast one whose onset is 11:00 IST tomorrow.
    const calm = freshWeather()
    const tomorrow = calm.forecast[1]
    calm.heatIndex = 25
    calm.forecast = [
      { ...calm.forecast[0], heatIndexMax: 25 },
      { ...tomorrow, heatIndexMax: 38 },
    ]
    vi.mocked(getWeather).mockImplementation(async () => ({ data: calm, freshness: 'current', fromCache: false }))
    const types = { extremeHeat: true, heatIndex: false, airQuality: false, official: false, hotNights: false }

    seedSettings({ heatAlerts: { earlyWarnings: true, leadHours: 1, types } })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai', level: 1 })
    expect(screen.queryByText('High heat index forecast')).not.toBeInTheDocument()
    cleanup()

    seedSettings({ heatAlerts: { earlyWarnings: true, leadHours: 24, types } })
    renderAt('/')
    expect(await screen.findByText('High heat index forecast')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /next 24 hours/i })).toBeInTheDocument()
  })
})

describe('hydration reminders and quiet hours', () => {
  it('holds the reminder toast back during quiet hours', async () => {
    localStorage.setItem('hs-hydration-last', String(Date.now() - 31 * 60 * 1000))
    seedSettings({
      hydration: { enabled: true, intervalMinutes: 30 },
      heatAlerts: { quietHours: { enabled: true, start: '00:00', end: '23:59' } },
    })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai', level: 1 })
    expect(screen.queryByText('Hydration reminder')).not.toBeInTheDocument()
  })

  it('shows the toast when quiet hours are off', async () => {
    localStorage.setItem('hs-hydration-last', String(Date.now() - 31 * 60 * 1000))
    seedSettings({ hydration: { enabled: true, intervalMinutes: 30 } })
    renderAt('/')
    expect(await screen.findByText('Hydration reminder')).toBeInTheDocument()
  })
})

describe('language preference', () => {
  it('translates interface labels and the document title', async () => {
    seedSettings({ display: { language: 'hi' } })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'तापमान' })).toBeInTheDocument()
    expect(screen.getByText('हीट शील्ड')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('डैशबोर्ड · Heat Shield AI'))
    expect(document.documentElement.lang).toBe('hi')
  })

  it('switches language live from the profile page', async () => {
    renderAt('/profile')
    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'mr' } })
    await waitFor(() => expect(document.title).toBe('प्रोफाइल · Heat Shield AI'))
    expect(screen.getByRole('heading', { name: 'प्रोफाइल', level: 1 })).toBeInTheDocument()
  })
})

describe('device location sync', () => {
  it('snaps to the nearest city on load when enabled and permission is granted', async () => {
    seedSettings({ useDeviceLocation: true })
    const geolocation = {
      getCurrentPosition: vi.fn((success: (position: GeolocationPosition) => void) => {
        success({ coords: { latitude: 18.52, longitude: 73.85 } } as GeolocationPosition)
      }),
    }
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
    Object.defineProperty(navigator, 'permissions', {
      value: { query: async () => ({ state: 'granted', addEventListener() {}, removeEventListener() {} }) },
      configurable: true,
    })
    renderAt('/')
    await waitFor(() => expect(JSON.parse(localStorage.getItem('hs-region') ?? '""')).toBe('pune'))
    expect(geolocation.getCurrentPosition).toHaveBeenCalled()
  })

  it('does not request the location when the setting is off', async () => {
    const geolocation = { getCurrentPosition: vi.fn() }
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
    Object.defineProperty(navigator, 'permissions', {
      value: { query: async () => ({ state: 'granted', addEventListener() {}, removeEventListener() {} }) },
      configurable: true,
    })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai', level: 1 })
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })
})
