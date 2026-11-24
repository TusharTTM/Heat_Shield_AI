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
  it('puts the most important thing first, and the readings below the actions', async () => {
    // Order is part of the product, not styling. A visitor who reads one screen
    // should get the verdict and what to do about it — not five numbers they
    // have to interpret themselves.
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()

    // jsdom reports every rect as 0, so assert on document order — the same
    // sequence the browser lays out, without depending on geometry. The
    // `is-revealed` state class is stripped: it is runtime state, not identity.
    const docOrder = [...document.querySelectorAll('.scroll-section')].map(
      (el) => (el.id || el.className.replace('scroll-section', '').replace('is-revealed', '').trim()).replace(/\s+/g, ' '),
    )
    const at = (needle: string) => docOrder.findIndex((k) => k.includes(needle))
    const verdict = at('situation-alert')
    const suggestions = at('uploaded-panel')
    const plan = at('upcoming-risk')
    const readings = at('key-readings-grid')
    const shortcuts = at('dashboard-shortcuts')
    const overview = at('dashboard-overview')

    for (const i of [verdict, suggestions, plan, readings, shortcuts]) expect(i).toBeGreaterThanOrEqual(0)

    // 1. The page title and city picker stay at the top; the verdict is the
    //    first thing with substance on it.
    expect(overview).toBe(0)
    expect(verdict).toBe(overview + 1)
    // 2. Then what to do about it.
    expect(suggestions).toBeGreaterThan(verdict)
    // 3. Then the plan for the coming hours.
    expect(plan).toBeGreaterThan(suggestions)
    // 4. The readings are the evidence behind those three, so they follow.
    expect(readings).toBeGreaterThan(plan)
    // 5. Navigation last.
    expect(shortcuts).toBeGreaterThan(readings)
  })

  it('keeps the precautions out of the readings grid', async () => {
    // The grid is a single glanceable set of measurements, and is revealed as one
    // sheet. An action list inside it would break both.
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
    const grid = document.querySelector('.key-readings-grid')!
    expect(within(grid as HTMLElement).queryByRole('heading', { name: /AI suggestions/i })).toBeNull()
    expect(document.querySelectorAll('.uploaded-panel').length).toBe(1)
  })


  it('shows the situation alert, five readings, and shortcuts outside the grid', async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeInTheDocument()
    const alert = screen.getByLabelText('Official warnings versus model screening')
    expect(within(alert).getByText(/34.8°C model air temperature with 62% humidity creates a 45.4°C shade heat index/i)).toBeInTheDocument()

    const readings = document.querySelectorAll('.key-readings-grid .weather-card')
    expect(readings).toHaveLength(5)
    expect(readings[0]).toHaveTextContent('34.8°C')
    expect(readings[1]).toHaveTextContent('45.4°C')
    expect(readings[1]).toHaveTextContent('Feels like 44.9°C')
    expect(readings[2]).toHaveTextContent('62%')
    expect(readings[3]).toHaveTextContent('UV Index')
    expect(readings[4]).toHaveTextContent('US AQI')

    // The grid is now purely weather readings: the Heat Risk card duplicated the
    // heat index, and Reports/Assistant moved to their own shortcuts row.
    expect(document.querySelectorAll('.key-readings-grid .uploaded-action-tile')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'Heat Risk' })).not.toBeInTheDocument()
    const shortcuts = document.querySelectorAll('.dashboard-shortcuts a')
    expect(shortcuts).toHaveLength(1)
    expect(shortcuts[0]).toHaveTextContent('Assistant')
    // The heat index card still carries the screening level.
    expect(readings[1]).toHaveTextContent('High')
  })

  it('lets users select a city from the uploaded screen', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    expect(screen.queryByText('City selection')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Location: Mumbai' }))
    expect(screen.queryByText('City selection')).not.toBeInTheDocument()
    const picker = screen.getByRole('dialog', { name: 'Choose a location' })
    const search = within(picker).getByRole('searchbox', { name: 'Search cities or states' })
    await user.type(search, 'Chennai')
    await user.click(within(picker).getByRole('button', { name: /Chennai/i }))

    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Chennai' })).toBeInTheDocument()
    expect(document.title).toBe('Dashboard · Heat Shield AI')
  })

  it('keeps missing readings unassessed and records the daily checklist', async () => {
    weatherMock.mockRejectedValue(new Error('Weather model offline'))
    airMock.mockRejectedValue(new Error('CAMS model offline'))
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Unavailable' })).toBeInTheDocument()
    const readings = document.querySelectorAll('.key-readings-grid .weather-card')
    expect(readings).toHaveLength(5)
    expect(readings[0]).toHaveTextContent('—')
    const taskList = screen.getByRole('list', { name: 'Suggested precautions for Mumbai' })
    expect(within(taskList).getAllByText('Unassessed')).toHaveLength(3)

    const user = userEvent.setup()
    const boxes = within(taskList).getAllByRole('checkbox')
    expect(boxes[0]).not.toBeChecked()
    await user.click(boxes[0])
    // Ticking still records against the day; only the score and progress bar
    // were removed, so assert the checkbox state rather than a percentage.
    expect(boxes[0]).toBeChecked()
    expect(screen.queryByRole('progressbar', { name: /Heat mission progress/ })).toBeNull()
  })

  it('does not label missing environmental data as safe', () => {
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
  })
})
