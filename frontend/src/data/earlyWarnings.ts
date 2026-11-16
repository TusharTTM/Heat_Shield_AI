import type { AirQualityData, SimpleRiskLevel, WeatherData } from '../types'
import { getSimpleRisk, riskFromHeatIndex } from './heat'
import { airQualityTrend, riskFromEuropeanAqi, riskFromUsAqi } from './hazards'

/**
 * Early-warning engine for the Profile → Heat alerts preferences.
 *
 * It turns forecast and model signals into short "heads-up" warnings that match
 * the user's alert types and lead time. These are screening signals, never
 * official warnings; the situation alert on the dashboard keeps showing official
 * and model screening regardless of these preferences.
 */

export type EarlyWarningType = 'extremeHeat' | 'heatIndex' | 'airQuality' | 'official' | 'hotNights'

export interface EarlyWarning {
  id: string
  type: EarlyWarningType
  level: SimpleRiskLevel
  title: string
  detail: string
  /** When the risky period begins (ISO). In the past means it is ongoing. */
  onset: string
  /** When the warning stops being relevant (ISO). */
  validUntil: string
  source: string
}

export interface OfficialAlertsLike {
  status?: string
  data?: {
    alerts: Array<{
      headline?: string | null
      event?: string | null
      onset?: string | null
      expires?: string | null
      level?: string | null
    }>
  } | null
}

export interface EarlyWarningInputs {
  weather: WeatherData | null
  air: AirQualityData | null
  officialAlerts?: OfficialAlertsLike | null
}

export interface EarlyWarningPreferences {
  earlyWarnings: boolean
  leadHours: number
  types: Record<EarlyWarningType, boolean>
}

/** Heat-index band boundaries in °C, same rounded screening bands as the UI. */
const RISKY_HEAT_INDEX = 27
const HIGH_HEAT_INDEX = 33
/** A night that stays too warm to recover: minimum temperature at or above this. */
const HOT_NIGHT_MINIMUM = 25

const riskRank: Record<SimpleRiskLevel, number> = { low: 0, moderate: 1, high: 2, extreme: 3 }

