import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAirQuality, getHistoricalWeather, getWeather } from '../api/openMeteo'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getRegion } from '../data/regions'
import type { HistoricalData } from '../types'
import { airQualityResult, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn(), getHistoricalWeather: vi.fn() }
})

vi.mock('react-chartjs-2', () => ({
  Line: (props: Record<string, unknown>) => <div role="img" aria-label={String(props['aria-label'] ?? '')} data-testid="chart-stub" />,
}))

const getWeatherMock = vi.mocked(getWeather)
const getAirQualityMock = vi.mocked(getAirQuality)
const getHistoricalWeatherMock = vi.mocked(getHistoricalWeather)

function historyFixture(): HistoricalData {
  return {
    region: getRegion('mumbai'),
    days: [{ date: '2026-11-07', max: 33.2, min: 26.4, mean: 29.6 }],
    hourly: Array.from({ length: 24 }, (_, index) => ({
      isoTime: new Date(Date.UTC(2026, 10, 7, index)).toISOString(),
      label: `${index % 12 === 0 ? 12 : index % 12} ${index < 12 ? 'AM' : 'PM'}`,
      temperature: Math.round((26 + 4 * Math.sin((index / 24) * 2 * Math.PI - Math.PI / 2)) * 10) / 10,
      humidity: 58,
      uvIndex: null,
    })),
    observedTimeRange: { start: '2026-11-07', end: '2026-11-07' },
    retrievedAt: '2026-11-08T09:10:00.000Z',
    source: 'Open-Meteo Historical Weather API',
    evidenceType: 'weather-model-reanalysis',
  }
}

function renderApp(route: string) {
  return render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  getWeatherMock.mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  getAirQualityMock.mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
  getHistoricalWeatherMock.mockReset().mockImplementation(async () => ({ data: historyFixture(), freshness: 'current', fromCache: false }))
})

