import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'
import { OFFICIAL_ALERT_WORDING, SCREENING_LABELS } from '../data/hazards'

/**
 * Regression cover for the reported UI and data defects. Each case pins a defect
 * that a reader could see, so a later refactor that brings one back fails here
 * rather than at a screenshot review nobody can run.
 */

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})

const weatherMock = vi.mocked(getWeather)
const currentMock = vi.mocked(getCurrentWeather)
const airMock = vi.mocked(getAirQuality)
const sheet = readFileSync('src/styles/index.css', 'utf8')

function renderApp(path = '/') {
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

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
  weatherMock.mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  currentMock.mockReset().mockImplementation(async (region) => currentResult(region.slug))
  airMock.mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('1 · one screening vocabulary across every page', () => {
  it('publishes four bands and keeps alert wording as a separate mapping', () => {
    expect(SCREENING_LABELS).toEqual({ low: 'Low', moderate: 'Moderate', high: 'High', extreme: 'Extreme' })
    // The alert words are the band's route into notice language, not a second scale.
    expect(OFFICIAL_ALERT_WORDING).toEqual({ low: null, moderate: 'Watch', high: 'Warning', extreme: 'Severe' })
    expect(Object.keys(OFFICIAL_ALERT_WORDING)).toEqual(Object.keys(SCREENING_LABELS))
  })

  it('teaches the four bands in About rather than the alert words', async () => {
    renderApp('/about')
    const bands = await screen.findByRole('heading', { name: 'What the risk labels mean' })
    const block = bands.closest('.about-topic-block') as HTMLElement
    // The old copy opened with "Safe, Watch, Warning, and Severe". Safe is not a label.
    expect(block).not.toHaveTextContent(/In plain language:\s*Safe, Watch/)
    expect(within(block).getByText(/Low, Moderate, High, and Extreme only rate/)).toBeInTheDocument()
    expect(within(block).getByText(/moderate conditions produce a Watch, high a Warning and extreme a Severe/)).toBeInTheDocument()
  })

  it('labels a HeatShield notice with its band and never the band alone as official wording', () => {
    // Guard the source, since notices are built from assessments across pages.
    const alerts = readFileSync('src/data/alerts.ts', 'utf8')
    expect(alerts).toContain('OFFICIAL_ALERT_WORDING')
    expect(alerts).not.toMatch(/statusLabels\[[^\]]+\]\s*}{0}\)?\s*=\s*.*Warning/)
  })
})

describe('2 · the Air Quality card states its chosen index once', () => {
  it('does not repeat the selected AQI label in the card summary', async () => {
    renderApp('/')
    const card = (await screen.findByRole('heading', { name: 'Air quality' })).closest('.weather-card') as HTMLElement
    const text = card.textContent ?? ''
    const value = card.querySelector('.uploaded-tile-value')
    const selectedIndex = value?.querySelector('small')?.textContent ?? ''
    expect(['US AQI', 'European AQI']).toContain(selectedIndex)
    expect((text.match(/(?:US|European) AQI/g) ?? []).length).toBe(1)
    expect(card.querySelector('.uploaded-tile-detail')).not.toHaveTextContent(/(?:US|European) AQI\s*\d/)
  })
})

describe('3 · the Risk Map describes only what it assesses', () => {
  it('names heat and air quality in the title and names the hazards it does not assess', async () => {
    const user = userEvent.setup()
    renderApp('/maps')
    expect(await screen.findByRole('heading', { level: 1, name: /Heat and air-quality risk map/i })).toBeInTheDocument()
    const coverage = screen.getByText(/What the circles actually show/i).closest('details')!
    await user.click(within(coverage).getByText(/What the circles actually show/i))
    expect(coverage).toHaveTextContent(/Flood, cyclone, lightning and drought are not assessed here/i)
  })

  it('renders a visible legend swatch for every screening band plus unassessed', () => {
    // The markup says `legend-dot low`; a rule keyed to `legend-dot.risk-low` leaves
    // every dot transparent, which is what shipped. Pin the exact class pairing.
    for (const level of ['low', 'moderate', 'high', 'extreme']) {
      expect(sheet).toMatch(new RegExp(`\\.legend-dot\\.${level}[\\s,{][^}]*background: var\\(--risk-`))
    }
    expect(sheet).toMatch(/\.legend-dot\.unassessed\s*\{[^}]*repeating-linear-gradient/)
  })
})

