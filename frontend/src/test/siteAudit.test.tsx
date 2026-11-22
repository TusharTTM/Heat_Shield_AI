import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getWeather } from '../api/openMeteo'
import { airQualityResult, weatherResult } from './weatherFixtures'

/**
 * Findings from a rendered-DOM audit of every route (webapp-testing method:
 * reconnaissance first, then assert). Each test below fails on the defect it
 * describes rather than on incidental markup.
 *
 * Not covered here, and deliberately so: Chart.js logs
 * "can't acquire context from the given item" under jsdom because jsdom has no
 * canvas. CI runs the same views in real Chromium via Playwright, so that
 * message is an artefact of the test environment, not a site bug.
 */

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getAirQuality: vi.fn() }
})

function renderApp(route = '/') {
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
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

describe('route audit', () => {
  it('explains a retired URL instead of silently swapping the page', async () => {
    renderApp('/alerts')
    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeInTheDocument()
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('This page has moved.')
    // The path is named, so a shared link's recipient knows what happened.
    expect(notice).toHaveTextContent('/alerts')
  })

  it('does not show the retired-URL notice on a live route', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })
    expect(screen.queryByText('This page has moved.')).not.toBeInTheDocument()
  })

  it('lets the reader dismiss the retired-URL notice', async () => {
    const user = userEvent.setup()
    renderApp('/safety')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })
    await user.click(screen.getByRole('button', { name: 'Dismiss this notice' }))
    expect(screen.queryByText('This page has moved.')).not.toBeInTheDocument()
  })

  it('translates the retired-URL notice', async () => {
    localStorage.setItem('hs-settings-v1', JSON.stringify({ display: { language: 'hi' } }))
    renderApp('/forecast')
    expect(await screen.findByText('यह पृष्ठ स्थानांतरित हो गया है।')).toBeInTheDocument()
    expect(screen.getByText(/\/forecast/)).toBeInTheDocument()
  })
})

describe('official warnings are readable, not just counted', () => {
  it('renders the official warning panel on the dashboard', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })
    // The panel is the only place CAP matches are described, so it must exist
    // even when the feed is unconfigured (where it says so explicitly).
    expect(screen.getByText('Official government warnings')).toBeInTheDocument()
    expect(screen.getByText('Official warnings are not being retrieved right now')).toBeInTheDocument()
  })

  it('offers no official-warnings shortcut when the feed is unconfigured', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })
    // The Reports tile is gone; official warnings now surface as a shortcut only
    // when the feed is ready, because otherwise there is nothing to jump to.
    const shortcuts = document.querySelector('.dashboard-shortcuts')
    expect(shortcuts).not.toBeNull()
    expect(within(shortcuts as HTMLElement).queryByText('Official warnings')).toBeNull()
    // And no link anywhere in the app may point at the retired /alerts route.
    const retiredLinks = [...document.querySelectorAll('a[href]')].filter((a) =>
      ['/alerts', '/safety', '/forecast', '/about', '/disaster-monitor'].includes(a.getAttribute('href') ?? ''),
    )
    expect(retiredLinks).toHaveLength(0)
  })
})

describe('every route keeps its accessibility contract', () => {
  const ROUTES = ['/', '/assistant', '/menu', '/profile', '/metric/temperature', '/metric/heat-index', '/metric/air-quality', '/metric/humidity', '/metric/uv-index', '/metric/heat-risk']

  it.each(ROUTES)('%s has one named h1, named controls, and a document title', async (route) => {
    renderApp(route)
    const h1s = await screen.findAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent?.trim()).not.toBe('')
    expect(document.title).toMatch(/· Heat Shield AI$/)

    const controls = [...document.querySelectorAll('button, a[href]')]
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.textContent?.trim()
      expect(name, `unnamed control on ${route}: ${control.outerHTML.slice(0, 120)}`).toBeTruthy()
    }

    const fields = [...document.querySelectorAll('input, select, textarea')]
    for (const field of fields) {
      const id = field.getAttribute('id')
      const named =
        (id ? document.querySelector(`label[for="${id}"]`) : null) ??
        field.getAttribute('aria-label') ??
        field.getAttribute('aria-labelledby') ??
        field.closest('label')
      expect(named, `unlabelled field on ${route}: ${field.outerHTML.slice(0, 120)}`).toBeTruthy()
    }

    expect(document.querySelectorAll('main')).toHaveLength(1)
  })
})

describe('every retired section is explained, not just the ones I remembered', () => {
  // Mirrors the redirect list in app.test.tsx so the two cannot drift: if a
  // path starts redirecting, it must also say so.
  const RETIRED = ['/monitor', '/forecast', '/maps', '/alerts', '/safety', '/about', '/disaster-monitor']

  it.each(RETIRED)('%s redirects to the dashboard and says so', async (route) => {
    renderApp(route)
    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(route)
  })
})
