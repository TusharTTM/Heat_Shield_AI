import { getRegion } from '../data/regions'
import { weatherByRegion } from '../data/preview'
import type { AirQualityData, AirQualityResult, CurrentWeatherResult, WeatherData, WeatherResult } from '../types'

/** Explicit software test fixtures; never used by production API mode. */
export function weatherFixture(slug = 'mumbai'): WeatherData {
  const region = getRegion(slug)
  const sample = weatherByRegion.find((item) => item.slug === region.slug) ?? weatherByRegion[0]
  const dates = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']
  return {
    ...region, temperature: sample.temperature, humidity: sample.humidity, heatIndex: sample.heatIndex,
    apparentTemperature: Math.round((sample.heatIndex - 0.5) * 10) / 10, windSpeed: 12.3,
    risk: sample.risk, condition: 'Partly cloudy', observedAt: '2026-11-08T09:00:00.000Z',
    retrievedAt: '2026-11-08T09:05:00.000Z', source: 'Open-Meteo', evidenceType: 'weather-model',
    forecast: dates.map((date, index) => {
      const fullLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
      const label = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
      return { date, label, fullLabel, max: sample.temperature + [0.3, 1, 1.4, 0.8, 0.1][index], min: 27.2 + index * 0.2, condition: 'Partly cloudy' }
    }),
    hours: [8, 10, 12, 14, 16, 18].map((hour, index) => ({
      time: `${hour > 12 ? hour - 12 : hour} ${hour < 12 ? 'AM' : 'PM'}`,
      temperature: sample.temperature + [-4.7, -2.1, -0.5, 0.3, -0.8, -2][index],
    })),
  }
}

export function weatherResult(slug = 'mumbai'): WeatherResult {
  return { data: weatherFixture(slug), freshness: 'current', fromCache: false }
}

export function currentResult(slug = 'mumbai'): CurrentWeatherResult {
  const { forecast, hours, ...current } = weatherFixture(slug)
  void forecast
  void hours
  return { data: current, freshness: 'current', fromCache: false }
}

export function airQualityFixture(slug = 'mumbai'): AirQualityData {
  const region = getRegion(slug)
  const hourly = Array.from({ length: 24 }, (_, index) => ({
    modelTime: new Date(Date.UTC(2026, 10, 8, 9 + index)).toISOString(),
    label: new Intl.DateTimeFormat('en-IN', { weekday: 'short', hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8, 9 + index))),
    usAqi: 125 + index, europeanAqi: 55 + index,
    pm10: 88.4 + index, pm2_5: 45.2 + index, carbonMonoxide: 420.5 + index,
    nitrogenDioxide: 31.1 + index, sulphurDioxide: 8.2 + index, ozone: 64.3 + index,
  }))
  return {
    ...region, ...hourly[0], hourly, modelTime: hourly[0].modelTime, retrievedAt: '2026-11-08T09:05:00.000Z',
    aqiStandard: 'US AQI', aqiStandards: ['US AQI', 'European AQI'],
    source: 'Open-Meteo Air Quality API (CAMS model)', evidenceType: 'air-quality-model', isStationObservation: false,
  }
}

export function airQualityResult(slug = 'mumbai'): AirQualityResult {
  return { data: airQualityFixture(slug), freshness: 'current', fromCache: false }
}