describe('metric detail views', () => {
  it('opens the temperature detail with a chart, summary, hourly table, and guidance', async () => {
    renderApp('/metric/temperature')
    expect(await screen.findByRole('heading', { name: 'Temperature · Today' })).toBeDefined()
    // Summary chips carry units.
    const summary = screen.getByRole('list', { name: /Summary of minimum, maximum/ })
    expect(within(summary).getByText('Current model value')).toBeDefined()
    expect(within(summary).getAllByText(/°C/).length).toBeGreaterThan(0)
    // Chart stub carries the unit in its accessible label.
    const chart = screen.getByTestId('chart-stub')
    expect(chart.getAttribute('aria-label')).toContain('Air temperature chart in °C')
    expect(chart.getAttribute('aria-label')).toContain('Modelled estimates')
    // Accessible hourly table with 24 rows.
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(25) // header + 24 hours
    // Plain-language explanation + safety guidance.
    expect(screen.getByRole('heading', { name: 'What this metric means' })).toBeDefined()
    expect(screen.getByText(/NOAA\/NWS|2 metres above ground/)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Safety guidance' })).toBeDefined()
    // Source + last updated.
    expect(screen.getAllByText(/Open-Meteo \(weather model\)/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Last updated/)).toBeDefined()
  })

  it('offers yesterday, today, and tomorrow controls with the active day marked', async () => {
    renderApp('/metric/temperature')
    await screen.findByRole('heading', { name: 'Temperature · Today' })
    const dates = screen.getByRole('navigation', { name: 'Choose a date' })
    const links = within(dates).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Yesterday2026-11-07', 'Today2026-11-08', 'Tomorrow2026-11-09'])
    expect(links[1].getAttribute('aria-current')).toBe('page')
    expect(links[0].getAttribute('aria-current')).toBeNull()
  })

  it('switches to yesterday and shows historical reanalysis data', async () => {
    const user = userEvent.setup()
    renderApp('/metric/temperature')
    await screen.findByRole('heading', { name: 'Temperature · Today' })
    await user.click(screen.getByRole('link', { name: /Yesterday/ }))
    expect(await screen.findByRole('heading', { name: 'Temperature · Yesterday' })).toBeDefined()
    expect(getHistoricalWeatherMock).toHaveBeenCalledWith(expect.anything(), '2026-11-07', '2026-11-07')
    expect(screen.getAllByText('Historical reanalysis').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/ERA5 reanalysis/).length).toBeGreaterThan(0)
  })

  it('shows an honest unavailable state for yesterday\'s UV — unknown, not a low-UV day', async () => {
    renderApp('/metric/uv-index?day=yesterday')
    expect(await screen.findByText('No data for this date')).toBeDefined()
    expect(screen.getByText(/does not provide historical UV index readings/)).toBeDefined()
    expect(screen.getByText(/not a low-UV day/)).toBeDefined()
    expect(screen.queryByTestId('chart-stub')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('never presents missing air-quality data as clean air', async () => {
    const empty = airQualityResult('mumbai')
    empty.data.hourlySeries = []
    empty.data.hourly = []
    getAirQualityMock.mockResolvedValue(empty)
    renderApp('/metric/air-quality')
    expect(await screen.findByText('No data for this date')).toBeDefined()
    expect(screen.getByText(/unknown — not clean air/)).toBeDefined()
  })

  it('shows loading and then error states with retry when the forecast fails', async () => {
    getWeatherMock.mockReturnValue(new Promise(() => {}))
    getAirQualityMock.mockReturnValue(new Promise(() => {}))
    renderApp('/metric/temperature')
    expect(await screen.findByText('Loading the hourly readings…')).toBeDefined()

    cleanup()
    getWeatherMock.mockRejectedValue(new Error('offline'))
    getAirQualityMock.mockRejectedValue(new Error('offline'))
    renderApp('/metric/temperature')
    expect(await screen.findByText('Data could not be loaded')).toBeDefined()
    expect(screen.getByText(/Missing data is not an all-clear/)).toBeDefined()
    getWeatherMock.mockRejectedValueOnce(new Error('still offline'))
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(getWeatherMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('navigates between metrics and back to the dashboard', async () => {
    renderApp('/metric/temperature')
    await screen.findByRole('heading', { name: 'Temperature · Today' })
    const backLinks = screen.getAllByRole('link', { name: 'Back to dashboard' })
    expect(backLinks[0].getAttribute('href')).toBe('/')
    const nextLinks = screen.getAllByRole('link', { name: 'Next metric: Heat Index' })
    expect(nextLinks[0].getAttribute('href')).toBe('/metric/heat-index?day=today')
    const previousLinks = screen.getAllByRole('link', { name: 'Previous metric: Heat Risk' })
    expect(previousLinks[0].getAttribute('href')).toBe('/metric/heat-risk?day=today')
  })

  it('redirects unknown metrics back to the dashboard', async () => {
    renderApp('/metric/not-a-metric')
    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeDefined()
  })
})

describe('dashboard metric cards', () => {
  it('makes each metric card a new-tab link to its own detail view', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })
    const expectations: Array<[string, string]> = [
      ['Temperature — open detail view in a new tab', '/metric/temperature'],
      ['Heat Index — open detail view in a new tab', '/metric/heat-index'],
      ['Humidity — open detail view in a new tab', '/metric/humidity'],
      ['UV Index — open detail view in a new tab', '/metric/uv-index'],
      ['Air Quality — open detail view in a new tab', '/metric/air-quality'],
      ['Heat Risk — open detail view in a new tab', '/metric/heat-risk'],
    ]
    for (const [name, href] of expectations) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
    }
  })

  it('keeps the readings inside the original card articles', async () => {
    renderApp('/')
    const heading = await screen.findByRole('heading', { name: 'Temperature' })
    expect(heading.closest('article')?.className).toContain('uploaded-tile')
    expect(heading.closest('a')?.getAttribute('target')).toBe('_blank')
  })
})
