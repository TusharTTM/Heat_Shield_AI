import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'
import type { WeatherResult } from '../types'
import { regions } from '../data/regions'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})
vi.mock('../components/ForecastChart', () => ({ ForecastChart: ({ days, source }: { days: unknown[]; source: string }) => <div data-testid="forecast-chart">{days.length} forecast days · {source}</div> }))
vi.mock('../components/RegionMap', () => ({ RegionMap: ({ locations }: { locations: Array<{ data: { slug: string } }> }) => <div data-testid="offline-map" data-order={locations.map((entry) => entry.data.slug).join(',')}>{locations.length} weather markers</div> }))

const weatherMock = vi.mocked(getWeather)
const currentMock = vi.mocked(getCurrentWeather)
const airMock = vi.mocked(getAirQuality)

function renderApp(route = '/') {
  return render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
}

async function selectCity(user: ReturnType<typeof userEvent.setup>, name: string, state: string) {
  await user.click(screen.getByRole('button', { name: /^Location:/ }))
  await user.click(await screen.findByRole('button', { name: `${name} ${state}` }))
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  weatherMock.mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  currentMock.mockReset().mockImplementation(async (region) => currentResult(region.slug))
  airMock.mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

describe('Open-Meteo HeatShield workflows', () => {
  it('connects current temperature, heat index, humidity, UV, air quality and attribution without ML/sensor claims', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
    const keyCards = document.querySelectorAll('.key-readings-grid .weather-card')
    expect(keyCards).toHaveLength(5)
    expect(keyCards[0]).toHaveTextContent('34.8°C')
    expect(keyCards[1]).toHaveTextContent('45.4°C')
    expect(keyCards[1]).toHaveTextContent('Feels like 44.9°C')
    expect(keyCards[2]).toHaveTextContent('62%')
    expect(keyCards[3]).toHaveTextContent('UV index')
    expect(keyCards[4]).toHaveTextContent('US AQI')
    expect(keyCards[4]).toHaveTextContent('European AQI 55')

    await user.click(screen.getByText(/More measurements, daytime hours, official feed status & source details/i))
    const allCards = document.querySelectorAll('.weather-card')
    expect(allCards).toHaveLength(7)
    expect(allCards[5]).toHaveTextContent('12.3km/h')

    const sources = screen.getByText('Sources & limits').closest('details')!
    await user.click(within(sources).getByText('Sources & limits'))
    expect(sources.textContent).toMatch(/AI\/ML predictions are not used/i)
    expect(sources.textContent).toMatch(/not physical IoT sensors.*not CPCB monitoring-station observations/i)
    expect(document.querySelector('.source-note')).toHaveTextContent('Last updated:')
    expect(document.querySelector('time[datetime="2026-11-08T09:05:00.000Z"]')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open-Meteo.com' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'CC BY 4.0' })[0]).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    expect(screen.queryByText(/Bundled HeatShield AI demo fixtures/i)).not.toBeInTheDocument()
  })

  it('keeps deterministic heat-index risk separate from apparent temperature and ML', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Temperature' })
    const keyCards = document.querySelectorAll('.key-readings-grid .weather-card')
    expect(keyCards[1]).toHaveTextContent('45.4°C')
    expect(keyCards[1]).toHaveTextContent('Feels like 44.9°C')

    await user.click(screen.getByText(/More measurements, daytime hours, official feed status & source details/i))
    const secondaryCards = document.querySelectorAll('.secondary-weather-card')
    expect(secondaryCards[0]).toHaveTextContent('12.3km/h')
    expect(screen.getByText(/High screening risk uses a 45.4°C heat index/i)).toBeInTheDocument()
    expect(screen.getByText(/not an official warning, physical sensor reading, or ML prediction/i)).toBeInTheDocument()
  })

  it('provides exactly seven main navigation links and opens Forecast', async () => {
    const user = userEvent.setup()
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getAllByRole('link')).toHaveLength(7)
    await user.click(within(nav).getByRole('link', { name: 'Forecast' }))
    expect(await screen.findByRole('heading', { name: '5-day weather forecast' })).toBeInTheDocument()
    expect(await screen.findByTestId('forecast-chart')).toHaveTextContent('5 forecast days · open-meteo')
    expect(document.title).toBe('5-day forecast for Mumbai · HeatShield AI')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('changes and persists locations, loading the selected Open-Meteo coordinates', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Temperature' })
    await selectCity(user, 'Delhi', 'Delhi')
    expect(await screen.findByRole('heading', { name: 'Environmental dashboard for Delhi' })).toBeInTheDocument()
    expect(document.title).toBe('Environmental dashboard for Delhi · HeatShield AI')
    await waitFor(() => expect(document.querySelector('.weather-card')).toHaveTextContent('42.1°C'))
    expect(weatherMock).toHaveBeenCalledWith(expect.objectContaining({ slug: 'delhi', latitude: 28.6139 }), false)
    expect(JSON.parse(localStorage.getItem('hs-region') ?? '')).toBe('delhi')
    await user.click(screen.getByRole('link', { name: 'Forecast' }))
    expect(await screen.findByText(/Open-Meteo weather model for Delhi:/i)).toBeInTheDocument()
  })

  it('makes every added Indian city selectable through the same weather workflow', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Temperature' })
    await user.click(screen.getByRole('button', { name: 'Location: Mumbai' }))
    expect(within(screen.getByRole('list', { name: 'Predefined locations' })).getAllByRole('button')).toHaveLength(15)
    await user.keyboard('{Escape}')
    for (const region of regions.slice(7)) {
      await selectCity(user, region.name, region.state)
      expect(await screen.findByRole('heading', { name: `Environmental dashboard for ${region.name}` })).toBeInTheDocument()
      await waitFor(() => expect(weatherMock).toHaveBeenLastCalledWith(expect.objectContaining({
        slug: region.slug, latitude: region.latitude, longitude: region.longitude,
      }), false))
    }
  })

  it('connects exactly five forecast days and highlights the hottest model day', async () => {
    renderApp('/forecast')
    expect(await screen.findByTestId('forecast-chart')).toHaveTextContent('5 forecast days')
    expect(document.querySelectorAll('.forecast-day')).toHaveLength(5)
    expect(document.querySelectorAll('.forecast-day.hottest')).toHaveLength(1)
    expect(document.querySelectorAll('.forecast-day h2')[0]).toHaveTextContent('Sun, 8 Nov')
    expect(screen.getByText(/Sunday, 8 November 2026 to Thursday, 12 November 2026/i)).toBeInTheDocument()
    expect(screen.getByText(/Hottest forecast day: Tue, 10 Nov/i)).toBeInTheDocument()
    expect(screen.getByText(/Not an AI\/ML prediction or official alert/i)).toBeInTheDocument()
    expect(document.querySelector('.source-note')).toHaveTextContent('Last updated:')
  })

  it('loads every current-only map location and updates the selected summary', async () => {
    const user = userEvent.setup()
    renderApp('/maps')
    expect(await screen.findByText(`${regions.length} weather markers`)).toBeInTheDocument()
    expect(screen.getByTestId('offline-map')).toHaveAttribute('data-order', regions.map((region) => region.slug).join(','))
    expect(currentMock).toHaveBeenCalledTimes(regions.length)
    const pune = screen.getByRole('button', { name: 'Select Pune' })
    await user.click(pune)
    expect(pune).toHaveAttribute('aria-pressed', 'true')
    const panel = screen.getByRole('complementary', { name: 'Selected location' })
    await waitFor(() => expect(panel).toHaveTextContent('34.8°C'))
    expect(panel).toHaveTextContent('34.3°C')
    expect(panel).toHaveTextContent('not an official warning, physical sensor reading, or ML prediction')
    expect(JSON.parse(localStorage.getItem('hs-region') ?? '')).toBe('pune')
  })

  it('keeps attribution and current-only markers when the selected full forecast fails', async () => {
    weatherMock.mockRejectedValue(new Error('Selected forecast unavailable'))
    renderApp('/maps')
    expect(await screen.findByText(`${regions.length} weather markers`)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Selected forecast unavailable')
    expect(screen.getByText('Open-Meteo model')).toBeInTheDocument()
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
    expect(document.querySelector('.map-source')).toHaveTextContent('Weather data by Open-Meteo.com, CC BY 4.0')
    expect(within(document.querySelector('.map-source')!).getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/')
    expect(within(document.querySelector('.map-source')!).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
  })

  it('labels the map unavailable when marker requests fail even if selected weather works', async () => {
    currentMock.mockRejectedValue(new Error('Map provider outage'))
    renderApp('/maps')
    expect(await screen.findByText('Weather map unavailable')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh map' })).toBeEnabled()
  })

  it('labels the map stale when any displayed marker uses stale cached weather', async () => {
    currentMock.mockImplementation(async (region) => ({ ...currentResult(region.slug), freshness: region.slug === 'pune' ? 'stale' : 'current', fromCache: true }))
    renderApp('/maps')
    expect(await screen.findByText(`${regions.length} weather markers`)).toBeInTheDocument()
    expect(screen.getByText('Stale cached data')).toBeInTheDocument()
  })

  it('opens the mobile menu, navigates, and closes it', async () => {
    const user = userEvent.setup()
    renderApp()
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    await user.click(within(mobileNav).getByRole('link', { name: 'Risk Map' }))
    expect(screen.getByRole('heading', { name: 'Heat and air-quality risk map' })).toBeInTheDocument()
    expect(document.getElementById('mobile-navigation')).not.toBeVisible()
  })

  it('closes the mobile menu when the current route is selected again', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    await user.click(within(mobileNav).getByRole('link', { name: 'Dashboard' }))
    expect(document.getElementById('mobile-navigation')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus()
  })

  it('closes the mobile menu when the viewport enters the desktop breakpoint', async () => {
    const user = userEvent.setup()
    const originalMatchMedia = window.matchMedia
    let desktopMatches = false
    let desktopListener: (() => void) | undefined
    window.matchMedia = ((query: string) => ({
      get matches() { return query === '(min-width: 1281px)' ? desktopMatches : false },
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (type: string, listener: () => void) => {
        if (query === '(min-width: 1281px)' && type === 'change') desktopListener = listener
      },
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      renderApp()
      await user.click(screen.getByRole('button', { name: 'Open navigation' }))
      expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true')
      act(() => {
        desktopMatches = true
        desktopListener?.()
      })
      expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
      expect(document.getElementById('mobile-navigation')).not.toBeVisible()
    } finally {
      cleanup()
      window.matchMedia = originalMatchMedia
    }
  })

  it('makes the main landmark a programmatic skip-link target', () => {
    renderApp()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  })

  it('keeps five sourced safety tips and the emergency phone action available', async () => {
    renderApp('/safety')
    expect(await screen.findByRole('heading', { name: 'Guidance for Mumbai' })).toBeInTheDocument()
    expect(document.querySelectorAll('.safety-tip')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: 'Know when to get help' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 112 in India' })).toHaveAttribute('href', 'tel:112')
    expect(screen.getByText(/Do not give fluids to someone who may have heatstroke/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NWS: Understanding heat index' })).toHaveAttribute('href', 'https://www.weather.gov/safety/heat-tools')
    expect(screen.getByRole('link', { name: 'NWS: Heat safety' })).toHaveAttribute('href', 'https://www.weather.gov/safety/heat')
    expect(screen.getByRole('link', { name: 'NWS: Heat illness and first aid' })).toHaveAttribute('href', 'https://www.weather.gov/safety/heat-illness')
  })

  it('updates selected-location safety guidance from the same weather-model inputs', async () => {
    const user = userEvent.setup()
    renderApp('/safety')
    await selectCity(user, 'Ahmedabad', 'Gujarat')
    expect(await screen.findByText(/Extreme screening risk uses a 54.1°C heat index/i)).toBeInTheDocument()
    expect(document.querySelector('.selected-guidance-action')).toHaveTextContent(/Stay in a cool indoor place as much as possible/i)
    expect(screen.getByText(/not AI-generated, a physical sensor assessment, or an official warning/i)).toBeInTheDocument()
  })

  it('documents all four heat-index thresholds and their deterministic recommendations', async () => {
    renderApp('/safety')
    expect(await screen.findByRole('heading', { name: 'Heat-index screening levels' })).toBeInTheDocument()
    expect(document.querySelectorAll('.risk-threshold-grid .risk-threshold')).toHaveLength(4)
    expect(screen.getByText('Below 27°C')).toBeInTheDocument()
    expect(screen.getByText('27°C to below 33°C')).toBeInTheDocument()
    expect(screen.getByText('33°C to below 52°C')).toBeInTheDocument()
    expect(screen.getByText('52°C and above')).toBeInTheDocument()
    expect(screen.getByText(/NOAA\/NWS heat-index regression and applicable humidity adjustments/i)).toBeInTheDocument()
    expect(screen.getByText(/not trained ML classes or official IMD warnings/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NOAA/NWS method' })).toHaveAttribute('href', 'https://www.weather.gov/safety/heat-tools')
    expect(document.querySelectorAll('.risk-threshold-grid .risk-action')).toHaveLength(4)
  })

  it('shows a real loading indicator without displaying hardcoded readings', async () => {
    let resolveWeather!: (value: WeatherResult) => void
    weatherMock.mockReturnValueOnce(new Promise((resolve) => { resolveWeather = resolve }))
    renderApp()
    // Exactly one live region announces loading; the checklist placeholder is
    // part of the same announced state rather than a second competing message.
    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toHaveTextContent('Loading weather for Mumbai')
    expect(document.querySelectorAll('.key-readings-grid .weather-card')).toHaveLength(5)
    expect(Array.from(document.querySelectorAll('.key-readings-grid .weather-card')).every((card) => card.textContent?.includes('—'))).toBe(true)
    expect(screen.queryByText('34.8°C')).not.toBeInTheDocument()
    resolveWeather(weatherResult())
    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
  })

  it('shows API errors, no fake readings, and retries successfully', async () => {
    const user = userEvent.setup()
    weatherMock.mockRejectedValueOnce(new Error('Test network outage'))
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Weather unavailable for Mumbai')
    expect(screen.getByRole('alert')).toHaveTextContent('Test network outage')
    expect(document.querySelectorAll('.key-readings-grid .weather-card')).toHaveLength(5)
    expect(Array.from(document.querySelectorAll('.key-readings-grid .weather-card')).every((card) => card.textContent?.includes('—'))).toBe(true)
    expect(screen.queryByText('34.8°C')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
  })

  it('labels stale cached data after a failed live refresh', async () => {
    weatherMock.mockResolvedValueOnce({ ...weatherResult(), freshness: 'stale', fromCache: true, warning: 'Live refresh failed. Showing cached data.' })
    renderApp()
    expect(await screen.findByText('Stale cached data')).toBeInTheDocument()
    expect(screen.getByText(/Showing cached weather/i)).toBeInTheDocument()
    expect(document.querySelector('.source-note')).toHaveTextContent('Stale cached weather model data.')
  })

  it('redirects legacy weather and assistant links instead of breaking them', async () => {
    renderApp('/weather')
    expect(screen.getByRole('heading', { name: 'Environmental dashboard for Mumbai' })).toBeInTheDocument()
    cleanup()
    renderApp('/assistant')
    expect(screen.getByRole('heading', { name: 'Safety Guide' })).toBeInTheDocument()
  })

  it('shows a useful not-found page and returns Home', async () => {
    const user = userEvent.setup()
    renderApp('/not-a-real-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(document.title).toBe('Page not found · HeatShield AI')
    await user.click(screen.getByRole('link', { name: 'Back to Home' }))
    expect(screen.getByRole('heading', { name: 'Environmental dashboard for Mumbai' })).toBeInTheDocument()
  })

  it('separates official CAP coverage from generated assessment notices on Alerts', async () => {
    renderApp('/alerts')
    expect(await screen.findByRole('heading', { name: 'Official government warnings' })).toBeInTheDocument()
    expect(screen.getByText('Official backend not configured')).toBeInTheDocument()
    expect(screen.getByText('Official CAP backend not configured')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Generated assessment notices' })).toBeInTheDocument()
    expect(screen.getByText(/These are not official government alerts/i)).toBeInTheDocument()
    expect(screen.getByText(/No background push service is deployed/i)).toBeInTheDocument()
  })

  it('explains optional official sources without claiming ML, sensors, or alert delivery in About', () => {
    renderApp('/about')
    expect(screen.getByText('Open-Meteo integration')).toBeInTheDocument()
    expect(screen.getByText('CAMS model · not CPCB')).toBeInTheDocument()
    expect(screen.getAllByText('Backend not configured')).toHaveLength(2)
    expect(screen.getByText(/does not mean an ML disaster model, official warning feed, hosted backend, or physical sensor is working/i)).toBeInTheDocument()
    expect(screen.getByText(/selected city, cached model responses, and notification-deduplication history are stored only in this browser/i)).toBeInTheDocument()
    expect(screen.getByText(/direct IMD district-warning\/CWC city-gauge feeds, email\/SMS and background push remain unconnected/i)).toBeInTheDocument()
  })
})
