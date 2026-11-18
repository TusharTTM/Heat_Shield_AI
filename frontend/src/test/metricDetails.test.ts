import { describe, expect, it } from 'vitest'
import {
  METRIC_DEFINITIONS, METRIC_ORDER, buildMetricDay, neighborMetrics, resolveDayDates, uvCategory,
} from '../data/metricDetails'
import { heatIndexC } from '../data/heat'
import { getRegion } from '../data/regions'
import type { AirQualityData, HistoricalData, WeatherData } from '../types'
import { airQualityFixture, weatherFixture } from './weatherFixtures'

const identity = { convert: (celsius: number) => celsius, temperatureSymbol: '°C' }
const fahrenheit = { convert: (celsius: number) => Math.round((celsius * 9) / 5 + 32), temperatureSymbol: '°F' }

function historyFixture(): HistoricalData {
  return {
    region: getRegion('mumbai'),
    days: [{ date: '2026-11-07', max: 33.2, min: 26.4, mean: 29.6 }],
    hourly: Array.from({ length: 24 }, (_, index) => ({
      isoTime: new Date(Date.UTC(2026, 10, 7, index)).toISOString(),
      label: `${index % 12 === 0 ? 12 : index % 12} ${index < 12 ? 'AM' : 'PM'}`,
      temperature: Math.round((26 + 4 * Math.sin((index / 24) * 2 * Math.PI - Math.PI / 2)) * 10) / 10,
      humidity: 58,
      uvIndex: null,
    })),
    observedTimeRange: { start: '2026-11-07', end: '2026-11-07' },
    retrievedAt: '2026-11-08T09:10:00.000Z',
    source: 'Open-Meteo Historical Weather API',
    evidenceType: 'weather-model-reanalysis',
  }
}

function sources(): { weather: WeatherData; air: AirQualityData; history: HistoricalData } {
  return { weather: weatherFixture('mumbai'), air: airQualityFixture('mumbai'), history: historyFixture() }
}

describe('resolveDayDates', () => {
  it('anchors the three days on the model calendar, not the device clock', () => {
    const dates = resolveDayDates(weatherFixture('mumbai'), null)
    expect(dates).toEqual({ yesterday: '2026-11-07', today: '2026-11-08', tomorrow: '2026-11-09' })
  })
})

