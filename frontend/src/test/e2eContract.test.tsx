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
 * The Playwright specs in `e2e/` only run in CI, on Chromium, against a real
 * browser. When the UI they select on changes they fail there — after the fact,
 * and only in a job nobody can read the log of from here. Two of them had been
 * red on every push since 2026-11-12 for exactly that reason: they still asked
 * for a "Menu" link and Pinned/Recents headings that the assistant drawer
 * redesign had removed.
 *
 * These mirror the same walks selector for selector. They cannot prove layout,
 * but they do prove every locator resolves, which is the failure mode that
 * actually bit. Keep them in step with `e2e/*.spec.ts`.
 */

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getAirQuality: vi.fn() }
})

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
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

describe('e2e/official-sources.spec.ts selectors', () => {
  it('resolves the dashboard tiles, assistant, drawer, and full menu', async () => {
    const user = userEvent.setup()
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeInTheDocument()
    expect(document.querySelectorAll('.key-readings-grid .weather-card')).toHaveLength(5)
    expect(document.querySelectorAll('.key-readings-grid .uploaded-action-tile')).toHaveLength(0)
    expect(document.querySelectorAll('.dashboard-shortcuts a')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /AI Assistant/ }))
    expect(await screen.findByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()

    // Menu is a drawer on this screen, opened by a button — not a route link.
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const drawer = screen.getByRole('complementary', { name: 'Menu' })
    expect(within(drawer).getByRole('heading', { name: 'Chat history' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'New Chat' })).toBeInTheDocument()

    await user.click(within(drawer).getByRole('link', { name: 'Open full menu' }))
    // Level 1 matters: while the lazy Menu route loads, the drawer's own h2
    // "Menu" is still mounted and would satisfy a bare heading query.
    expect(await screen.findByRole('heading', { level: 1, name: 'Menu' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Menu' })).toBeNull()
    expect(screen.getByRole('link', { name: 'New Chat' })).toBeInTheDocument()
  }, 30000)
})

describe('dashboard masthead', () => {
  /**
   * The dashboard has no Menu entry: the menu page is reached from the
   * assistant drawer. This is an explicit product decision, so it is asserted
   * rather than left implicit — and the reachability half is checked too, so a
   * future tidy-up cannot strand /menu with no way in.
   */
  it('offers Notify and Profile but no Menu, and /menu stays reachable', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })

    expect(screen.queryByRole('link', { name: 'Menu' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Notify' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /AI Assistant/ }))
    await screen.findByRole('heading', { name: 'Heat Shield AI' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const drawer = screen.getByRole('complementary', { name: 'Menu' })
    await user.click(within(drawer).getByRole('link', { name: 'Open full menu' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Menu' })).toBeInTheDocument()
  }, 30000)
})

describe('e2e/live-weather.spec.ts selectors', () => {
  it('resolves the assistant drawer and its New Chat control', async () => {
    const user = userEvent.setup()
    renderApp('/assistant')

    expect(await screen.findByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ask Heat Shield' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const drawer = screen.getByRole('complementary', { name: 'Menu' })
    expect(within(drawer).getByRole('heading', { name: 'Chat history' })).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'New Chat' }))
    expect(await screen.findByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
  }, 30000)
})
