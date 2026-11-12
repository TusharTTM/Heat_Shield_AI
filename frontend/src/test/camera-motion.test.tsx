import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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
  vi.restoreAllMocks()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

describe('dashboard navigation and accessibility', () => {
  it('opens the city selector by keyboard and restores focus after Escape', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    const trigger = screen.getByRole('button', { name: 'Location: Mumbai' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('dialog', { name: 'Choose a location' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search cities or states' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Choose a location' })).not.toBeInTheDocument()
  })

  it('opens the compact navigation from the dashboard header', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('heading', { name: 'Temperature' })

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const navigation = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(navigation).toBeVisible()
    expect(within(navigation).getByRole('link', { name: 'Forecast' })).toHaveAttribute('href', '/forecast')
    expect(document.querySelector('canvas.risk-scene-canvas')).not.toBeInTheDocument()
  })
})
