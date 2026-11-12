import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentOfficialAirPayload as currentAirPayload, officialAlertsPayload as alertsPayload,
  officialJsonResponse as jsonResponse, stationObservation as observation,
} from './officialFixtures'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('official-source browser client', () => {
  it('fails explicitly when a static deployment has no backend', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const api = await import('../api/official')
    expect(api.OFFICIAL_API_CONFIGURED).toBe(false)
    await expect(api.getOfficialAlerts('mumbai')).rejects.toMatchObject({ code: 'OFFICIAL_API_NOT_CONFIGURED' })
    await expect(api.getOfficialAirQualityBundle('mumbai')).rejects.toMatchObject({ code: 'OFFICIAL_API_NOT_CONFIGURED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retrieves validated SACHET CAP fields through the configured backend', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example/')
    fetchMock.mockResolvedValue(jsonResponse(alertsPayload()))
    const api = await import('../api/official')
    const result = await api.getOfficialAlerts('mumbai')
    expect(fetchMock).toHaveBeenCalledWith('https://backend.example/api/v1/official/alerts/mumbai', expect.objectContaining({ cache: 'no-store' }))
    expect(result.evidenceType).toBe('official-warning')
    expect(result.alerts[0].event).toBe('Heavy Rainfall')
    expect(result.alerts[0].level).toBe('high')
    expect(result.alerts[0].isOfficial).toBe(true)
    expect(result.alerts[0].instruction).toBe('Follow local authority instructions.')
  })

  it('surfaces structured backend failures without substituting an all-clear', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example')
    fetchMock.mockResolvedValue(jsonResponse({ code: 'SACHET_UNAVAILABLE', detail: 'Official CAP retrieval failed.' }, 503))
    const api = await import('../api/official')
    await expect(api.getOfficialAlerts('mumbai')).rejects.toMatchObject({ code: 'SACHET_UNAVAILABLE', status: 503 })
  })

  it('rejects malformed freshness and non-official alert payloads', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example')
    const invalidFreshness = { ...alertsPayload(), freshness: 'probably-current' }
    fetchMock.mockResolvedValueOnce(jsonResponse(invalidFreshness))
    let api = await import('../api/official')
    await expect(api.getOfficialAlerts('mumbai')).rejects.toThrow('invalid freshness')

    vi.resetModules()
    const notOfficial = alertsPayload()
    notOfficial.alerts[0].is_official = false
    fetchMock.mockResolvedValueOnce(jsonResponse(notOfficial))
    api = await import('../api/official')
    await expect(api.getOfficialAlerts('mumbai')).rejects.toThrow('not marked as official')
  })

  it('keeps CPCB observations and stored history separate and preserves units', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example')
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/history/')) return jsonResponse({ region: 'mumbai', count: 1, status: 'stored_station_observations', items: [observation] })
      return jsonResponse(currentAirPayload())
    })
    const api = await import('../api/official')
    const result = await api.getOfficialAirQualityBundle('mumbai')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/history/mumbai?limit=500')
    expect(result.current.observations[0].aqi).toBe(175)
    expect(result.current.observations[0].aqiStandard).toBe('Indian CPCB AQI')
    expect(result.current.observations[0].pollutants['PM2.5'].unit).toBe('µg/m³')
    expect(result.current.evidenceType).toBe('station-observation')
    expect(result.history).toHaveLength(1)
    expect(result.historyWarning).toBeNull()
  })

  it('does not turn a pollutant average into missing Indian AQI', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example')
    const withoutAqi = { ...observation, aqi: null, aqi_category: null, aqi_standard: null, screening_level: null }
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input).includes('/history/')
      ? jsonResponse({ region: 'mumbai', count: 0, status: 'empty', items: [] })
      : jsonResponse({ ...currentAirPayload(), observations: [withoutAqi] }))
    const api = await import('../api/official')
    const result = await api.getOfficialAirQualityBundle('mumbai')
    expect(result.current.observations[0].aqi).toBeNull()
    expect(result.current.observations[0].aqiStandard).toBeNull()
    expect(result.current.observations[0].pollutants['PM2.5'].average).toBe(45.2)
  })
})
