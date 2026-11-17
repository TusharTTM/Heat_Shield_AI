/**
 * Builds the city-level conditions block sent to the assistant service.
 *
 * Every item carries its evidence type, source name and data time so replies
 * can attribute values and separate model estimates from official warnings.
 * Only what the app already displays is included — no profile name, email, or
 * device location ever enters this payload.
 */

import type { AssistantContextItem, AssistantFreshness } from '../api/assistant'
import type { OfficialAlertsData } from '../api/official'
import type { AirQualityData, WeatherData } from '../types'
import { assessAirQuality, assessHeat, europeanAqiCategory, usAqiCategory } from './hazards'

const WEATHER_SOURCE = 'Open-Meteo (weather model)'
const AIR_SOURCE = 'Open-Meteo Air Quality API (CAMS model estimate)'
const SACHET_SOURCE = 'NDMA SACHET (official CAP feed)'
const APP_SOURCE = 'Heat Shield configuration'

export interface OfficialWarningState {
  status: 'unconfigured' | 'loading' | 'ready' | 'error'
  data: OfficialAlertsData | null
}

export interface AssistantContextInput {
  weather: WeatherData | null
  weatherFreshness: 'current' | 'stale'
  airQuality: AirQualityData | null
  airFreshness: 'current' | 'stale'
  official: OfficialWarningState
  formatTemp: (celsius: number, digits?: number) => string
  tempSymbol: string
}

function item(
  label: string,
  value: string,
  evidenceType: AssistantContextItem['evidence_type'],
  source: string,
  observedAt: string | null,
  freshness: AssistantFreshness,
): AssistantContextItem {
  return { label, value, evidence_type: evidenceType, source, observed_at: observedAt, freshness }
}

function forecastLine(day: WeatherData['forecast'][number] | undefined, formatTemp: (c: number) => string, tempSymbol: string): string | null {
  if (!day) return null
  const range = `${formatTemp(day.max)}${tempSymbol} / ${formatTemp(day.min)}${tempSymbol}`
  return day.condition ? `${day.fullLabel}: ${range}, ${day.condition}` : `${day.fullLabel}: ${range}`
}

export function buildAssistantContext(input: AssistantContextInput): AssistantContextItem[] {
  const items: AssistantContextItem[] = []
  const { weather, airQuality, official, formatTemp, tempSymbol } = input

  if (weather) {
    const freshness = input.weatherFreshness
    items.push(
      item('Temperature', `${formatTemp(weather.temperature)} ${tempSymbol}`, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
      item('Feels like (apparent temperature)', `${formatTemp(weather.apparentTemperature)} ${tempSymbol}`, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
      item('Heat index (shade)', `${formatTemp(weather.heatIndex)} ${tempSymbol}`, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
      item('Heat-index screening', assessHeat(weather).level, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
      item('Humidity', `${Math.round(weather.humidity)} %`, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
      item('Wind speed', `${Math.round(weather.windSpeed)} km/h`, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
      item('Sky conditions', weather.condition, 'weather-model', WEATHER_SOURCE, weather.observedAt, freshness),
    )
    const today = forecastLine(weather.forecast[0], (c) => formatTemp(c), tempSymbol)
    const tomorrow = forecastLine(weather.forecast[1], (c) => formatTemp(c), tempSymbol)
    if (today) items.push(item('Forecast for today', today, 'weather-model', WEATHER_SOURCE, weather.retrievedAt, freshness))
    if (tomorrow) items.push(item('Forecast for tomorrow', tomorrow, 'weather-model', WEATHER_SOURCE, weather.retrievedAt, freshness))
  } else {
    items.push(item('Weather readings', 'Not available in the app right now', 'app-state', APP_SOURCE, null, 'unknown'))
  }

  if (airQuality) {
    const freshness = input.airFreshness
    const usCategory = airQuality.usAqi == null ? null : usAqiCategory(airQuality.usAqi)
    const euCategory = airQuality.europeanAqi == null ? null : europeanAqiCategory(airQuality.europeanAqi)
    if (airQuality.usAqi != null) {
      items.push(item('US AQI (model estimate)', `${Math.round(airQuality.usAqi)}${usCategory ? ` — ${usCategory}` : ''}`, 'air-quality-model', AIR_SOURCE, airQuality.modelTime, freshness))
    }
    if (airQuality.europeanAqi != null) {
      items.push(item('European AQI (model estimate)', `${Math.round(airQuality.europeanAqi)}${euCategory ? ` — ${euCategory}` : ''}`, 'air-quality-model', AIR_SOURCE, airQuality.modelTime, freshness))
    }
    if (airQuality.pm2_5 != null) {
      items.push(item('PM2.5 (model estimate)', `${airQuality.pm2_5} µg/m³`, 'air-quality-model', AIR_SOURCE, airQuality.modelTime, freshness))
    }
    const assessment = assessAirQuality(airQuality)
    if (assessment) {
      items.push(item('Air-quality screening', assessment.level, 'air-quality-model', AIR_SOURCE, airQuality.modelTime, freshness))
    }
  } else {
    items.push(item('Air-quality readings', 'Not available in the app right now', 'app-state', APP_SOURCE, null, 'unknown'))
  }

  if (official.status === 'ready' && official.data) {
    const alerts = official.data.alerts.slice(0, 3)
    if (alerts.length === 0) {
      items.push(item(
        'Official government warnings',
        `No active SACHET alerts retrieved for this area at ${official.data.retrievedAt}. This is not an all-clear.`,
        'app-state', APP_SOURCE, official.data.retrievedAt, 'unknown',
      ))
    }
    for (const alert of alerts) {
      items.push(item(
        `Official SACHET alert: ${alert.event ?? alert.headline ?? 'government warning'}`,
        `${alert.headline ?? alert.description ?? 'Active official alert'} (severity: ${alert.severity ?? 'unspecified'})`,
        'official-warning', SACHET_SOURCE, alert.sent ?? official.data.retrievedAt, 'current',
      ))
    }
  } else if (official.status === 'unconfigured') {
    items.push(item(
      'Official government warnings',
      'Government feed not connected on this static site — no official alert list is available. Absence of alerts is not an all-clear.',
      'app-state', APP_SOURCE, null, 'unknown',
    ))
  } else if (official.status === 'error') {
    items.push(item(
      'Official government warnings',
      'The government warning feed could not be retrieved just now. Treat warning status as unknown.',
      'app-state', APP_SOURCE, null, 'unknown',
    ))
  } else {
    items.push(item(
      'Official government warnings',
      'The government warning feed is being checked.',
      'app-state', APP_SOURCE, null, 'unknown',
    ))
  }

  return items.slice(0, 16)
}
