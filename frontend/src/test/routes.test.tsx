import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
vi.mock('../components/ForecastChart', () => ({ ForecastChart: () => <div data-testid="forecast-chart" /> }))
vi.mock('../components/RegionMap', () => ({ RegionMap: () => <div data-testid="offline-map" /> }))

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getCurrentWeather).mockReset().mockImplementation(async (region) => currentResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
})

const routes = [
  { path: '/', title: 'Environmental dashboard for Mumbai', documentTitle: 'Environmental dashboard for Mumbai · HeatShield AI' },
  { path: '/monitor', title: 'Disaster Monitor', documentTitle: 'Disaster Monitor for Mumbai · HeatShield AI' },
  { path: '/forecast', title: '5-day weather forecast', documentTitle: '5-day forecast for Mumbai · HeatShield AI' },
  { path: '/maps', title: 'Heat and air-quality risk map', documentTitle: 'Heat and air-quality risk map for Mumbai · HeatShield AI' },
  { path: '/alerts', title: 'Alerts', documentTitle: 'Alerts for Mumbai · HeatShield AI' },
  { path: '/safety', title: 'Safety Guide', documentTitle: 'Safety Guide for Mumbai · HeatShield AI' },
  { path: '/about', title: 'About HeatShield AI', documentTitle: 'About · HeatShield AI' },
]

describe('seven-section navigation', () => {
  for (const item of routes) {
    it(`loads ${item.path} with the shared weather provider`, () => {
      render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[item.path]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
      expect(screen.getByRole('heading', { name: item.title, level: 1 })).toBeInTheDocument()
      expect(document.title).toBe(item.documentTitle)
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('complementary', { name: 'Environmental data status' })).toBeInTheDocument()
    })
  }
})
