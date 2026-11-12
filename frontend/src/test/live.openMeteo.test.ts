import { describe, expect, it } from 'vitest'
import { getAirQuality, getHistoricalWeather, getWeather } from '../api/openMeteo'
import { getRegion } from '../data/regions'

const live = process.env.LIVE_OPEN_METEO === 'true'

describe.skipIf(!live)('live Open-Meteo verification (network-enabled CI only)', () => {
  it('retrieves real Mumbai current weather and an exact five-day forecast', { timeout: 45000 }, async () => {
    const result = await getWeather(getRegion('mumbai'), true)
    expect(result.freshness).toBe('current')
    expect(result.data.source).toBe('Open-Meteo')
    expect(result.data.evidenceType).toBe('weather-model')
    expect(Number.isFinite(result.data.temperature)).toBe(true)
    expect(Number.isFinite(result.data.apparentTemperature)).toBe(true)
    expect(result.data.humidity).toBeGreaterThanOrEqual(0)
    expect(result.data.humidity).toBeLessThanOrEqual(100)
    expect(result.data.windSpeed).toBeGreaterThanOrEqual(0)
    expect(result.data.forecast).toHaveLength(5)
    expect(new Date(result.data.observedAt).toISOString()).toBe(result.data.observedAt)
    console.log(JSON.stringify({
      liveOpenMeteo: true, region: result.data.name, observedAt: result.data.observedAt,
      retrievedAt: result.data.retrievedAt, temperature: result.data.temperature,
      apparentTemperature: result.data.apparentTemperature, humidity: result.data.humidity,
      windSpeed: result.data.windSpeed, forecastDays: result.data.forecast.map((day) => ({ date: day.date, max: day.max, min: day.min })),
    }))
  })

  it('retrieves real Mumbai CAMS air-quality model estimates without relabelling as CPCB', { timeout: 45000 }, async () => {
    const result = await getAirQuality(getRegion('mumbai'), true)
    expect(result.freshness).toBe('current')
    expect(result.data.source).toBe('Open-Meteo Air Quality API (CAMS model)')
    expect(result.data.evidenceType).toBe('air-quality-model')
    expect(result.data.isStationObservation).toBe(false)
    expect(result.data.usAqi !== null || result.data.europeanAqi !== null).toBe(true)
    expect(result.data.hourly.length).toBeGreaterThanOrEqual(12)
    expect(new Date(result.data.modelTime).toISOString()).toBe(result.data.modelTime)
    console.log(JSON.stringify({
      liveAirQuality: true, region: result.data.name, modelTime: result.data.modelTime,
      retrievedAt: result.data.retrievedAt, usAqi: result.data.usAqi, europeanAqi: result.data.europeanAqi,
      pm2_5: result.data.pm2_5, pm10: result.data.pm10, hourlyPoints: result.data.hourly.length,
    }))
  })

  it('retrieves real historical archive data without simulating observations', { timeout: 45000 }, async () => {
    const result = await getHistoricalWeather(getRegion('mumbai'), '2025-01-01', '2025-01-07', true)
    expect(result.data.days).toHaveLength(7)
    expect(result.data.source).toBe('Open-Meteo Historical Weather API')
    expect(result.data.evidenceType).toBe('weather-model-reanalysis')
    expect(result.data.days.every((day) => Number.isFinite(day.max) && Number.isFinite(day.min) && Number.isFinite(day.mean))).toBe(true)
    console.log(JSON.stringify({ liveArchive: true, region: result.data.region.name, range: result.data.observedTimeRange, days: result.data.days.length }))
  })
})