describe('buildMetricDay', () => {
  it('builds today\'s temperature series from the modelled hourly data with min/max/current', () => {
    const view = buildMetricDay('temperature', 'today', sources(), identity)
    expect(view.hasData).toBe(true)
    expect(view.points).toHaveLength(24)
    expect(view.unitLabel).toBe('°C')
    expect(view.summary.current).toBe(weatherFixture('mumbai').temperature)
    expect(view.summary.currentLabel).toBe('Current model value')
    expect(view.summary.min).not.toBeNull()
    expect(view.summary.max as number).toBeGreaterThanOrEqual(view.summary.min as number)
    expect(view.source).toBe('Open-Meteo (weather model)')
    expect(view.updatedAt).not.toBeNull()
  })

  it('derives heat index and screening bands with the shared heat functions', () => {
    const view = buildMetricDay('heat-index', 'today', sources(), identity)
    const first = view.points[0]
    const source = weatherFixture('mumbai').hourlySeries[0]
    expect(first.value).toBe(heatIndexC(source.temperature as number, source.humidity as number))
    expect(first.risk).not.toBeNull()
    expect(first.note).toMatch(/screening/)
  })

  it('converts values and units for the Fahrenheit preference', () => {
    const view = buildMetricDay('temperature', 'today', sources(), fahrenheit)
    expect(view.unitLabel).toBe('°F')
    view.points.slice(0, 3).forEach((point, index) => {
      const celsius = weatherFixture('mumbai').hourlySeries[index].temperature as number
      expect(point.value).toBe(Math.round((celsius * 9) / 5 + 32))
    })
  })

  it('splits yesterday and tomorrow from the same series', () => {
    const today = buildMetricDay('temperature', 'today', sources(), identity)
    const tomorrow = buildMetricDay('temperature', 'tomorrow', sources(), identity)
    expect(today.points[0].isoTime.slice(0, 10)).toBe('2026-11-08')
    expect(tomorrow.points[0].isoTime.slice(0, 10)).toBe('2026-11-09')
    expect(tomorrow.summary.rangeLabel).toBe('Full-day forecast')
    expect(tomorrow.summary.current).toBeNull()
  })

  it('uses the historical reanalysis for yesterday\'s temperature', () => {
    const view = buildMetricDay('temperature', 'yesterday', sources(), identity)
    expect(view.hasData).toBe(true)
    expect(view.points).toHaveLength(24)
    expect(view.source).toBe('Open-Meteo Historical Weather API (ERA5 reanalysis)')
    expect(view.summary.rangeLabel).toBe('Historical reanalysis')
  })

  it('keeps missing UV readings as gaps and never invents yesterday\'s UV', () => {
    const today = buildMetricDay('uv-index', 'today', sources(), identity)
    expect(today.hasData).toBe(true)
    expect(today.unitLabel).toBe('UV index')
    expect(today.summary.currentLabel).toBe('Highest forecast today')
    const yesterday = buildMetricDay('uv-index', 'yesterday', sources(), identity)
    expect(yesterday.hasData).toBe(false)
    expect(yesterday.points.every((point) => point.value === null)).toBe(true)
    expect(yesterday.unavailableReason).toContain('does not provide historical UV')
    expect(yesterday.unavailableReason).toContain('not a low-UV day')
  })

  it('builds the air-quality view from the CAMS modelled hours with category notes', () => {
    const view = buildMetricDay('air-quality', 'today', sources(), identity)
    expect(view.hasData).toBe(true)
    expect(view.unitLabel).toBe('US AQI')
    expect(view.points.length).toBeGreaterThan(0)
    expect(view.points[0].note).toMatch(/US AQI|AQI/)
    expect(view.source).toBe('Open-Meteo Air Quality API (CAMS model estimate)')
    expect(view.summary.currentLabel).toBe('Current model value')
  })

  it('reports an honest unavailable state when nothing is loaded', () => {
    const view = buildMetricDay('temperature', 'today', { weather: null, air: null, history: null }, identity)
    expect(view.hasData).toBe(false)
    expect(view.summary.min).toBeNull()
    expect(view.unavailableReason).toContain('unknown — not an all-clear')
    expect(view.points).toHaveLength(0)
  })

  it('counts gaps so missing hours are visible as gaps, not zeros', () => {
    const filled = sources()
    filled.weather.hourlySeries = filled.weather.hourlySeries.map((point, index) => (
      index < 6 ? { ...point, temperature: null } : point
    ))
    const view = buildMetricDay('temperature', 'today', filled, identity)
    expect(view.hasData).toBe(true)
    expect(view.points).toHaveLength(24)
    expect(view.gapCount).toBe(6)
    expect(view.points.slice(0, 6).every((point) => point.value === null)).toBe(true)
  })

  it('exposes the same metric order and neighbours as the dashboard cards', () => {
    expect(METRIC_ORDER).toEqual(['temperature', 'heat-index', 'humidity', 'uv-index', 'air-quality', 'heat-risk'])
    expect(neighborMetrics('temperature')).toEqual({ previous: 'heat-risk', next: 'heat-index' })
    expect(neighborMetrics('air-quality')).toEqual({ previous: 'uv-index', next: 'heat-risk' })
    for (const id of METRIC_ORDER) {
      expect(METRIC_DEFINITIONS[id].whatItMeans.length).toBeGreaterThan(20)
      expect(METRIC_DEFINITIONS[id].safetyGuidance.length).toBeGreaterThan(20)
    }
  })

  it('classifies UV values with the WHO bands', () => {
    expect(uvCategory(1)).toBe('Low')
    expect(uvCategory(4)).toBe('Moderate')
    expect(uvCategory(7)).toBe('High')
    expect(uvCategory(9)).toBe('Very high')
    expect(uvCategory(12)).toBe('Extreme')
  })
})
