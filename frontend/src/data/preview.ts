import type { ForecastDay, RegionWeather, TodayHour } from '../types'
import { riskRecommendations } from './guidance'
import { getSimpleRisk, heatIndexC, riskFromHeatIndex } from './heat'
import { regions } from './regions'

export { regions } from './regions'
export { getSimpleRisk, heatIndexC, riskFromHeatIndex } from './heat'

export const DEMO_TIMESTAMP = '2026-05-15T09:30:00.000Z'
export const DEMO_LABEL = 'Demo data'
export const DEMO_SOURCE = 'Bundled HeatShield AI demo fixtures'
export const DEMO_DATE_LABEL = '15 May 2026'

const samples = [
  { temperature: 34.8, humidity: 62, condition: 'Partly cloudy' },
  { temperature: 33.9, humidity: 66, condition: 'Partly cloudy' },
  { temperature: 36.4, humidity: 54, condition: 'Clear sky' },
  { temperature: 35.0, humidity: 45, condition: 'Mainly clear' },
  { temperature: 34.8, humidity: 32, condition: 'Clear sky' },
  { temperature: 45.0, humidity: 30, condition: 'Clear sky' },
  { temperature: 42.1, humidity: 25, condition: 'Hazy sunshine' },
  { temperature: 43.2, humidity: 22, condition: 'Clear sky' },
  { temperature: 40.8, humidity: 38, condition: 'Hazy sunshine' },
  { temperature: 38.6, humidity: 40, condition: 'Mainly clear' },
  { temperature: 37.4, humidity: 44, condition: 'Partly cloudy' },
  { temperature: 31.2, humidity: 58, condition: 'Partly cloudy' },
  { temperature: 34.1, humidity: 68, condition: 'Partly cloudy' },
  { temperature: 30.7, humidity: 76, condition: 'Overcast' },
  { temperature: 35.2, humidity: 64, condition: 'Hazy sunshine' },
]

export const weatherByRegion: RegionWeather[] = regions.map((region, index) => {
  const sample = samples[index]
  const heatIndex = heatIndexC(sample.temperature, sample.humidity)
  return { ...region, ...sample, heatIndex, risk: riskFromHeatIndex(heatIndex) }
})

export function getDemoWeather(slug: string): RegionWeather {
  return weatherByRegion.find((region) => region.slug === slug) ?? weatherByRegion[0]
}

const maxOffsets = [0.3, 1, 1.4, 0.8, 0.1]
const minOffsets = [0, 0.2, 0.7, 0.4, -0.1]
const dayFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDayFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function getDemoForecast(slug: string): ForecastDay[] {
  const weather = getDemoWeather(slug)
  return maxOffsets.map((offset, index) => {
    const date = new Date(Date.UTC(2026, 4, 15 + index))
    return {
      date: date.toISOString().slice(0, 10),
      label: dayFormatter.format(date),
      fullLabel: fullDayFormatter.format(date),
      max: Math.round((weather.temperature + offset) * 10) / 10,
      min: Math.round((27.2 + minOffsets[index] + (weather.temperature - 34.8) * 0.18) * 10) / 10,
    }
  })
}

const todayShape = [
  { time: '8 AM', offset: -4.7 },
  { time: '10 AM', offset: -2.1 },
  { time: '12 PM', offset: -0.5 },
  { time: '2 PM', offset: 0.3 },
  { time: '4 PM', offset: -0.4 },
  { time: '6 PM', offset: -2 },
]

export function getTodayHours(slug: string): TodayHour[] {
  const weather = getDemoWeather(slug)
  return todayShape.map(({ time, offset }) => ({
    time,
    temperature: Math.round((weather.temperature + offset) * 10) / 10,
  }))
}

export function getSafetyRecommendation(slug: string): string {
  return riskRecommendations[getSimpleRisk(getDemoWeather(slug).risk)]
}

export function getRiskExplanation(slug: string): string {
  const weather = getDemoWeather(slug)
  const risk = getSimpleRisk(weather.risk)
  const label = risk[0].toUpperCase() + risk.slice(1)
  return `${label} demo risk uses a ${weather.heatIndex.toFixed(1)}°C heat index, calculated from ${weather.temperature.toFixed(1)}°C air temperature and ${weather.humidity}% relative humidity. This is a screening guide, not an official local warning.`
}