function istHour(date: string, hour: number, minute = 0): string {
  const parsed = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function inWindow(now: Date, onset: string, validUntil: string, leadHours: number): boolean {
  if (!onset || !validUntil) return false
  const start = Date.parse(onset)
  const end = Date.parse(validUntil)
  const nowMs = now.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  // Visible once the lead horizon reaches the onset, until the risk period ends.
  return nowMs >= start - leadHours * 3_600_000 && nowMs <= end
}

function heatWarning(
  id: string,
  type: EarlyWarningType,
  value: number,
  title: string,
  detail: string,
  onset: string,
  validUntil: string,
): EarlyWarning {
  return {
    id,
    type,
    level: getSimpleRisk(riskFromHeatIndex(value)),
    title,
    detail,
    onset,
    validUntil,
    source: 'Open-Meteo model + NOAA/NWS heat-index screening · not an IMD warning',
  }
}

/**
 * Builds the warnings matching the user's alert types and lead time.
 * Pure: pass `now` to make the lead-window decision deterministic in tests.
 */
export function buildEarlyWarnings(
  inputs: EarlyWarningInputs,
  preferences: EarlyWarningPreferences,
  now: Date = new Date(),
): EarlyWarning[] {
  if (!preferences.earlyWarnings) return []
  const { weather, air, officialAlerts } = inputs
  const warnings: EarlyWarning[] = []
  const nowIso = now.toISOString()
  const soon = new Date(now.getTime() + 6 * 3_600_000).toISOString()

  if (weather) {
    const currentHeatIndex = weather.heatIndex
    const forecastDays = weather.forecast.filter((day) => day.heatIndexMax !== null && day.heatIndexMax !== undefined)

    if (preferences.types.heatIndex) {
      if (currentHeatIndex >= RISKY_HEAT_INDEX) {
        warnings.push(heatWarning(
          'heat-index-ongoing', 'heatIndex', currentHeatIndex,
          'Feels-like temperature is in the risky band',
          `Calculated heat index ${currentHeatIndex.toFixed(1)}°C now (from ${weather.temperature.toFixed(1)}°C and ${weather.humidity}% humidity).`,
          weather.observedAt, soon,
        ))
      } else {
        const firstRisky = forecastDays.find((day) => (day.heatIndexMax ?? 0) >= RISKY_HEAT_INDEX)
        if (firstRisky && firstRisky.heatIndexMax != null) {
          warnings.push(heatWarning(
            'heat-index-forecast', 'heatIndex', firstRisky.heatIndexMax,
            'Feels-like temperature expected to turn risky',
            `${firstRisky.fullLabel}: modelled heat index up to ${firstRisky.heatIndexMax.toFixed(1)}°C.`,
            istHour(firstRisky.date, 11), istHour(firstRisky.date, 23, 59),
          ))
        }
      }
    }

    if (preferences.types.extremeHeat) {
      if (currentHeatIndex >= HIGH_HEAT_INDEX) {
        warnings.push(heatWarning(
          'extreme-heat-ongoing', 'extremeHeat', currentHeatIndex,
          'High heat index right now',
          `Calculated heat index ${currentHeatIndex.toFixed(1)}°C is at or above the ${HIGH_HEAT_INDEX}°C high-screening boundary.`,
          weather.observedAt, soon,
        ))
      } else {
        const firstHigh = forecastDays.find((day) => (day.heatIndexMax ?? 0) >= HIGH_HEAT_INDEX)
        if (firstHigh && firstHigh.heatIndexMax != null) {
          warnings.push(heatWarning(
            'extreme-heat-forecast', 'extremeHeat', firstHigh.heatIndexMax,
            'High heat index forecast',
            `${firstHigh.fullLabel}: modelled heat index up to ${firstHigh.heatIndexMax.toFixed(1)}°C, at or above the ${HIGH_HEAT_INDEX}°C high-screening boundary.`,
            istHour(firstHigh.date, 11), istHour(firstHigh.date, 23, 59),
          ))
        }
      }
    }

    if (preferences.types.hotNights) {
      weather.forecast.slice(0, 2).forEach((day, index) => {
        if (day.min < HOT_NIGHT_MINIMUM) return
        warnings.push({
          id: `hot-night-${index}`,
          type: 'hotNights',
          level: day.min >= 28 ? 'high' : 'moderate',
          title: index === 0 ? 'Hot night expected tonight' : 'Hot night expected tomorrow',
          detail: `${day.fullLabel}: modelled overnight minimum ${day.min.toFixed(1)}°C — too warm to fully recover.`,
          onset: istHour(day.date, 21),
          validUntil: istHour(day.date, 23, 59),
          source: 'Open-Meteo model forecast · not an IMD warning',
        })
      })
    }
  }

  if (preferences.types.airQuality && air) {
    const usLevel = air.usAqi === null ? null : riskFromUsAqi(air.usAqi)
    const euLevel = air.europeanAqi === null ? null : riskFromEuropeanAqi(air.europeanAqi)
    const currentLevel = [usLevel, euLevel].filter((value): value is SimpleRiskLevel => value !== null)
      .reduce<SimpleRiskLevel>((highest, value) => riskRank[value] > riskRank[highest] ? value : highest, 'low')
    const usTrend = airQualityTrend(air.hourly, 'usAqi')
    const euTrend = airQualityTrend(air.hourly, 'europeanAqi')
    const peakLevel = [
      usTrend.next24Max === null ? null : riskFromUsAqi(usTrend.next24Max),
      euTrend.next24Max === null ? null : riskFromEuropeanAqi(euTrend.next24Max),
    ].filter((value): value is SimpleRiskLevel => value !== null)
      .reduce<SimpleRiskLevel>((highest, value) => riskRank[value] > riskRank[highest] ? value : highest, 'low')

    if (currentLevel !== 'low') {
      warnings.push({
        id: 'air-quality-ongoing',
        type: 'airQuality',
        level: currentLevel,
        title: 'Air quality in the unhealthy screening band',
        detail: `Modelled ${air.usAqi !== null ? `US AQI ${air.usAqi.toFixed(0)}` : `European AQI ${(air.europeanAqi ?? 0).toFixed(0)}`} now. Model estimate, not a CPCB station reading.`,
        onset: air.modelTime,
        validUntil: usTrend.last?.modelTime ?? euTrend.last?.modelTime ?? soon,
        source: 'Open-Meteo/CAMS air-quality model · not a CPCB alert',
      })
    } else if (peakLevel !== 'low') {
      const peakHour = usTrend.peak?.modelTime ?? euTrend.peak?.modelTime
      const peakValue = usTrend.next24Max !== null ? `US AQI ${usTrend.next24Max.toFixed(0)}` : `European AQI ${(euTrend.next24Max ?? 0).toFixed(0)}`
      // The lead window counts from when air first leaves the low band, not
      // from the peak — the warning should precede the deterioration.
      const crossing = air.hourly.find((hour) => {
        const us = hour.usAqi === null || hour.usAqi === undefined ? null : riskFromUsAqi(hour.usAqi)
        const eu = hour.europeanAqi === null || hour.europeanAqi === undefined ? null : riskFromEuropeanAqi(hour.europeanAqi)
        return [us, eu].some((value) => value !== null && value !== 'low')
      })
      warnings.push({
        id: 'air-quality-forecast',
        type: 'airQuality',
        level: peakLevel,
        title: 'Air quality expected to worsen',
        detail: `The hourly CAMS outlook peaks at ${peakValue}${peakHour ? ` around ${peakHour.slice(11, 16)}` : ''}. Model estimate, not a CPCB station alert.`,
        onset: crossing?.modelTime ?? peakHour ?? nowIso,
        validUntil: usTrend.last?.modelTime ?? euTrend.last?.modelTime ?? soon,
        source: 'Open-Meteo/CAMS air-quality model · not a CPCB alert',
      })
    }
  }

  if (preferences.types.official && officialAlerts?.data?.alerts?.length) {
    for (const alert of officialAlerts.data.alerts.slice(0, 2)) {
      const level: SimpleRiskLevel = alert.level === 'low' || alert.level === 'moderate' || alert.level === 'extreme'
        ? alert.level
        : 'high'
      warnings.push({
        id: `official-${alert.event ?? alert.headline ?? 'alert'}`,
        type: 'official',
        level,
        title: alert.event ?? 'Official warning active',
        detail: alert.headline ?? 'An official warning is active for your area.',
        onset: alert.onset ?? nowIso,
        validUntil: alert.expires ?? new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        source: 'Official government feed',
      })
    }
  }

  return warnings
    .filter((warning) => preferences.types[warning.type] && inWindow(now, warning.onset, warning.validUntil, preferences.leadHours))
    .sort((a, b) => riskRank[b.level] - riskRank[a.level] || Date.parse(a.onset) - Date.parse(b.onset))
}
