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

// Mirrors backend/app/schemas.py AssistantContextItem limits. The backend
// rejects line breaks in these fields (a newline could forge an extra
// "[OFFICIAL WARNING]" row in the prompt), and official CAP text routinely
// contains them, so normalise here rather than letting a legal alert fail.
const LABEL_LIMIT = 120
const VALUE_LIMIT = 400
const SOURCE_LIMIT = 200
const CONTEXT_LIMIT = 16
const OFFICIAL_ALERT_LIMIT = 3

function singleLine(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1).trimEnd()}…`
}

function item(
  label: string,
  value: string,
  evidenceType: AssistantContextItem['evidence_type'],
  source: string,
  observedAt: string | null,
  freshness: AssistantFreshness,
): AssistantContextItem {
  return {
    label: singleLine(label, LABEL_LIMIT),
    value: singleLine(value, VALUE_LIMIT),
    evidence_type: evidenceType,
    source: singleLine(source, SOURCE_LIMIT),
    observed_at: observedAt,
    freshness,
  }
}

function forecastLine(day: WeatherData['forecast'][number] | undefined, formatTemp: (c: number) => string, tempSymbol: string): string | null {
  if (!day) return null
  const range = `${formatTemp(day.max)}${tempSymbol} / ${formatTemp(day.min)}${tempSymbol}`
  return day.condition ? `${day.fullLabel}: ${range}, ${day.condition}` : `${day.fullLabel}: ${range}`
}

const EVIDENCE_PRIORITY: Record<AssistantContextItem['evidence_type'], number> = {
  'official-warning': 0,
  'weather-model': 1,
  'air-quality-model': 2,
  'app-state': 3,
}

function priority(contextItem: AssistantContextItem): number {
  // The "omitted official warnings" notice is app-state evidence (it is not an
  // official warning) but it qualifies the official list, so it must outrank
  // ordinary app-state notes and survive the cap next to the warnings themselves.
  if (contextItem.label === 'Official warnings omitted') return 0.5
  return EVIDENCE_PRIORITY[contextItem.evidence_type] ?? 4
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
    const alerts = official.data.alerts.slice(0, OFFICIAL_ALERT_LIMIT)
    if (official.data.alerts.length > alerts.length) {
      // Never let a shortened list read like the complete official picture.
      items.push(item(
        'Official warnings omitted',
        `Only the first ${alerts.length} of ${official.data.alerts.length} active official alerts are summarised here; the full list is on the app's official panel.`,
        'app-state', APP_SOURCE, official.data.retrievedAt, 'unknown',
      ))
    }
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
      'Official warnings are not being retrieved right now, so no official alert list is available. Absence of alerts is not an all-clear.',
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

  if (items.length <= CONTEXT_LIMIT) return items
  // Say so when the block is shortened instead of silently dropping conditions.
  // Official warnings and model readings are safety-critical, so they survive the
  // cap; a single notice reports exactly how many conditions were left out.
  const byPriority = items
    .map((contextItem, index) => ({ contextItem, index }))
    .sort((a, b) => priority(a.contextItem) - priority(b.contextItem) || a.index - b.index)
    .map(({ contextItem }) => contextItem)
  const kept = byPriority.slice(0, CONTEXT_LIMIT - 1)
  const omittedCount = items.length - kept.length
  kept.push(item(
    'Conditions omitted',
    `${omittedCount} of ${items.length} conditions were omitted from this summary because of the request size limit. Ask about one metric at a time for detail.`,
    'app-state', APP_SOURCE, null, 'unknown',
  ))
  return kept
}
