import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'
import { GLOSSARY_TERMS } from '../components/Comprehension'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})
vi.mock('react-chartjs-2', () => ({
  Line: (props: { role?: string; 'aria-label'?: string }) => (
    <div role={props.role} aria-label={props['aria-label']} data-testid="mocked-line-chart" />
  ),
}))
vi.mock('../components/RegionMap', () => ({
  RegionMap: ({ locations, airLocations = [], layer = 'heat' }: { locations: unknown[]; airLocations?: unknown[]; layer?: string }) => (
    <div data-testid="offline-map" data-layer={layer}>{layer === 'heat' ? locations.length : airLocations.length} markers</div>
  ),
}))

function renderRoute(route = '/') {
  return render(
    <AppProvider>
      <WeatherProvider>
        <MemoryRouter initialEntries={[route]}>
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
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getCurrentWeather).mockReset().mockImplementation(async (region) => currentResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

describe('Comprehension, progressive disclosure, keyboard accessibility, and zero-loss content parity', () => {
  it('supports keyboard-accessible TermHelp popovers with Escape focus restoration and outside dismissal', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })

    const sources = screen.getByText('Sources & limits').closest('details')!
    await user.click(within(sources).getByText('Sources & limits'))
    const trigger = screen.getByRole('button', { name: 'Explain term: CAMS air-quality model' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    trigger.focus()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const popover = screen.getByRole('region', { name: 'CAMS air-quality model definition' })
    expect(within(popover).getByText(/In plain language:/i)).toBeInTheDocument()
    expect(within(popover).getByText(/Technical detail:/i)).toBeInTheDocument()
    expect(within(popover).getByText(/Copernicus Atmosphere Monitoring Service/i)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'CAMS air-quality model definition' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    expect(screen.getByRole('region', { name: 'CAMS air-quality model definition' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('region', { name: 'CAMS air-quality model definition' })).getByRole('button', { name: /Close CAMS air-quality model explanation/i }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('keeps the default Dashboard focused on warning, 3D view, actions, and 4 key readings while disclosing secondary details on demand', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })

    expect(screen.getByLabelText('Official warnings versus model screening')).toBeInTheDocument()
    expect(document.querySelectorAll('.key-readings-grid .weather-card')).toHaveLength(4)
    const secondaryDrawer = document.querySelector('details.secondary-details-drawer')
    expect(secondaryDrawer).not.toHaveAttribute('open')

    await user.click(screen.getByText(/More measurements, daytime hours, official feed status & source details/i))
    expect(secondaryDrawer).toHaveAttribute('open')
    expect(document.querySelectorAll('.hour-item')).toHaveLength(6)
    expect(screen.getByRole('heading', { name: 'Wind speed' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rainfall' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Supporting detail pages' })).toBeInTheDocument()
  })

  it('adds plain-language pollutant descriptions and dynamic chart explanations on Disaster Monitor without losing coverage limits', async () => {
    const user = userEvent.setup()
    renderRoute('/monitor')
    expect(await screen.findByRole('heading', { name: 'Heatwave & extreme heat indicators' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Air pollution' })).toBeInTheDocument()

    expect(screen.getByText(/Fine inhalable smoke & exhaust particles/i)).toBeInTheDocument()
    expect(screen.getByText(/Ground-level smog gas formed when sunlight reacts with fumes/i)).toBeInTheDocument()
    expect(screen.getAllByText(/What to do now:/i).length).toBeGreaterThanOrEqual(2)

    const metricSelect = screen.getByLabelText(/Hourly forecast metric/i)
    expect(screen.getByText(/0–500 index scale/i)).toBeInTheDocument()
    await user.selectOptions(metricSelect, 'pm2_5')
    expect(screen.getByText(/Lower µg\/m³ means cleaner air/i)).toBeInTheDocument()
    await user.selectOptions(metricSelect, 'ozone')
    expect(screen.getByText(/often peaking in the afternoon/i)).toBeInTheDocument()

    expect(screen.getByText('Heavy rainfall & flooding')).toBeInTheDocument()
    expect(screen.getByText('Cyclones & severe storms')).toBeInTheDocument()
    expect(screen.getByText('Thunderstorms & lightning')).toBeInTheDocument()
    expect(screen.getByText('Drought')).toBeInTheDocument()
    expect(screen.getByText(/Direct IMD district-warning and CWC river-gauge feeds are not connected/i)).toBeInTheDocument()
  })

  it('leads Forecast with notable days and keeps the full per-day stats table and metric explanations in drawers', async () => {
    const user = userEvent.setup()
    renderRoute('/forecast')
    expect(await screen.findByLabelText('Notable forecast days')).toBeInTheDocument()
    const notable = screen.getByLabelText('Notable forecast days')
    // The peak temperature is announced once, in the banner above; this row keeps
    // the part the banner does not state — the heat-index stress behind it.
    expect(within(notable).getByText('Peak heat stress')).toBeInTheDocument()
    expect(within(notable).getByText('Best night recovery')).toBeInTheDocument()
    expect(within(notable).getByText(/Rain to plan around|Rain outlook/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.forecast-day')).toHaveLength(5)

    // Exactly one model-timestamp note per page: the drawer must not duplicate the chart card's source note.
    expect(document.querySelectorAll('.source-note')).toHaveLength(1)

    // Per-day rain/heat-index/UV stats are behind one labelled table drawer, not in the default view
    const detailDrawer = screen.getByText(/Day-by-day rain, heat index & UV detail/i).closest('details')
    expect(detailDrawer).not.toHaveAttribute('open')
    expect(document.querySelector('.forecast-detail-table')).toBeTruthy()
    expect(document.querySelectorAll('.forecast-detail-table tbody tr')).toHaveLength(5)

    await user.click(screen.getByText(/How to read each daily card/i))
    expect(screen.getByText(/Illustrative example · not live data/i)).toBeInTheDocument()
  })

  it('keeps every secondary page drawn from a single, labelled, closed-by-default disclosure', async () => {
    const user = userEvent.setup()

    // Risk Map: the full 15-city picker sits behind an easy-to-find control in the location panel
    renderRoute('/maps')
    await screen.findByText('15 markers')
    const cityDrawer = document.querySelector('.map-city-drawer') as HTMLDetailsElement
    expect(cityDrawer).toBeTruthy()
    expect(cityDrawer.open).toBe(false)
    expect(within(cityDrawer).getAllByRole('button', { name: /^Select /i })).toHaveLength(15)
    await user.click(cityDrawer.querySelector('summary')!)
    expect(cityDrawer.open).toBe(true)
    cleanup()

    // Safety: emergency steps lead the page; every scale table and agency list is under References
    renderRoute('/safety')
    await screen.findByRole('heading', { name: /Call for help/i })
    const references = document.querySelector('.safety-references-drawer') as HTMLDetailsElement
    expect(references.open).toBe(false)
    expect(references.textContent).toMatch(/Heat-index screening levels/i)
    expect(references.textContent).toMatch(/Current official information/i)
    // Detailed scales are not scattered into the default view
    expect(document.querySelector('#safety-scales .risk-threshold')).toBeTruthy()
    expect(document.querySelector('#safety-scales')!.firstElementChild).toBe(references)
    cleanup()

    // Alerts: expiry + delivery explanation out of the default view
    renderRoute('/alerts')
    await screen.findByRole('heading', { name: 'Generated assessment notices' })
    expect((document.querySelector('.alerts-delivery-drawer') as HTMLDetailsElement).open).toBe(false)
    expect((document.querySelector('.alerts-how-drawer') as HTMLDetailsElement).open).toBe(false)
    cleanup()

    // About: long technical sections and the glossary fold away, sources stay visible
    renderRoute('/about')
    await screen.findByRole('heading', { name: 'Which sources are active right now' })
    expect((document.querySelector('.about-story-drawer') as HTMLDetailsElement).open).toBe(false)
    expect((document.querySelector('.glossary-drawer') as HTMLDetailsElement).open).toBe(false)
    expect(screen.getByText('CAMS model · not CPCB')).toBeVisible()
    cleanup()

    // Disaster Monitor: coverage limits expandable, official warnings stay up front
    renderRoute('/monitor')
    await screen.findByRole('heading', { name: 'Official warning channel' })
    expect((document.querySelector('.monitor-coverage-drawer') as HTMLDetailsElement).open).toBe(false)
    expect((document.querySelector('.monitor-about-drawer') as HTMLDetailsElement).open).toBe(false)
  })

  it('provides an accessible 15-city comparison table on Risk Map that switches layers and updates the active city', async () => {
    const user = userEvent.setup()
    renderRoute('/maps')
    expect(await screen.findByText('15 markers')).toBeInTheDocument()

    const table = document.querySelector('.map-comparison-table') as HTMLTableElement
    expect(table).toBeTruthy()
    expect(within(table).getAllByRole('row')).toHaveLength(16) // 1 header + 15 cities

    await user.click(within(table).getByRole('button', { name: 'Inspect Pune from table' }))
    expect(within(screen.getByRole('complementary', { name: 'Selected location' })).getByRole('heading', { name: 'Pune' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Air pollution' }))
    expect(within(table).getByRole('columnheader', { name: 'US AQI' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'European AQI' })).toBeInTheDocument()
  })

  it('keeps Official vs Generated tracks visible on Alerts and puts expiry/deduplication detail in a labelled drawer', async () => {
    const user = userEvent.setup()
    renderRoute('/alerts')
    expect(await screen.findByLabelText('How the two alert sections differ')).toBeInTheDocument()
    expect(screen.getByText(/Track 1 · Official disaster alerts/i)).toBeInTheDocument()
    expect(screen.getByText(/Track 2 · Generated screening notices/i)).toBeInTheDocument()

    // Expiry + deduplication explanations live behind one labelled, collapsed disclosure
    const expiryDrawer = screen.getByText(/How notice validity, expiry, and anti-spam deduplication work/i).closest('details')
    expect(expiryDrawer).not.toHaveAttribute('open')
    await user.click(screen.getByText(/How notice validity, expiry, and anti-spam deduplication work/i))
    expect(expiryDrawer).toHaveAttribute('open')
    expect(screen.getByText(/valid for 60 minutes from the moment its model data was retrieved/i)).toBeInTheDocument()
    expect(screen.getByText(/no server-side alert log, delivery receipt, or incident history/i)).toBeInTheDocument()
  })

  it('supports Expand/Collapse all 5 hazard guides on Safety Guide while keeping every scale table, tip, and 112 action', async () => {
    const user = userEvent.setup()
    renderRoute('/safety')
    expect(await screen.findByRole('heading', { name: 'Guidance for Mumbai' })).toBeInTheDocument()

    const toggleButton = screen.getByRole('button', { name: 'Expand all 5 guides' })
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggleButton)

    const collapseButton = screen.getByRole('button', { name: 'Collapse all 5 guides' })
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
    const guides = document.querySelectorAll('details.hazard-safety-guide')
    expect(guides).toHaveLength(5)
    guides.forEach((guide) => expect(guide).toHaveAttribute('open'))

    await user.click(collapseButton)
    guides.forEach((guide) => expect(guide).not.toHaveAttribute('open'))

    expect(document.querySelectorAll('[aria-labelledby="risk-level-guide-title"] .risk-threshold')).toHaveLength(4)
    expect(document.querySelectorAll('[aria-labelledby="aqi-guide-title"] .risk-threshold')).toHaveLength(6)
    expect(document.querySelectorAll('[aria-labelledby="european-aqi-guide-title"] .risk-threshold')).toHaveLength(6)
    expect(screen.getByRole('link', { name: 'Call 112 in India' })).toHaveAttribute('href', 'tel:112')
  })

  it('preserves all five About sections verbatim alongside plain-language takeaways and an interactive glossary', async () => {
    const user = userEvent.setup()
    renderRoute('/about')

    // Verify all 5 original headings and key technical claims are preserved
    expect(screen.getByRole('heading', { name: 'What works today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What the risk labels mean' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Model estimates are not official observations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Responsible prediction limits' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Data and attribution' })).toBeInTheDocument()
    expect(screen.getByText(/Earthquakes cannot be predicted reliably by this platform/i)).toBeInTheDocument()
    expect(screen.getByText(/no trained production model is used by this public interface/i)).toBeInTheDocument()

    // Verify interactive glossary expand/collapse across all defined terms
    const glossaryToggle = screen.getByRole('button', { name: 'Expand all terms' })
    expect(glossaryToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(glossaryToggle)
    expect(screen.getByRole('button', { name: 'Collapse all terms' })).toHaveAttribute('aria-expanded', 'true')
    const items = document.querySelectorAll('details.glossary-item')
    expect(items).toHaveLength(Object.keys(GLOSSARY_TERMS).length)
    items.forEach((item) => expect(item).toHaveAttribute('open'))
  })
})
