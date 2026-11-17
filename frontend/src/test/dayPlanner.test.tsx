import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAirQuality, getWeather } from '../api/openMeteo'
import { DayPlanner } from '../components/DayPlanner'
import { AppProvider } from '../context/AppContext'
import { SettingsProvider } from '../context/SettingsContext'
import { WeatherProvider } from '../context/WeatherContext'
import type { PlannerHour } from '../types'
import { airQualityResult, weatherFixture, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})
vi.mock('../api/location')

const getWeatherMock = vi.mocked(getWeather)
const getAirQualityMock = vi.mocked(getAirQuality)

function Providers({ children }: { children: ReactNode }) {
  return <MemoryRouter>
    <AppProvider>
      <SettingsProvider>
        <WeatherProvider>
          {children}
        </WeatherProvider>
      </SettingsProvider>
    </AppProvider>
  </MemoryRouter>
}

function renderPlanner() {
  return render(<Providers><DayPlanner /></Providers>)
}

function fixtureWith(hours: PlannerHour[]) {
  const fixture = weatherFixture('mumbai')
  return { data: { ...fixture, next24Hours: hours }, freshness: 'current' as const, fromCache: false }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  getAirQualityMock.mockImplementation(async (region) => airQualityResult(region.slug))
})

describe('DayPlanner states', () => {
  it('shows a loading state while the forecast loads', () => {
    getWeatherMock.mockReturnValue(new Promise(() => {}))
    renderPlanner()
    expect(screen.getByText('Loading the hourly forecast…')).toBeDefined()
  })

  it('shows a clear error state with retry when the forecast fails, without an all-clear', async () => {
    getWeatherMock.mockRejectedValue(new Error('offline'))
    renderPlanner()
    const heading = await screen.findByText('Hourly forecast unavailable')
    expect(heading).toBeDefined()
    expect(screen.getByText(/not an all-clear/)).toBeDefined()
    const retry = screen.getByRole('button', { name: /Try again/ })
    getWeatherMock.mockRejectedValueOnce(new Error('still offline'))
    await userEvent.click(retry)
    expect(getWeatherMock).toHaveBeenCalledTimes(2)
  })

  it('renders the unavailable state when the model has too few screened hours', async () => {
    getWeatherMock.mockResolvedValue(fixtureWith([]))
    renderPlanner()
    expect(await screen.findByText('Hourly forecast unavailable')).toBeDefined()
    expect(screen.getByText(/unknown, not safe/)).toBeDefined()
    expect(screen.queryByRole('group', { name: 'Hourly heat timeline' })).toBeNull()
  })
})

describe('DayPlanner timeline', () => {
  it('renders 24 modelled hours with peak tags and a text summary', async () => {
    getWeatherMock.mockResolvedValue(weatherResult('mumbai'))
    renderPlanner()
    const summary = await screen.findByText(/Modelled heat index for the next 24 hours/)
    expect(summary).toBeDefined()
    expect(summary.getAttribute('id')).toBe('day-planner-summary')
    const list = screen.getByRole('list', { name: 'Hourly heat timeline' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getAllByText('Peak').length).toBeGreaterThan(0)
  })

  it('shows source, modelled label, and last-updated time', async () => {
    getWeatherMock.mockResolvedValue(weatherResult('mumbai'))
    renderPlanner()
    const note = await screen.findByText(/Modelled forecast \(Open-Meteo weather model\)/)
    expect(note.textContent).toContain('updated')
    expect(screen.getByText(/not official warnings, not station observations/)).toBeDefined()
  })

  it('warns that unscreened hours are unknown when humidity is missing', async () => {
    const fixture = weatherFixture('mumbai')
    const partial = fixture.next24Hours.map((hour, index) => (index < 5 ? { ...hour, humidity: null } : hour))
    getWeatherMock.mockResolvedValue(fixtureWith(partial))
    renderPlanner()
    expect(await screen.findByText(/5 of 24 hours are unscreened/)).toBeDefined()
    expect(screen.getAllByText('Not screened').length).toBeGreaterThan(0)
  })

  it('surfaces a stale note when the cached forecast is stale', async () => {
    const fixture = weatherFixture('mumbai')
    getWeatherMock.mockResolvedValue({ data: fixture, freshness: 'stale', fromCache: true, warning: 'Using cached forecast' })
    renderPlanner()
    expect(await screen.findByText(/Using cached forecast/)).toBeDefined()
  })

  it('offers keyboard access to the timeline and keeps bands as text, not colour alone', async () => {
    getWeatherMock.mockResolvedValue(weatherResult('mumbai'))
    renderPlanner()
    const strip = await screen.findByRole('group', { name: 'Hourly heat timeline' })
    expect(strip.getAttribute('tabindex')).toBe('0')
    expect(strip.getAttribute('aria-describedby')).toBe('day-planner-summary')
    const list = screen.getByRole('list', { name: 'Hourly heat timeline' })
    const first = within(list).getAllByRole('listitem')[0]
    expect(within(first).getByText(/Low|Moderate|High|Extreme/)).toBeDefined()
  })
})
