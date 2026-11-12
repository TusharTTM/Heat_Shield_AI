import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OfficialAlertsPanel } from '../components/OfficialAlertsPanel'
import { OfficialAirQualityPanel } from '../components/OfficialAirQualityPanel'
import { currentOfficialAirPayload, officialAlertsPayload, officialJsonResponse, stationObservation } from './officialFixtures'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('official-source panels', () => {
  it('explains missing backend configuration without implying an all-clear', () => {
    const refresh = vi.fn()
    render(<MemoryRouter><OfficialAlertsPanel state={{ status: 'unconfigured', data: null, error: null, refresh }} /><OfficialAirQualityPanel state={{ status: 'unconfigured', data: null, error: null, refresh }} /></MemoryRouter>)
    expect(screen.getByText('Official CAP backend not configured')).toBeInTheDocument()
    expect(screen.getByText('CPCB backend not configured')).toBeInTheDocument()
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && /does\s+not\s+mean there are no warnings/i.test(element.textContent ?? ''))).toBeInTheDocument()
    expect(screen.getByText(/No CAMS value is relabelled as CPCB AQI/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open NDMA SACHET/i })).toHaveAttribute('href', 'https://sachet.ndma.gov.in/')
  })

  it('displays verified CAP severity, instructions, validity and original source', async () => {
    fetchMock.mockResolvedValue(officialJsonResponse(officialAlertsPayload()))
    const { getOfficialAlerts } = await import('../api/official')
    const data = await getOfficialAlerts('mumbai')
    render(<MemoryRouter><OfficialAlertsPanel state={{ status: 'ready', data, error: null, refresh: vi.fn() }} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Heavy rainfall warning for Mumbai' })).toBeInTheDocument()
    expect(screen.getByText('Severe')).toBeInTheDocument()
    expect(screen.getByText('Follow local authority instructions.')).toBeInTheDocument()
    expect(screen.getByText(/The official CAP area explicitly names Mumbai and Maharashtra/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Original CAP XML/i })).toHaveAttribute('href', 'https://sachet.ndma.gov.in/FetchXMLFile?identifier=cap-test-1')
    expect(screen.getByText(/NDMA SACHET and the issuing agency/i)).toBeInTheDocument()
  })

  it('keeps incomplete and stored official retrieval visibly qualified', async () => {
    const payload = { ...officialAlertsPayload(), freshness: 'stale', provider_status: 'unavailable', retrieval_complete: false, failed_count: 2, message: 'Live SACHET refresh failed.' }
    fetchMock.mockResolvedValue(officialJsonResponse(payload))
    const { getOfficialAlerts } = await import('../api/official')
    const data = await getOfficialAlerts('mumbai')
    render(<MemoryRouter><OfficialAlertsPanel state={{ status: 'ready', data, error: null, refresh: vi.fn() }} /></MemoryRouter>)
    expect(screen.getByText('Stored official CAP data')).toBeInTheDocument()
    expect(screen.getByText('Official-alert retrieval is incomplete')).toBeInTheDocument()
    expect(screen.getByText(/2 failed\/skipped/i)).toBeInTheDocument()
    expect(screen.getByText('Live SACHET refresh failed.')).toBeInTheDocument()
  })

  it('preserves missing Indian AQI and builds trends only from stored station times', async () => {
    const withoutAqi = { ...stationObservation, aqi: null, aqi_category: null, aqi_standard: null, screening_level: null }
    const earlier = { ...withoutAqi, observed_at: '2026-11-08T07:30:00Z', retrieved_at: '2026-11-08T08:00:00Z', pollutants: { 'PM2.5': { ...withoutAqi.pollutants['PM2.5'], average: 40.1 } } }
    const current = { ...currentOfficialAirPayload(), observations: [withoutAqi] }
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input).includes('/history/')
      ? officialJsonResponse({ region: 'mumbai', count: 2, status: 'stored_station_observations', items: [withoutAqi, earlier] })
      : officialJsonResponse(current))
    const { getOfficialAirQualityBundle } = await import('../api/official')
    const data = await getOfficialAirQualityBundle('mumbai')
    render(<OfficialAirQualityPanel state={{ status: 'ready', data, error: null, refresh: vi.fn() }} />)
    expect(screen.getByText('Indian AQI not supplied for this station/time')).toBeInTheDocument()
    expect(screen.getByText(/Pollutant averages are not relabelled or converted into AQI/i)).toBeInTheDocument()
    expect(screen.getByText('µg/m³')).toBeInTheDocument()
    expect(screen.getByText(/PM2.5 average: 40.1 → 45.2 µg\/m³/i)).toBeInTheDocument()
    expect(screen.getByText(/rising.*across 2 stored observation times/i)).toBeInTheDocument()
    expect(screen.queryByText(/Indian CPCB AQI 45.2/i)).not.toBeInTheDocument()
  })
})
