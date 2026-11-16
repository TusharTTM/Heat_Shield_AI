import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { celsiusToFahrenheit, convertTemperature, type ProfileSettings } from '../context/SettingsContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})

beforeEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-text-size')
  document.documentElement.removeAttribute('data-contrast')
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getCurrentWeather).mockReset().mockImplementation(async (region) => currentResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

function renderAt(path: string) {
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

function readSettings(): Partial<ProfileSettings> {
  return JSON.parse(localStorage.getItem('hs-settings-v1') ?? '{}')
}

describe('temperature conversion', () => {
  it('converts Celsius readings into the selected unit', () => {
    expect(celsiusToFahrenheit(0)).toBe(32)
    expect(celsiusToFahrenheit(37)).toBe(98.6)
    expect(convertTemperature(30, 'celsius')).toBe(30)
    expect(convertTemperature(30, 'fahrenheit')).toBe(86)
  })
})

describe('profile page', () => {
  it('opens with every settings section', async () => {
    renderAt('/profile')
    expect(await screen.findByRole('heading', { name: 'Profile', level: 1 })).toBeInTheDocument()
    for (const heading of ['Location', 'Heat alerts', 'Reminders', 'Display', 'Privacy & account']) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Default city')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Hydration reminders' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('saves the profile name and email on this device', async () => {
    renderAt('/profile')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Asha Patel' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.com' } })
    await waitFor(() => {
      const stored = readSettings()
      expect(stored.name).toBe('Asha Patel')
      expect(stored.email).toBe('asha@example.com')
    })
  })

  it('toggles hydration reminders and changes the interval', async () => {
    renderAt('/profile')
    const toggle = screen.getByRole('switch', { name: 'Hydration reminders' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    await waitFor(() => expect(readSettings().hydration?.enabled).toBe(true))
    fireEvent.change(screen.getByLabelText('Reminder interval'), { target: { value: '30' } })
    await waitFor(() => expect(readSettings().hydration?.intervalMinutes).toBe(30))
  })

  it('switches the temperature unit and applies it to dashboard readings', async () => {
    renderAt('/profile')
    fireEvent.click(screen.getByRole('button', { name: /fahrenheit/i }))
    await waitFor(() => expect(readSettings().display?.unit).toBe('fahrenheit'))
    cleanup()

    renderAt('/')
    const temperature = await screen.findByRole('heading', { name: 'Temperature' })
    await waitFor(() => expect(temperature.closest('article')?.textContent).toContain('°F'))
  })

  it('applies text size and high contrast preferences to the document', async () => {
    renderAt('/profile')
    fireEvent.click(screen.getByRole('button', { name: 'Large' }))
    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe('large'))
    fireEvent.click(screen.getByRole('switch', { name: 'High contrast' }))
    await waitFor(() => expect(document.documentElement.dataset.contrast).toBe('high'))
  })

  it('saves heat-alert preferences including quiet hours', async () => {
    renderAt('/profile')
    fireEvent.click(screen.getByRole('switch', { name: 'Quiet hours' }))
    await waitFor(() => expect(readSettings().heatAlerts?.quietHours.enabled).toBe(true))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '23:00' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /hot nights/i }))
    await waitFor(() => {
      const stored = readSettings()
      expect(stored.heatAlerts?.quietHours.start).toBe('23:00')
      expect(stored.heatAlerts?.types.hotNights).toBe(true)
    })
  })

  it('signs out and returns to the dashboard', async () => {
    renderAt('/profile')
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai', level: 1 })).toBeInTheDocument()
    expect(readSettings().signedIn).toBe(false)
  })

  it('offers data controls on this device', async () => {
    renderAt('/profile')
    expect(await screen.findByRole('button', { name: /download my data/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear local data/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /request access/i })).toBeInTheDocument()
  })
})

describe('profile buttons', () => {
  it('links the dashboard profile chip to the profile page', async () => {
    renderAt('/')
    const link = await screen.findByRole('link', { name: /profile/i })
    expect(link).toHaveAttribute('href', '/profile')
  })

  it('links the menu profile row to the profile page', async () => {
    renderAt('/menu')
    const link = await screen.findByRole('link', { name: /profile/i })
    expect(link).toHaveAttribute('href', '/profile')
  })
})

describe('hydration reminder', () => {
  it('shows the in-app toast once a reminder is due', async () => {
    localStorage.setItem('hs-hydration-last', String(Date.now() - 31 * 60 * 1000))
    localStorage.setItem('hs-settings-v1', JSON.stringify({ hydration: { enabled: true, intervalMinutes: 30 } }))
    renderAt('/')
    expect(await screen.findByText('Hydration reminder')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByText('Hydration reminder')).not.toBeInTheDocument())
  })

  it('stays quiet before the interval elapses', async () => {
    localStorage.setItem('hs-hydration-last', String(Date.now() - 60 * 1000))
    localStorage.setItem('hs-settings-v1', JSON.stringify({ hydration: { enabled: true, intervalMinutes: 30 } }))
    renderAt('/')
    await screen.findByRole('heading', { name: 'Heat Shield dashboard for Mumbai', level: 1 })
    expect(screen.queryByText('Hydration reminder')).not.toBeInTheDocument()
  })
})
