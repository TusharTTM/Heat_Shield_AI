import { describe, expect, it } from 'vitest'
import { buildEarlyWarnings, type EarlyWarningPreferences } from '../data/earlyWarnings'
import { isWithinQuietHours } from '../data/quietHours'
import type { AirQualityData, WeatherData } from '../types'
import { airQualityFixture, weatherFixture } from './weatherFixtures'

const NOW = new Date('2026-11-16T10:00:00+05:30')
const EVENING = new Date('2026-11-16T18:00:00+05:30')

function prefs(overrides: Partial<EarlyWarningPreferences> = {}): EarlyWarningPreferences {
  const defaults: EarlyWarningPreferences = {
    earlyWarnings: true,
    leadHours: 6,
    types: { extremeHeat: true, heatIndex: true, airQuality: true, official: true, hotNights: true },
  }
  return {
    ...defaults,
    ...overrides,
    types: { ...defaults.types, ...(overrides.types ?? {}) },
  }
}

function weather(overrides: Partial<WeatherData> = {}): WeatherData {
  const base = weatherFixture('mumbai')
  return {
    ...base,
    heatIndex: 25,
    temperature: 27,
    humidity: 55,
    observedAt: '2026-11-16T09:15:00+05:30',
    forecast: [
      { ...base.forecast[0], date: '2026-11-16', heatIndexMax: 36, max: 35, min: 27 },
      { ...base.forecast[1], date: '2026-11-17', heatIndexMax: 24, max: 30, min: 22 },
    ],
    ...overrides,
  }
}

/** Air-quality fixture whose hourly outlook starts two hours before the clock. */
function airNow(overrides: Partial<AirQualityData> = {}): AirQualityData {
  const base = airQualityFixture('mumbai')
  const start = Date.parse('2026-11-16T08:00:00+05:30')
  const hourly = base.hourly.map((hour, index) => ({ ...hour, modelTime: new Date(start + index * 3_600_000).toISOString() }))
  return {
    ...base,
    usAqi: 180,
    europeanAqi: 70,
    hourly,
    modelTime: hourly[0].modelTime,
    retrievedAt: hourly[0].modelTime,
    ...overrides,
  }
}

