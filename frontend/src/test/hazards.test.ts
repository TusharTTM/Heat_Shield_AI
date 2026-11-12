import { describe, expect, it } from 'vitest'
import {
  airQualityTrend, assessAirQuality, buildEnvironmentalScreening, europeanAqiCategory,
  riskFromEuropeanAqi, riskFromUsAqi, upcomingHazards, usAqiCategory,
} from '../data/hazards'
import { airQualityFixture, weatherFixture } from './weatherFixtures'

describe('source-aware hazard screening', () => {
  it('retains detailed US AQI categories and the documented four-level mapping', () => {
    expect(usAqiCategory(50)).toBe('Good')
    expect(usAqiCategory(51)).toBe('Moderate')
    expect(usAqiCategory(101)).toBe('Unhealthy for Sensitive Groups')
    expect(usAqiCategory(151)).toBe('Unhealthy')
    expect(usAqiCategory(201)).toBe('Very Unhealthy')
    expect(usAqiCategory(301)).toBe('Hazardous')
    expect(riskFromUsAqi(150)).toBe('moderate')
    expect(riskFromUsAqi(200)).toBe('high')
    expect(riskFromUsAqi(201)).toBe('extreme')
  })

  it('classifies European AQI separately rather than calling it Indian CPCB AQI', () => {
    expect(europeanAqiCategory(20)).toBe('Good')
    expect(europeanAqiCategory(21)).toBe('Fair')
    expect(europeanAqiCategory(41)).toBe('Moderate')
    expect(europeanAqiCategory(61)).toBe('Poor')
    expect(europeanAqiCategory(81)).toBe('Very Poor')
    expect(europeanAqiCategory(101)).toBe('Extremely Poor')
    expect(riskFromEuropeanAqi(40)).toBe('low')
    expect(riskFromEuropeanAqi(60)).toBe('moderate')
    expect(riskFromEuropeanAqi(80)).toBe('high')
    expect(riskFromEuropeanAqi(81)).toBe('extreme')
  })

  it('uses the more severe available index and shows both rationales', () => {
    const air = { ...airQualityFixture(), europeanAqi: 85 }
    const assessment = assessAirQuality(air)
    expect(assessment?.level).toBe('extreme')
    expect(assessment?.summary).toContain('US AQI 125')
    expect(assessment?.summary).toContain('European AQI 85')
    expect(assessment?.explanation).toContain('Neither is a CPCB monitoring-station observation')
    expect(assessment?.recommendation).toContain('Avoid strenuous outdoor activity')
    expect(assessment?.method).toContain('not AI analysis')
  })

  it('can assess European AQI when US AQI is missing but never invents an index', () => {
    const air = { ...airQualityFixture(), usAqi: null, europeanAqi: 40 }
    const assessment = assessAirQuality(air)
    expect(assessment?.level).toBe('low')
    expect(assessment?.indicators[0].value).toBe('Unavailable')
    expect(assessment?.indicators[1].value).toContain('Fair')
    expect(assessAirQuality({ ...air, europeanAqi: null })).toBeNull()
  })

  it('ignores missing hourly metric values instead of treating them as zero', () => {
    const hours = airQualityFixture().hourly.slice(0, 4)
    hours[0].usAqi = null
    hours[1].usAqi = 120
    hours[2].usAqi = null
    hours[3].usAqi = 135
    const trend = airQualityTrend(hours)
    expect(trend.first?.usAqi).toBe(120)
    expect(trend.last?.usAqi).toBe(135)
    expect(trend.change).toBe(15)
    expect(trend.direction).toBe('rising')
    expect(trend.next24Max).toBe(135)
    expect(airQualityTrend(hours.map((hour) => ({ ...hour, usAqi: null }))).next24Max).toBeNull()
  })

  it('does not call a partial low assessment Safe', () => {
    const air = { ...airQualityFixture(), usAqi: 20, europeanAqi: 10 }
    const partial = buildEnvironmentalScreening(null, air)
    expect(partial.level).toBe('low')
    expect(partial.completeness).toBe('partial')
    expect(partial.label).toBe('Status incomplete')
    const complete = buildEnvironmentalScreening(weatherFixture(), air)
    expect(complete.completeness).toBe('complete')
    // The screening band, not the alert word: "Warning" is reserved for official alerts.
    expect(complete.label).toBe('High')
    expect(complete.officialWarningsIncluded).toBe(false)
  })

  it('labels upcoming air signals as CAMS model forecasts, not CPCB alerts', () => {
    const air = airQualityFixture()
    air.hourly[5].europeanAqi = 85
    const upcoming = upcomingHazards(null, air)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].level).toBe('extreme')
    expect(upcoming[0].detail).toContain('CAMS outlook')
    expect(upcoming[0].detail).toContain('not a CPCB station alert')
  })
})
