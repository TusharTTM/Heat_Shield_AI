import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getCurrentWeather).mockReset().mockImplementation(async (region) => currentResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

const screens = [
  { path: '/', heading: 'Heat Shield dashboard for Mumbai', title: 'Dashboard · Heat Shield AI' },
  { path: '/assistant', heading: 'Heat Shield AI', title: 'AI Assistant · Heat Shield AI' },
  { path: '/menu', heading: 'Menu', title: 'Menu · Heat Shield AI' },
]

describe('uploaded screen routes', () => {
  for (const item of screens) {
    it(`opens ${item.path} with its matching title`, async () => {
      render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[item.path]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
      expect(await screen.findByRole('heading', { name: item.heading, level: 1 })).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe(item.title))
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
      expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content')
    })
  }
})
