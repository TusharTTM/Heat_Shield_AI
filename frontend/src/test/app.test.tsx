import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getWeather } from '../api/openMeteo'
import { airQualityResult, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getAirQuality: vi.fn() }
})

function renderApp(route = '/') {
  return render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

describe('the screens in the uploaded design', () => {
  it('renders the dashboard and uses the selected city weather', async () => {
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Heat mission progress' })).toBeInTheDocument()
    expect(document.title).toBe('Dashboard · Heat Shield AI')
  })

  it('keeps the assistant screen honest when no chat service is connected', async () => {
    const user = userEvent.setup()
    renderApp('/assistant')
    expect(await screen.findByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Ask Heat Shield' }), 'How can I stay cool?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByRole('status')).toHaveTextContent('Chat is not connected yet.')
    expect(document.title).toBe('AI Assistant · Heat Shield AI')
  })

  it('shows the uploaded chat-history menu and starts a new chat', async () => {
    const user = userEvent.setup()
    renderApp('/menu')
    expect(await screen.findByRole('heading', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recents' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'New Chat' }))
    expect(await screen.findByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
  })

  it('redirects old, unsubmitted sections back to the dashboard', async () => {
    for (const route of ['/monitor', '/forecast', '/maps', '/alerts', '/safety', '/about']) {
      cleanup()
      renderApp(route)
      expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Disaster Monitor' })).not.toBeInTheDocument()
    }
  })
})
