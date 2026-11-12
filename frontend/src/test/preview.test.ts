import { describe, expect, it } from 'vitest'
import { getDemoForecast, getDemoWeather, getRiskExplanation, getSafetyRecommendation, getSimpleRisk, getTodayHours, heatIndexC, riskFromHeatIndex, weatherByRegion } from '../data/preview'

describe('fixed demo weather methods', () => {
  it('computes heat index from temperature and humidity', () => {
    expect(heatIndexC(32.2, 70)).toBeGreaterThan(32.2)
    expect(heatIndexC(26, 50)).toBeCloseTo(26, 0)
  })

  it('preserves the documented underlying risk boundaries', () => {
    expect(riskFromHeatIndex(26.9)).toBe('low')
    expect(riskFromHeatIndex(27)).toBe('moderate')
    expect(riskFromHeatIndex(33)).toBe('high')
    expect(riskFromHeatIndex(40)).toBe('severe')
    expect(riskFromHeatIndex(52)).toBe('extreme')
  })

  it('maps the underlying bands to four simple display labels', () => {
    expect(getSimpleRisk('low')).toBe('low')
    expect(getSimpleRisk('moderate')).toBe('moderate')
    expect(getSimpleRisk('high')).toBe('high')
    expect(getSimpleRisk('severe')).toBe('high')
    expect(getSimpleRisk('extreme')).toBe('extreme')
  })

  it('provides fifteen configured regions with five forecast days and six today points', () => {
    expect(weatherByRegion).toHaveLength(15)
    for (const region of weatherByRegion) {
      expect(region.heatIndex).toBeCloseTo(heatIndexC(region.temperature, region.humidity), 1)
      expect(region.risk).toBe(riskFromHeatIndex(region.heatIndex))
      expect(getDemoForecast(region.slug)).toHaveLength(5)
      expect(getTodayHours(region.slug)).toHaveLength(6)
    }
  })

  it('uses one documented heat-index value instead of unsupported apparent fixtures', () => {
    expect(getDemoWeather('mumbai').heatIndex).toBe(45.4)
    expect(getDemoWeather('ahmedabad').heatIndex).toBe(54.1)
    for (const weather of weatherByRegion) expect(weather).not.toHaveProperty('apparent')
    expect(getRiskExplanation('mumbai')).toContain('45.4°C heat index')
    expect(getRiskExplanation('mumbai')).toContain('34.8°C air temperature and 62% relative humidity')
    expect(getRiskExplanation('mumbai')).toContain('not an official local warning')
  })

  it('labels every forecast with an exact fixed date and preserves daily lows', () => {
    const forecast = getDemoForecast('mumbai')
    expect(forecast.map((day) => day.date)).toEqual(['2026-05-15', '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19'])
    expect(forecast[0].label).toBe('Fri, 15 May')
    expect(forecast[0].fullLabel).toBe('Friday, 15 May 2026')
    expect(forecast[4].fullLabel).toBe('Tuesday, 19 May 2026')
    expect(forecast.map((day) => day.min)).toEqual([27.2, 27.4, 27.9, 27.6, 27.1])
  })

  it('returns deterministic offline safety guidance rather than AI claims', () => {
    expect(getSafetyRecommendation('mumbai')).toBe(getSafetyRecommendation('mumbai'))
    expect(getSafetyRecommendation('mumbai')).toContain('Avoid direct sunlight')
    expect(getSafetyRecommendation('ahmedabad')).toContain('Stay in a cool indoor place')
  })

  it('keeps configured coordinates and a safe fallback', () => {
    expect(getDemoWeather('south-mumbai').name).toBe('South Mumbai')
    expect(getDemoWeather('delhi').latitude).toBeCloseTo(28.6139)
    expect(getDemoWeather('not-configured').slug).toBe('mumbai')
  })
})
