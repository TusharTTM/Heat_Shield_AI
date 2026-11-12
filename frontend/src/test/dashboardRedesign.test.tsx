import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'
import {
  buildDashboardSuggestions,
  computePreparednessProgress,
  selectPrimaryRiskSummary,
} from '../data/dashboardTasks'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})

const weatherMock = vi.mocked(getWeather)
const currentMock = vi.mocked(getCurrentWeather)
const airMock = vi.mocked(getAirQuality)

function createMockCanvas2DContext(): CanvasRenderingContext2D {
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return {
    save: noop,
    restore: noop,
    scale: noop,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    ellipse: noop,
    arc: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    measureText: (text: string) => ({ width: text.length * 6.5 } as TextMetrics),
    createRadialGradient: () => gradient as unknown as CanvasGradient,
    createLinearGradient: () => gradient as unknown as CanvasGradient,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D
}

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
  currentMock.mockReset().mockImplementation(async (region) => currentResult(region.slug))
  airMock.mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Action-focused Dashboard redesign', () => {
  it('1. shows primary risk, driving hazard, plain-language reason, updated time, and Official vs HeatShield screening split', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    const hero = document.querySelector('.dashboard-warning-hero') as HTMLElement
    expect(hero).toBeInTheDocument()
    expect(within(hero).getByText(/Mumbai, Maharashtra/)).toBeInTheDocument()
    expect(within(hero).getByText(/Primary hazard: Heat stress/)).toBeInTheDocument()
    // One vocabulary: the hero states the screening band, not the alert word.
    expect(within(hero).getByRole('heading', { name: 'High' })).toBeInTheDocument()
    expect(within(hero).getByText(/34.8°C model air temperature with 62% humidity creates a 45.4°C shade heat index/i)).toBeInTheDocument()
    expect(within(hero).getByText(/Updated/i)).toBeInTheDocument()

    const split = screen.getByLabelText('Official warnings versus model screening')
    expect(within(split).getByText('Official government warnings: Not connected')).toBeInTheDocument()
    expect(within(split).getByText('HeatShield model screening')).toBeInTheDocument()
    const coverageDetails = within(split).getByText('Coverage & source details').closest('details')!
    expect(coverageDetails).not.toHaveAttribute('open')
    await user.click(within(coverageDetails).getByText('Coverage & source details'))
    expect(within(coverageDetails).getByText(/Official government feed not connected on static site/i)).toBeInTheDocument()
    expect(within(coverageDetails).getByText(/check NDMA SACHET directly/i)).toBeInTheDocument()
    const screeningDetails = within(split).getByText('How screening works').closest('details')!
    expect(screeningDetails).not.toHaveAttribute('open')

    // The bare band word must be attributed to HeatShield's own screening scale
    expect(within(hero).getByText('HeatShield screening')).toBeInTheDocument()
    const scale = document.querySelector('details.warning-scale-explainer') as HTMLDetailsElement
    expect(scale).not.toBeNull()
    expect(scale).not.toHaveAttribute('open')
  })

  it('explains the four screening band words on demand and denies they are official warnings', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    await user.click(screen.getByText(/How Low \/ Moderate \/ High \/ Extreme are decided/i))
    const decoder = screen.getByLabelText('Four-level screening scale decoder')
    // The `strong` is the band name; the badge beside it also carries the word.
    const bands = Array.from(decoder.querySelectorAll('.decoder-scale-item > strong')).map((el) => el.textContent)
    expect(bands).toEqual(['Low', 'Moderate', 'High', 'Extreme'])
    // Each band names the ranges on all three published scales, and the original
    // category words for the AQI scales travel with them.
    expect(within(decoder).getByText(/Heat index below 27 °C/)).toBeInTheDocument()
    expect(within(decoder).getByText(/Heat index 52 °C and above/)).toBeInTheDocument()
    expect(within(decoder).getByText(/Very Unhealthy/)).toBeInTheDocument()
    // The denial is split by a <strong>, so match on the element's full text content
    expect(
      screen.getByText((_content, element) =>
        element?.tagName === 'P'
        && /not official disaster warnings, CAP severity levels, or prediction probabilities/i.test(element.textContent ?? '')),
    ).toBeInTheDocument()
  })

  it('never implies conditions are safe when environmental feeds are missing or partially unavailable', () => {
    const bothMissing = selectPrimaryRiskSummary({
      weather: null,
      air: null,
      weatherStatus: 'error',
      airStatus: 'error',
      officialAlerts: { status: 'unconfigured', data: null, error: null, refresh: () => {} },
    })
    expect(bothMissing.level).toBeNull()
    expect(bothMissing.bannerLabel).toBe('Unavailable')
    expect(bothMissing.shortReason).toMatch(/Unassessed conditions are never marked Safe/i)

    const heatMissingLowAir = selectPrimaryRiskSummary({
      weather: null,
      air: {
        ...airQualityResult('mumbai').data,
        usAqi: 32,
        europeanAqi: 18,
      },
      weatherStatus: 'error',
      airStatus: 'ready',
      officialAlerts: { status: 'unconfigured', data: null, error: null, refresh: () => {} },
    })
    expect(heatMissingLowAir.bannerLabel).toBe('Status incomplete')
    expect(heatMissingLowAir.shortReason).not.toMatch(/No urgent risk/i)
    expect(heatMissingLowAir.missingNotice).toMatch(/not assumed Safe/i)

    // Supporting tasks must not wear a "Low" badge when their input was unavailable
    const unassessedTasks = buildDashboardSuggestions(null, null)
    expect(unassessedTasks).toHaveLength(3)
    expect(unassessedTasks.every((task) => task.level === null)).toBe(true)
  })

  it('renders unassessed checklist tasks with an explicit Unassessed badge instead of a Low risk badge', async () => {
    weatherMock.mockRejectedValue(new Error('Weather model offline'))
    airMock.mockRejectedValue(new Error('CAMS model offline'))
    renderDashboard()
    await screen.findByRole('alert')

    const taskList = screen.getByRole('list', { name: 'Suggested preparedness tasks for Mumbai' })
    expect(within(taskList).getAllByText('Unassessed')).toHaveLength(3)
    expect(within(taskList).queryByText('Low')).not.toBeInTheDocument()
  })

  it('2. renders the 3D stylized India view when Canvas 2D is available, supports keyboard & button camera controls, switches layers, and selects cities via text access', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) => (contextId === '2d' ? createMockCanvas2DContext() : null)) as typeof HTMLCanvasElement.prototype.getContext,
    )

    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    const stage = screen.getByRole('region', {
      name: /Interactive 3D stylized India heat-risk stage/i,
    })
    expect(stage.querySelector('canvas.risk-scene-canvas')).toBeInTheDocument()
    expect(screen.getByText(/Heat layer: taller columns mean greater heat stress/i)).toBeInTheDocument()
    const viewDetails = screen.getByText('What this 3D view shows').closest('details')!
    expect(viewDetails).not.toHaveAttribute('open')
    await user.click(within(viewDetails).getByText('What this 3D view shows'))
    expect(within(viewDetails).getByText(/not terrain elevation or street-level sensor readings/i)).toBeInTheDocument()

    // Essentials stay on the toolbar; rotate/tilt live behind the labelled camera menu.
    await user.click(screen.getByRole('button', { name: 'Zoom 3D view in' }))
    await user.click(screen.getByRole('button', { name: 'Reset 3D camera' }))
    const cameraMenu = screen.getByText('Camera angle').closest('details') as HTMLDetailsElement
    expect(cameraMenu.open).toBe(false)
    await user.click(screen.getByText('Camera angle'))
    expect(cameraMenu.open).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Rotate 3D view left' }))

    stage.focus()
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    fireEvent.keyDown(stage, { key: '+' })
    fireEvent.keyDown(stage, { key: '0' })

    // Switch to Air pollution layer
    await user.click(within(screen.getByRole('group', { name: '3D risk view layer' })).getByRole('button', { name: /Air pollution/i }))
    expect(screen.getByRole('heading', { name: '3D modelled air-pollution view' })).toBeInTheDocument()
    // The stage names the value that decides the column colour instead of repeating the
    // dashboard's four key readings (which already carry US/European AQI and PM values).
    const inspector = screen.getByLabelText('Selected 3D location readings for Mumbai')
    expect(within(inspector).getByText('US AQI 125')).toBeInTheDocument()
    expect(within(inspector).queryByText('Temperature')).not.toBeInTheDocument()
    expect(within(inspector).queryByText('European AQI')).not.toBeInTheDocument()

    // Manual 2D fallback switch and back to 3D
    await user.click(screen.getByRole('button', { name: '2D fallback view' }))
    expect(screen.getByRole('region', { name: /2D stylized India air-pollution fallback view/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch to 3D view' }))
    expect(screen.getByRole('region', { name: /Interactive 3D stylized India air-pollution stage/i })).toBeInTheDocument()

    // Accessible text-based 15-city selector updates active city across Dashboard
    await user.click(screen.getByText(/Select or compare all 15 locations as accessible text/i))
    const cityGroup = screen.getByRole('group', { name: 'Select a configured Indian location' })
    expect(within(cityGroup).getAllByRole('button')).toHaveLength(15)
    await user.click(within(cityGroup).getByRole('button', { name: /Chennai/i }))
    expect(await screen.findByRole('heading', { name: 'Environmental dashboard for Chennai' })).toBeInTheDocument()
  })

  it('automatically provides the 2D SVG fallback when 3D canvas rendering is unavailable or slow, and respects reduced motion', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    // Default jsdom has no Canvas 2D implementation -> automatic 2D fallback
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    expect(screen.getByRole('region', { name: /2D stylized India heat-risk fallback view/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Static stylized India outline with 15 selectable city markers/i })).toBeInTheDocument()
    expect(document.querySelector('.progress-ring-fill')).toHaveClass('no-transition')

    // Each 2D SVG city marker is a real, keyboard-reachable button
    const markers = Array.from(document.querySelectorAll('.fallback-city-marker'))
    expect(markers).toHaveLength(15)
    const delhiMarker = screen.getByRole('button', { name: /Select Delhi, Delhi:/i })
    delhiMarker.focus()
    expect(delhiMarker).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Environmental dashboard for Delhi' })).toBeInTheDocument(),
    )
  })

  it('3, 4 & 5. generates up to 3 condition/prevention suggestions, tracks checklist completion per city, warns risk has not gone away, and unlocks rule-visible badges', async () => {
    // Verify low-risk prevention steps helper
    const lowHeat = { ...weatherResult('bengaluru').data, temperature: 24, humidity: 50, heatIndex: 24, risk: 'low' as const }
    const lowAir = { ...airQualityResult('bengaluru').data, usAqi: 28, europeanAqi: 16 }
    const preventionTasks = buildDashboardSuggestions(lowHeat, lowAir)
    expect(preventionTasks).toHaveLength(3)
    expect(preventionTasks[0].badgeLabel).toMatch(/Prevention/i)

    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    const taskList = screen.getByRole('list', { name: 'Suggested preparedness tasks for Mumbai' })
    const checkboxes = within(taskList).getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)

    // Explicit reminder that completing tasks does NOT remove outdoor risk
    expect(
      screen.getByText(/completing a task does not mean the weather or air-quality risk has gone away/i),
    ).toBeInTheDocument()
    // Initial progress shows the next badge; the full collection and rules stay available on demand.
    expect(screen.getByRole('img', { name: /0 of 3 tasks completed \(0 percent\)/i })).toBeInTheDocument()
    const badgesList = screen.getByRole('list', { name: 'Preparedness badges' })
    expect(within(badgesList).getByText(/Next badge: First Step/i)).toBeInTheDocument()
    const badgeRules = screen.getByText(/Badge collection & rules \(3\)/i).closest('details')!
    expect(badgeRules).not.toHaveAttribute('open')
    await user.click(within(badgeRules).getByText(/Badge collection & rules/i))
    expect(within(badgeRules).getByText(/Complete 1 suggested precaution today/i)).toBeInTheDocument()
    expect(within(badgeRules).getByText(/Complete 2\+ precautions across today’s plan/i)).toBeInTheDocument()
    expect(within(badgeRules).getByText(/Complete all 3 suggested precautions today/i)).toBeInTheDocument()
    expect(within(badgeRules).getByText(/There are no points or streaks/i)).toBeInTheDocument()

    // Check 1st task -> First Step earned
    await user.click(checkboxes[0])
    expect(screen.getByRole('img', { name: /1 of 3 tasks completed \(33 percent\)/i })).toBeInTheDocument()
    expect(within(badgesList).getAllByText('Earned today')).toHaveLength(1)
    expect(within(badgesList).getByText(/Next badge: Dual-Check Ready/i)).toBeInTheDocument()

    // Check 2nd & 3rd tasks -> All 3 badges earned (100%)
    await user.click(checkboxes[1])
    await user.click(checkboxes[2])
    expect(screen.getByRole('img', { name: /3 of 3 tasks completed \(100 percent\)/i })).toBeInTheDocument()
    expect(within(badgesList).getAllByText('Earned today')).toHaveLength(3)

    // Reset button clears today's checklist cleanly
    await user.click(screen.getByRole('button', { name: /Reset today’s checklist for Mumbai/i }))
    expect(screen.getByRole('img', { name: /0 of 3 tasks completed \(0 percent\)/i })).toBeInTheDocument()

    // Direct unit check on progress helper ignores stale task IDs
    const computed = computePreparednessProgress(preventionTasks, ['non-existent-id', preventionTasks[0].id])
    expect(computed.completedCount).toBe(1)
    expect(computed.percent).toBe(33)
  })
})
