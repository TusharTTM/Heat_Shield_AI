import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})
vi.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="mock-chart" /> }))
vi.mock('../components/RegionMap', () => ({ RegionMap: () => <div data-testid="mock-map" /> }))

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

describe('Compact source status with expandable explanation', () => {
  it('keeps freshness/time visible while folding the provenance sentence into a disclosure', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })

    const notes = document.querySelectorAll('.source-note')
    expect(notes.length).toBeGreaterThan(0)
    notes.forEach((note) => {
      // Freshness and timestamps must never be hidden behind the disclosure.
      const compact = note.querySelector('.source-note-compact')
      expect(compact).toBeTruthy()
      expect(compact?.textContent).toMatch(/Model time:/)
      expect(compact?.textContent).toMatch(/Last updated:/)
      expect(compact?.querySelectorAll('time')).toHaveLength(2)
      const detail = note.querySelector('.source-note-detail') as HTMLDetailsElement
      expect(detail.open).toBe(false)
    })

    const drawer = document.querySelector('.source-note-detail') as HTMLDetailsElement
    await user.click(drawer.querySelector('summary')!)
    expect(drawer.open).toBe(true)
    expect(drawer.textContent).toMatch(/Open-Meteo/)
  })

  it('keeps both source-note explanations complete behind the compact strip', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })

    for (const note of Array.from(document.querySelectorAll('.source-note'))) {
      const detail = note.querySelector('.source-note-detail') as HTMLDetailsElement
      await user.click(detail.querySelector('summary')!)
      const text = detail.textContent ?? ''
      // Both model types must deny sensors, ML and station observations explicitly.
      expect(text).toMatch(/model estimates?|modelled/i)
      expect(text).toMatch(/physical IoT sensor readings/i)
      expect(text).toMatch(/ML predictions/i)
    }
    const airNote = Array.from(document.querySelectorAll('.source-note'))
      .find((note) => note.textContent?.includes('air-quality model'))!
    expect(airNote.querySelector('.source-note-detail')?.textContent).toMatch(/not CPCB station observations/i)
    expect(airNote.querySelector('.source-note-detail')?.textContent).toMatch(/Indian CPCB AQI/i)
  })

  it('keeps the safety guidance scope disclaimer reachable but out of the default reading flow', async () => {
    renderRoute('/safety')
    await screen.findByRole('heading', { name: 'Air-quality guidance for Mumbai' })
    const inline = document.querySelector('.heat-index-note .inline-detail') as HTMLDetailsElement
    expect(inline).toBeTruthy()
    expect(inline.open).toBe(false)
    expect(inline.textContent).toMatch(/not AI-generated, a physical sensor assessment, or an official warning/i)
  })
})

describe('Sitewide source status stays visible, explanation on demand', () => {
  it('keeps the one-line model status on every page and folds the long disclaimer', async () => {
    for (const route of ['/', '/monitor', '/forecast', '/maps', '/alerts', '/safety', '/about']) {
      renderRoute(route)
      await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })
      const banner = screen.getByRole('complementary', { name: 'Environmental data status' })
      // Source status text is still visible without any interaction.
      expect(banner.textContent).toMatch(/Open-Meteo weather \+ CAMS air-quality models/i)
      const detail = banner.querySelector('.demo-banner-detail') as HTMLDetailsElement
      expect(detail).toBeTruthy()
      expect(detail.open).toBe(false)
      expect(detail.textContent).toMatch(/not physical IoT|not physical sensors|model estimate/i)
      cleanup()
    }
  })
})

describe('Keyboard access for the new disclosures', () => {
  it('exposes every new disclosure through a focusable native summary', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })

    // Native <summary> elements are keyboard focusable and activate with Enter/Space in real
    // browsers; jsdom only implements click activation, so assert focusability + click here.
    const summaries = Array.from(document.querySelectorAll('summary')) as HTMLElement[]
    expect(summaries.length).toBeGreaterThan(5)
    for (const summary of summaries) {
      expect(summary.tagName).toBe('SUMMARY')
      expect(summary.closest('details')).not.toBeNull()
      summary.focus()
      expect(summary).toHaveFocus()
    }

    const banner = document.querySelector('.demo-banner-detail') as HTMLDetailsElement
    const bannerSummary = banner.querySelector('summary') as HTMLElement
    expect(bannerSummary.hasAttribute('tabindex')).toBe(false) // natively focusable, no hack needed
    await user.click(bannerSummary)
    expect(banner.open).toBe(true)
    await user.click(bannerSummary)
    expect(banner.open).toBe(false)

    const camera = document.querySelector('.scene-camera-menu') as HTMLDetailsElement
    if (camera) {
      await user.click(camera.querySelector('summary')!)
      expect(camera.open).toBe(true)
    }
  })

  it('never lets an explanation disclosure live inside a checkbox label', async () => {
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })
    // Expanding "Why this helps" must not change task completion.
    const taskList = screen.getByRole('list', { name: /Suggested preparedness tasks for Mumbai/i })
    taskList.querySelectorAll('.action-task-more').forEach((detail) => {
      expect(detail.closest('label')).toBeNull()
    })
  })
})

describe('Uploaded dashboard layout and details', () => {
  it('shows the eight uploaded dashboard tiles before the supporting detail drawer', async () => {
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })

    const grid = document.querySelector('.key-readings-grid')!
    expect(grid.querySelectorAll('.weather-card')).toHaveLength(5)
    expect(within(grid as HTMLElement).getByRole('heading', { name: 'Heat risk' })).toBeInTheDocument()
    expect(within(grid as HTMLElement).getByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(within(grid as HTMLElement).getByRole('heading', { name: 'Safety guide' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Safety suggestions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Heat mission progress' })).toBeInTheDocument()
    expect(document.querySelector('details.secondary-details-drawer')).not.toHaveAttribute('open')
  })

  it('keeps the five measured readings separate from the three navigation tiles', async () => {
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })
    const grid = document.querySelector('.key-readings-grid')!
    expect(grid.querySelectorAll('.weather-card')).toHaveLength(5)
    expect(grid.querySelectorAll('.uploaded-action-tile')).toHaveLength(3)
    expect(within(grid as HTMLElement).getByRole('heading', { name: 'Temperature' })).toBeInTheDocument()
    expect(within(grid as HTMLElement).getByRole('heading', { name: 'Heat index' })).toBeInTheDocument()
    expect(within(grid as HTMLElement).getByRole('heading', { name: 'Air quality' })).toBeInTheDocument()
  })

  it('puts per-task explanations on demand without losing them', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Temperature' })
    const taskList = screen.getByRole('list', { name: /Suggested preparedness tasks for Mumbai/i })
    const details = taskList.querySelectorAll('.action-task-more') as NodeListOf<HTMLDetailsElement>
    expect(details.length).toBeGreaterThan(0)
    details.forEach((detail) => expect(detail.open).toBe(false))
    const first = details[0]
    expect(first.querySelector('.action-task-detail')?.textContent?.length ?? 0).toBeGreaterThan(10)
    await user.click(first.querySelector('summary')!)
    expect(first.open).toBe(true)
  })
})
