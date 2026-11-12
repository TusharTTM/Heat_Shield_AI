import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getWeather } from '../api/openMeteo'
import { airQualityResult, weatherResult } from './weatherFixtures'
import {
  buildDashboardSuggestions,
  computePreparednessProgress,
  selectPrimaryRiskSummary,
} from '../data/dashboardTasks'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getAirQuality: vi.fn() }
})

const weatherMock = vi.mocked(getWeather)
const airMock = vi.mocked(getAirQuality)

function renderDashboard() {
  return render(
    <AppProvider>
      <WeatherProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </WeatherProvider>
    </AppProvider>,
  )
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  weatherMock.mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  airMock.mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

afterEach(() => vi.restoreAllMocks())

describe('Uploaded Heat Shield dashboard', () => {
  it('shows the selected city, heat-risk alert, five measured readings, and the supporting tiles', async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Environmental dashboard for Mumbai' })).toBeInTheDocument()
    const alert = screen.getByLabelText('Official warnings versus model screening')
    expect(within(alert).getByRole('heading', { name: 'High' })).toBeInTheDocument()
    expect(within(alert).getByText(/34.8°C model air temperature with 62% humidity creates a 45.4°C shade heat index/i)).toBeInTheDocument()
    expect(within(alert).getByText(/Official government feed not connected/i)).toBeInTheDocument()

    const readings = document.querySelectorAll('.key-readings-grid .weather-card')
    expect(readings).toHaveLength(5)
    expect(readings[0]).toHaveTextContent('34.8°C')
    expect(readings[1]).toHaveTextContent('45.4°C')
    expect(readings[1]).toHaveTextContent('Feels like 44.9°C')
    expect(readings[2]).toHaveTextContent('62%')
    expect(readings[3]).toHaveTextContent('UV index')
    expect(readings[4]).toHaveTextContent('US AQI')
    expect(screen.getByRole('heading', { name: 'Heat risk' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Safety guide' })).toBeInTheDocument()
  })

  it('lets users change city and keeps the city picker available on the dashboard', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    await user.click(screen.getByRole('button', { name: 'Location: Mumbai' }))
    const picker = screen.getByRole('dialog', { name: 'Choose a location' })
    const search = within(picker).getByRole('searchbox', { name: 'Search cities or states' })
    await user.type(search, 'Chennai')
    await user.click(within(picker).getByRole('button', { name: /Chennai/i }))

    expect(await screen.findByRole('heading', { name: 'Environmental dashboard for Chennai' })).toBeInTheDocument()
    expect(document.title).toBe('Environmental dashboard for Chennai · HeatShield AI')
  })

  it('keeps unavailable readings unassessed and shows a retryable feed error', async () => {
    weatherMock.mockRejectedValue(new Error('Weather model offline'))
    airMock.mockRejectedValue(new Error('CAMS model offline'))
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Weather model offline')
    const readings = document.querySelectorAll('.key-readings-grid .weather-card')
    expect(readings[0]).toHaveTextContent('—')
    const taskList = screen.getByRole('list', { name: 'Suggested preparedness tasks for Mumbai' })
    expect(within(taskList).getAllByText('Unassessed')).toHaveLength(3)
    expect(within(taskList).queryByText('Low screening')).not.toBeInTheDocument()
  })

  it('tracks suggested precautions in the mission progress panel', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    const taskList = screen.getByRole('list', { name: 'Suggested preparedness tasks for Mumbai' })
    const tasks = within(taskList).getAllByRole('checkbox')
    expect(tasks).toHaveLength(3)
    const progress = screen.getByRole('progressbar', { name: 'Heat mission progress: 0%' })
    expect(progress).toHaveAttribute('value', '0')

    await user.click(tasks[0])
    expect(screen.getByRole('progressbar', { name: 'Heat mission progress: 33%' })).toHaveAttribute('value', '33')
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    expect(screen.getByText(/Rule-based precautions/i)).toBeInTheDocument()
  })

  it('keeps official warnings separate from model risk and offers secondary source detail on demand', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    expect(screen.getByLabelText('Official warnings versus model screening')).toBeInTheDocument()
    const sources = screen.getByText(/More measurements, daytime hours, official feed status & source details/i).closest('details')!
    expect(sources).not.toHaveAttribute('open')
    await user.click(within(sources).getByText(/More measurements/i))
    expect(screen.getByRole('heading', { name: 'Wind speed' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rainfall' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Supporting detail pages' })).toBeInTheDocument()
  })

  it('does not label missing conditions as safe and keeps the preparedness helper data accurate', () => {
    const officialAlerts = { status: 'unconfigured' as const, data: null, error: null, refresh: () => {} }
    const summary = selectPrimaryRiskSummary({
      weather: null,
      air: null,
      weatherStatus: 'error',
      airStatus: 'error',
      officialAlerts,
    })
    expect(summary.level).toBeNull()
    expect(summary.bannerLabel).toBe('Unavailable')
    expect(summary.shortReason).toMatch(/Unassessed conditions are never marked Safe/i)

    const tasks = buildDashboardSuggestions(null, null)
    expect(tasks).toHaveLength(3)
    expect(tasks.every((task) => task.level === null)).toBe(true)
    const progress = computePreparednessProgress(tasks, ['not-a-task-id', tasks[0].id])
    expect(progress.completedCount).toBe(1)
    expect(progress.percent).toBe(33)
  })
})
