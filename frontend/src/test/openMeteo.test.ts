import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWeatherCache, getAirQuality, getCurrentWeather, getHistoricalWeather, getWeather,
  OPEN_METEO_AIR_QUALITY_URL, OPEN_METEO_ARCHIVE_URL, WEATHER_CACHE_TTL_MS,
} from '../api/openMeteo'
import { getRegion } from '../data/regions'

function payload() {
  return {
    utc_offset_seconds: 19800,
    current: { time: '2026-11-08T14:30', temperature_2m: 34.8, apparent_temperature: 37.2, relative_humidity_2m: 62, weather_code: 2, wind_speed_10m: 11.4 },
    daily: {
      time: ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'],
      temperature_2m_max: [35.1, 35.8, 36.2, 35.6, 34.9], temperature_2m_min: [27, 27.2, 27.7, 27.4, 27.1], weather_code: [2, 2, 1, 0, 61],
    },
    hourly: {
      time: [8, 10, 12, 14, 16, 18].map((hour) => `2026-11-08T${String(hour).padStart(2, '0')}:00`),
      temperature_2m: [30.1, 32.7, 34.3, 35.1, 34, 32.8],
    },
  }
}

function airQualityPayload() {
  const times = Array.from({ length: 30 }, (_, index) => `2026-11-${String(8 + Math.floor((13 + index) / 24)).padStart(2, '0')}T${String((13 + index) % 24).padStart(2, '0')}:00`)
  const series = (start: number) => times.map((_, index) => start + index)
  return {
    utc_offset_seconds: 19800,
    current: {
      time: '2026-11-08T14:00', us_aqi: 125, european_aqi: 55, pm10: 88.4, pm2_5: 45.2,
      carbon_monoxide: 420.5, nitrogen_dioxide: 31.1, sulphur_dioxide: 8.2, ozone: 64.3,
    },
    hourly: {
      time: times, us_aqi: series(124), european_aqi: series(54), pm10: series(87.4), pm2_5: series(44.2),
      carbon_monoxide: series(419.5), nitrogen_dioxide: series(30.1), sulphur_dioxide: series(7.2), ozone: series(63.3),
    },
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearWeatherCache()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Open-Meteo client', () => {
  it('parses actual response shapes into current values, five days and six hourly values', async () => {
    fetchMock.mockResolvedValue(jsonResponse(payload()))
    const result = await getWeather(getRegion('mumbai'))
    expect(result.data.temperature).toBe(34.8)
    expect(result.data.apparentTemperature).toBe(37.2)
    expect(result.data.humidity).toBe(62)
    expect(result.data.windSpeed).toBe(11.4)
    expect(result.data.heatIndex).toBe(45.4)
    expect(result.data.observedAt).toBe('2026-11-08T09:00:00.000Z')
    expect(result.data.forecast).toHaveLength(5)
    expect(result.data.hours).toHaveLength(6)
    expect(result.data.evidenceType).toBe('weather-model')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('latitude')).toBe('19.076')
    expect(url.searchParams.get('current')).toContain('apparent_temperature')
    expect(url.searchParams.get('forecast_days')).toBe('5')
    expect(url.searchParams.get('timezone')).toBe('Asia/Kolkata')
  })

  it('uses fresh cache, supports explicit refresh, and deduplicates in-flight requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse(payload()))
    const first = await getWeather(getRegion('mumbai'))
    const second = await getWeather(getRegion('mumbai'))
    expect(first.fromCache).toBe(false)
    expect(second.fromCache).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await getWeather(getRegion('mumbai'), true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockClear()
    let resolveResponse!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveResponse = resolve }))
    const pendingA = getWeather(getRegion('pune'))
    const pendingB = getWeather(getRegion('pune'))
    resolveResponse(jsonResponse(payload()))
    await Promise.all([pendingA, pendingB])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns explicitly stale cache after a failed refresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload())).mockRejectedValueOnce(new TypeError('offline'))
    const fresh = await getWeather(getRegion('mumbai'))
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + WEATHER_CACHE_TTL_MS + 1000)
    const stale = await getWeather(getRegion('mumbai'), true)
    expect(stale.freshness).toBe('stale')
    expect(stale.fromCache).toBe(true)
    expect(stale.warning).toMatch(/cached Open-Meteo response/)
    expect(stale.data).toEqual(fresh.data)
  })

  it('returns errors without substituting demo weather', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503))
    await expect(getWeather(getRegion('mumbai'))).rejects.toThrow('HTTP 503')
  })

  it('rejects incomplete five-day forecasts and invalid current values', async () => {
    const short = payload()
    short.daily.time = short.daily.time.slice(0, 4)
    fetchMock.mockResolvedValueOnce(jsonResponse(short))
    await expect(getWeather(getRegion('mumbai'))).rejects.toThrow('exactly five')
    const invalid = payload()
    invalid.current.relative_humidity_2m = 120
    fetchMock.mockResolvedValueOnce(jsonResponse(invalid))
    await expect(getWeather(getRegion('mumbai'))).rejects.toThrow('relative_humidity_2m')
    const missing = payload()
    missing.daily.temperature_2m_max[2] = null as unknown as number
    fetchMock.mockResolvedValueOnce(jsonResponse(missing))
    await expect(getWeather(getRegion('mumbai'))).rejects.toThrow('incomplete forecast day')
  })

  it('uses a current-only request for map markers', async () => {
    fetchMock.mockResolvedValue(jsonResponse(payload()))
    const result = await getCurrentWeather(getRegion('delhi'))
    expect(result.data.name).toBe('Delhi')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.has('daily')).toBe(false)
    expect(url.searchParams.has('hourly')).toBe(false)
    expect(url.searchParams.has('forecast_days')).toBe(false)
  })

  it('uses the historical archive endpoint and preserves historical values', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ daily: {
      time: ['2025-01-01', '2025-01-02'], temperature_2m_max: [31, 32], temperature_2m_min: [20, 21], temperature_2m_mean: [25, 26],
    } }))
    const result = await getHistoricalWeather(getRegion('mumbai'), '2025-01-01', '2025-01-02')
    expect(result.data.days).toHaveLength(2)
    expect(result.data.days[1]).toEqual({ date: '2025-01-02', max: 32, min: 21, mean: 26 })
    expect(result.data.evidenceType).toBe('weather-model-reanalysis')
    expect(String(fetchMock.mock.calls[0][0])).toContain(OPEN_METEO_ARCHIVE_URL)
  })

  it('validates historical date ranges before making a request', async () => {
    await expect(getHistoricalWeather(getRegion('mumbai'), '2025-01-03', '2025-01-01')).rejects.toThrow('chronological')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests and parses current plus hourly US/European AQI and every pollutant', async () => {
    const response = airQualityPayload()
    response.hourly.pm2_5[2] = null as unknown as number
    fetchMock.mockResolvedValue(jsonResponse(response))
    const result = await getAirQuality(getRegion('mumbai'))
    expect(result.data.usAqi).toBe(125)
    expect(result.data.europeanAqi).toBe(55)
    expect(result.data.aqiStandards).toEqual(['US AQI', 'European AQI'])
    expect(result.data.hourly).toHaveLength(24)
    expect(result.data.hourly[0].usAqi).toBe(125)
    expect(result.data.hourly[0].europeanAqi).toBe(55)
    expect(result.data.hourly[1].pm2_5).toBeNull()
    expect(result.data.hourly[1].usAqi).toBe(126)
    expect(result.data.hourly[0]).toMatchObject({
      pm10: 88.4, carbonMonoxide: 420.5, nitrogenDioxide: 31.1, sulphurDioxide: 8.2, ozone: 64.3,
    })
    expect(result.data.isStationObservation).toBe(false)
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(String(url)).toContain(OPEN_METEO_AIR_QUALITY_URL)
    for (const parameter of ['current', 'hourly']) {
      const fields = url.searchParams.get(parameter) ?? ''
      for (const field of ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone']) {
        expect(fields).toContain(field)
      }
    }
  })

  it('keeps air-quality cache independent and labels stale refreshes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(airQualityPayload())).mockRejectedValueOnce(new TypeError('offline'))
    const fresh = await getAirQuality(getRegion('mumbai'))
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + WEATHER_CACHE_TTL_MS + 1000)
    const stale = await getAirQuality(getRegion('mumbai'), true)
    expect(fresh.freshness).toBe('current')
    expect(stale.freshness).toBe('stale')
    expect(stale.data).toEqual(fresh.data)
    expect(stale.warning).toMatch(/cached Open-Meteo response/)
  })

  it('rejects unavailable or invalid air-quality responses without inventing values', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503))
    await expect(getAirQuality(getRegion('mumbai'))).rejects.toThrow('HTTP 503')
    const invalid = airQualityPayload()
    invalid.hourly.european_aqi[2] = -1
    fetchMock.mockResolvedValueOnce(jsonResponse(invalid))
    await expect(getAirQuality(getRegion('mumbai'))).rejects.toThrow('invalid optional forecast value')
  })

  it('retries once when an Open-Meteo or CAMS request aborts on timeout', async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
      .mockResolvedValueOnce(jsonResponse(airQualityPayload()))
    const result = await getAirQuality(getRegion('mumbai'))
    expect(result.data.usAqi).toBe(125)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
