import { describe, expect, it } from 'vitest'
import { displayHeatRiskBands, getSimpleRisk, heatIndexC, riskFromHeatIndex } from '../data/heat'
import { riskRecommendations } from '../data/guidance'

const fahrenheitToCelsius = (value: number) => (value - 32) * 5 / 9

describe('scientific heat-index screening', () => {
  it('matches documented NOAA/NWS reference examples', () => {
    // NWS documents 96°F at 65% RH as a 121°F heat index.
    expect(heatIndexC(fahrenheitToCelsius(96), 65)).toBe(49.5)
    // Adjacent NWS chart examples rounded to one decimal Celsius.
    expect(heatIndexC(fahrenheitToCelsius(90), 70)).toBe(41.1)
    expect(heatIndexC(fahrenheitToCelsius(90), 60)).toBe(37.6)
  })

  it('applies the NWS low- and high-humidity adjustments deterministically', () => {
    expect(heatIndexC(fahrenheitToCelsius(105), 10)).toBe(37.3)
    expect(heatIndexC(fahrenheitToCelsius(85), 90)).toBe(38.8)
    expect(heatIndexC(26, 50)).toBeCloseTo(26, 0)
  })

  it('rejects invalid inputs instead of displaying an invalid heat index', () => {
    expect(() => heatIndexC(Number.NaN, 50)).toThrow(RangeError)
    expect(() => heatIndexC(30, -1)).toThrow(RangeError)
    expect(() => heatIndexC(30, 101)).toThrow(RangeError)
  })

  it('preserves the documented boundaries and maps them to exactly four display categories', () => {
    expect(riskFromHeatIndex(26.9)).toBe('low')
    expect(riskFromHeatIndex(27)).toBe('moderate')
    expect(riskFromHeatIndex(33)).toBe('high')
    expect(riskFromHeatIndex(40)).toBe('severe')
    expect(riskFromHeatIndex(51.9)).toBe('severe')
    expect(riskFromHeatIndex(52)).toBe('extreme')
    expect(displayHeatRiskBands.map((band) => band.level)).toEqual(['low', 'moderate', 'high', 'extreme'])
    expect(displayHeatRiskBands.map((band) => getSimpleRisk(riskFromHeatIndex(band.level === 'low' ? 26.9 : band.level === 'moderate' ? 27 : band.level === 'high' ? 40 : 52)))).toEqual(['low', 'moderate', 'high', 'extreme'])
  })

  it('provides a distinct practical recommendation for every display category', () => {
    const recommendations = displayHeatRiskBands.map((band) => riskRecommendations[band.level])
    expect(new Set(recommendations).size).toBe(4)
    recommendations.forEach((recommendation) => expect(recommendation.length).toBeGreaterThan(40))
    expect(riskRecommendations.low).toMatch(/water/i)
    expect(riskRecommendations.moderate).toMatch(/shade/i)
    expect(riskRecommendations.high).toMatch(/avoid direct sunlight/i)
    expect(riskRecommendations.extreme).toMatch(/cool indoor place/i)
  })
})