describe('4 · the 3D inspector stays inside the map card', () => {
  it('lays the inspector out in flow under the stage rather than absolutely', () => {
    const rule = sheet.match(/\.risk-scene-inspector\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('display: flex')
    // Absolutely positioning it against the card is what pushed it over the banner.
    expect(rule).not.toContain('position: absolute')
    expect(rule).toMatch(/border-top:/)
    // And it stacks on compact widths instead of overflowing sideways. The rule
    // lives in the 680px block, which covers every phone width; assert inside that
    // block so a rule elsewhere in the sheet cannot satisfy the check.
    const compact = sheet.match(/@media \(max-width: 680px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(compact).toContain('.risk-scene-inspector')
    expect(compact).toMatch(/\.risk-scene-inspector\s*\{[^}]*flex-direction: column/)
    expect(compact).toMatch(/\.risk-scene-inspector-time\s*\{[^}]*text-align: left/)
  })
})

describe('5 · the Forecast announces the peak once', () => {
  it('states the peak once and keeps the day chip as a locator, not a figure', async () => {
    renderApp('/forecast')
    await screen.findByRole('heading', { level: 1, name: /forecast/i })
    const banners = screen.getAllByText(/Hottest forecast day:/i)
    expect(banners).toHaveLength(1)
    // The chip marks which of five rows holds the peak; it carries no temperature
    // and does not restate the banner. The redundant "Warmest day" stat is gone.
    expect(document.querySelectorAll('.hottest-label')).toHaveLength(1)
    expect(document.querySelector('.hottest-label')?.textContent).toBe('Hottest')
    expect(document.querySelectorAll('.forecast-day')).toHaveLength(5)
    expect(document.querySelectorAll('.forecast-day.hottest')).toHaveLength(1)
    expect(document.querySelector('.forecast-notable-list')).not.toHaveTextContent(/Warmest day/)
  })
})

describe('6 · loading never looks like a result', () => {
  it('shows blank reading cards and unassessed suggestions while data loads', async () => {
    let resolveWeather!: (value: Awaited<ReturnType<typeof weatherResult>>) => void
    weatherMock.mockReturnValueOnce(new Promise((resolve) => { resolveWeather = resolve }))
    renderApp('/')
    expect(screen.getByRole('status')).toHaveTextContent(/Loading weather for Mumbai/i)
    expect(document.querySelectorAll('.key-readings-grid .weather-card')).toHaveLength(5)
    for (const card of Array.from(document.querySelectorAll('.key-readings-grid .weather-card')).slice(0, 4)) {
      expect(card.querySelector('.uploaded-tile-value')).toHaveTextContent('—')
    }
    const tasks = screen.getByRole('list', { name: /Suggested preparedness tasks for Mumbai/i })
    expect(within(tasks).getAllByText('Unassessed')).toHaveLength(3)
    resolveWeather(weatherResult())
    await screen.findByRole('heading', { name: 'Temperature' })
    expect(within(screen.getByRole('list', { name: /Suggested preparedness tasks for Mumbai/i })).queryByText('Unassessed')).not.toBeInTheDocument()
  })

  it('does not open a second live region beside the weather announcement', async () => {
    weatherMock.mockReturnValueOnce(new Promise(() => {}))
    renderApp('/')
    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toHaveTextContent(/Loading weather for Mumbai/i)
  })

  it('says it is awaiting readings in the map inspector rather than reporting none', () => {
    const scene = readFileSync('src/components/IndiaRiskScene3D.tsx', 'utf8')
    // A literal "No live reading" during a fetch reads as a failed result.
    expect(scene).toContain("activeMapStatus === 'loading'")
  })
})