describe('buildEarlyWarnings', () => {
  it('warns before a forecast day crosses the high heat-index boundary', () => {
    const warnings = buildEarlyWarnings({ weather: weather(), air: null }, prefs({ types: { extremeHeat: true, heatIndex: false, airQuality: false, official: false, hotNights: false } }), NOW)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].id).toBe('extreme-heat-forecast')
    expect(warnings[0].level).toBe('high')
    expect(warnings[0].title).toBe('High heat index forecast')
  })

  it('keeps ongoing current-condition warnings inside a one-hour lead window', () => {
    const hotNow = weather({ heatIndex: 34 })
    const warnings = buildEarlyWarnings({ weather: hotNow, air: null }, prefs({ leadHours: 1, types: { extremeHeat: true, heatIndex: false, airQuality: false, official: false, hotNights: false } }), NOW)
    expect(warnings.map((warning) => warning.id)).toEqual(['extreme-heat-ongoing'])
  })

  it('hides a forecast warning until the lead horizon reaches its onset', () => {
    const types = { extremeHeat: true, heatIndex: false, airQuality: false, official: false, hotNights: false }
    const inputs = { weather: weather(), air: null }
    // The forecast peak starts at 11:00 IST on the 16th. From 08:00 IST a
    // 6-hour horizon reaches it, a 1-hour horizon (opening at 10:00) does not.
    const early = new Date('2026-11-16T08:00:00+05:30')
    expect(buildEarlyWarnings(inputs, prefs({ leadHours: 6, types }), early)).toHaveLength(1)
    expect(buildEarlyWarnings(inputs, prefs({ leadHours: 1, types }), early)).toHaveLength(0)
    // Exactly at the horizon boundary the warning appears.
    expect(buildEarlyWarnings(inputs, prefs({ leadHours: 1, types }), new Date('2026-11-16T10:00:00+05:30'))).toHaveLength(1)
  })

  it('only builds warnings for enabled alert types', () => {
    const inputs = { weather: weather({ heatIndex: 34 }), air: airNow() }
    const all = buildEarlyWarnings(inputs, prefs({ types: { extremeHeat: true, heatIndex: true, airQuality: true, official: true, hotNights: true } }), EVENING)
    // Heat index + extreme heat + air quality + tonight's hot night.
    expect(all.length).toBeGreaterThanOrEqual(4)
    const none = buildEarlyWarnings(inputs, prefs({ types: { extremeHeat: false, heatIndex: false, airQuality: false, official: false, hotNights: false } }), EVENING)
    expect(none).toEqual([])
  })

  it('warns while modelled air quality is already unhealthy', () => {
    const warnings = buildEarlyWarnings({ weather: null, air: airNow() }, prefs({ types: { extremeHeat: false, heatIndex: false, airQuality: true, official: false, hotNights: false } }), NOW)
    expect(warnings.map((warning) => warning.id)).toEqual(['air-quality-ongoing'])
    expect(warnings[0].level).toBe('high')
  })

  it('warns ahead of a forecast deterioration, from the first crossing hour', () => {
    const base = airNow({ usAqi: 40, europeanAqi: 20 })
    const hourly = base.hourly.map((hour, index) => ({
      ...hour,
      usAqi: index < 3 ? 40 : 160,
      europeanAqi: index < 3 ? 20 : 70,
    }))
    const warnings = buildEarlyWarnings({ weather: null, air: { ...base, hourly } }, prefs({ types: { extremeHeat: false, heatIndex: false, airQuality: true, official: false, hotNights: false } }), NOW)
    expect(warnings.map((warning) => warning.id)).toEqual(['air-quality-forecast'])
    // Onset is the first hour out of the low band (11:00 IST), not the peak.
    expect(warnings[0].onset).toBe(hourly[3].modelTime)
  })

  it('returns nothing when early warnings are switched off', () => {
    const warnings = buildEarlyWarnings({ weather: weather({ heatIndex: 34 }), air: airQualityFixture('mumbai') }, prefs({ earlyWarnings: false }), NOW)
    expect(warnings).toEqual([])
  })

  it('warns about a hot night ahead of the evening', () => {
    const warnings = buildEarlyWarnings({ weather: weather(), air: null }, prefs({ types: { extremeHeat: false, heatIndex: false, airQuality: false, official: false, hotNights: true } }), new Date('2026-11-16T18:00:00+05:30'))
    expect(warnings.map((warning) => warning.id)).toEqual(['hot-night-0'])
    expect(warnings[0].title).toBe('Hot night expected tonight')
    expect(warnings[0].detail).toContain('27.0°C')
  })

  it('surfaces official warnings while they are active', () => {
    const warnings = buildEarlyWarnings({
      weather: null,
      air: null,
      officialAlerts: {
        status: 'ready',
        data: { alerts: [{ headline: 'Heat wave conditions likely', event: 'Heat Wave', onset: '2026-11-16T06:00:00Z', expires: '2026-11-16T18:00:00Z' }] },
      },
    }, prefs({ types: { extremeHeat: false, heatIndex: false, airQuality: false, official: true, hotNights: false } }), NOW)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].type).toBe('official')
    expect(warnings[0].detail).toBe('Heat wave conditions likely')
  })

  it('drops expired warnings and sorts by severity', () => {
    const stale = buildEarlyWarnings({
      weather: null,
      air: null,
      officialAlerts: {
        status: 'ready',
        data: { alerts: [{ headline: 'Expired', event: 'Heat Wave', onset: '2026-11-15T06:00:00Z', expires: '2026-11-15T18:00:00Z' }] },
      },
    }, prefs(), NOW)
    expect(stale).toEqual([])

    const mixed = buildEarlyWarnings({ weather: weather({ heatIndex: 30 }), air: airQualityFixture('mumbai') }, prefs(), NOW)
    const levels = mixed.map((warning) => warning.level)
    expect(levels).toEqual([...levels].sort((a, b) => ({ low: 0, moderate: 1, high: 2, extreme: 3 }[b] - { low: 0, moderate: 1, high: 2, extreme: 3 }[a])))
  })
})

describe('isWithinQuietHours', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 10, 16, hour, minute)

  it('understands an overnight window', () => {
    const quiet = { enabled: true, start: '22:00', end: '07:00' }
    expect(isWithinQuietHours(at(23, 30), quiet)).toBe(true)
    expect(isWithinQuietHours(at(6, 59), quiet)).toBe(true)
    expect(isWithinQuietHours(at(0), quiet)).toBe(true)
    expect(isWithinQuietHours(at(7), quiet)).toBe(false)
    expect(isWithinQuietHours(at(12), quiet)).toBe(false)
  })

  it('understands a daytime window', () => {
    const quiet = { enabled: true, start: '09:00', end: '17:00' }
    expect(isWithinQuietHours(at(10), quiet)).toBe(true)
    expect(isWithinQuietHours(at(17), quiet)).toBe(false)
    expect(isWithinQuietHours(at(2), quiet)).toBe(false)
  })

  it('is off unless enabled with a usable window', () => {
    expect(isWithinQuietHours(at(23), { enabled: false, start: '22:00', end: '07:00' })).toBe(false)
    expect(isWithinQuietHours(at(23), { enabled: true, start: '22:00', end: '22:00' })).toBe(false)
    expect(isWithinQuietHours(at(23), { enabled: true, start: 'oops', end: '07:00' })).toBe(false)
  })
})
