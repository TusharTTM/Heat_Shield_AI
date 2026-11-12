import type { AirQualityData, AirQualityHour, SimpleRiskLevel, WeatherData } from '../types'
import { getSimpleRisk, riskFromHeatIndex } from './heat'
import { riskRecommendations } from './guidance'

export const US_AQI_METHOD_URL = 'https://www.airnow.gov/aqi/aqi-basics/'
export const AIR_QUALITY_MODEL_URL = 'https://open-meteo.com/en/docs/air-quality-api'
export const EUROPEAN_AQI_METHOD_URL = 'https://www.eea.europa.eu/en/topics/in-depth/air-pollution/european-air-quality-index'

export type UsAqiCategory = 'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous'
export type EuropeanAqiCategory = 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Extremely Poor'

export interface HazardIndicator {
  label: string
  value: string
  source: string
}

export interface HazardAssessment {
  id: 'heat' | 'air-quality'
  title: string
  level: SimpleRiskLevel
  category: string
  summary: string
  explanation: string
  recommendation: string
  source: string
  modelTime: string
  retrievedAt: string
  method: string
  methodUrl: string
  indicators: HazardIndicator[]
  forecastSummary: string
}

export interface AirQualityTrend {
  direction: 'rising' | 'falling' | 'steady' | 'unavailable'
  change: number | null
  next24Max: number | null
  peak: AirQualityHour | null
  first: AirQualityHour | null
  last: AirQualityHour | null
}

export interface UpcomingHazard {
  id: 'heat' | 'air-quality'
  title: string
  level: SimpleRiskLevel
  detail: string
  source: string
  recommendation: string
  modelTime: string
  validUntil: string
}

const riskRank: Record<SimpleRiskLevel, number> = { low: 0, moderate: 1, high: 2, extreme: 3 }

/**
 * One screening vocabulary, used everywhere a level is shown as text.
 *
 * The site maps three published scales (the NWS heat-index bands, US AQI and
 * European AQI) onto these four levels. Each scale has its own category names —
 * US AQI says "Good / Moderate / Unhealthy", the European scale says "Fair /
 * Poor", NWS says "Caution / Extreme Danger" — so a single set of labels has to
 * be a plain-language screening band rather than any one scale's wording. The
 * original category name always travels beside it, so nothing is lost.
 */
export const SCREENING_LABELS: Record<SimpleRiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  extreme: 'Extreme',
}

/** The band's route into official alert language, stated only where it is needed. */
export const OFFICIAL_ALERT_WORDING: Record<SimpleRiskLevel, string | null> = {
  low: null,
  moderate: 'Watch',
  high: 'Warning',
  extreme: 'Severe',
}

const statusLabels = SCREENING_LABELS
const weatherSource = 'Open-Meteo weather model'
const airSource = 'Open-Meteo Air Quality API · CAMS model'

export const aqiRecommendations: Record<UsAqiCategory, string> = {
  Good: 'Normal outdoor activity is generally reasonable. Check local station information if you are particularly sensitive to air pollution.',
  Moderate: 'People who are unusually sensitive to air pollution should monitor symptoms and consider reducing prolonged strenuous outdoor exertion.',
  'Unhealthy for Sensitive Groups': 'Children, older adults, pregnant people, and people with heart or lung disease should reduce prolonged or strenuous outdoor exertion.',
  Unhealthy: 'Reduce prolonged or strenuous outdoor exertion. Sensitive groups should avoid it and follow local public-health advice.',
  'Very Unhealthy': 'Avoid outdoor exertion and reduce exposure to outdoor air. Follow official local health guidance.',
  Hazardous: 'Remain indoors where possible, avoid outdoor exertion, and follow official local health or emergency guidance.',
}

export const europeanAqiRecommendations: Record<EuropeanAqiCategory, string> = {
  Good: 'Normal outdoor activity is generally reasonable. People with pollution sensitivity should still follow their clinician’s advice.',
  Fair: 'Most people can continue normal activity. Unusually sensitive people should monitor symptoms and consider reducing prolonged strenuous exertion.',
  Moderate: 'Sensitive groups should consider reducing prolonged or strenuous outdoor activity and monitor local official advice.',
  Poor: 'Reduce prolonged or strenuous outdoor exertion, especially for children, older adults, and people with heart or lung disease.',
  'Very Poor': 'Avoid strenuous outdoor activity and reduce exposure to outdoor air. Follow official local health guidance.',
  'Extremely Poor': 'Remain indoors where possible, avoid outdoor exertion, and follow official local health or emergency guidance.',
}

export function usAqiCategory(aqi: number): UsAqiCategory {
  if (!Number.isFinite(aqi) || aqi < 0) throw new RangeError('US AQI must be a finite non-negative value.')
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

export function riskFromUsAqi(aqi: number): SimpleRiskLevel {
  usAqiCategory(aqi)
  if (aqi <= 50) return 'low'
  if (aqi <= 150) return 'moderate'
  if (aqi <= 200) return 'high'
  return 'extreme'
}

export function europeanAqiCategory(aqi: number): EuropeanAqiCategory {
  if (!Number.isFinite(aqi) || aqi < 0) throw new RangeError('European AQI must be a finite non-negative value.')
  if (aqi <= 20) return 'Good'
  if (aqi <= 40) return 'Fair'
  if (aqi <= 60) return 'Moderate'
  if (aqi <= 80) return 'Poor'
  if (aqi <= 100) return 'Very Poor'
  return 'Extremely Poor'
}

export function riskFromEuropeanAqi(aqi: number): SimpleRiskLevel {
  europeanAqiCategory(aqi)
  if (aqi <= 40) return 'low'
  if (aqi <= 60) return 'moderate'
  if (aqi <= 80) return 'high'
  return 'extreme'
}

export function airQualityTrend(hours: AirQualityHour[], metric: 'usAqi' | 'europeanAqi' = 'usAqi'): AirQualityTrend {
  const available = hours.filter((hour): hour is AirQualityHour & Record<typeof metric, number> => hour[metric] !== null)
  const first = available[0] ?? null
  const last = available.length > 1 ? available[available.length - 1] : null
  const values = available.map((hour) => hour[metric])
  const next24Max = values.length ? Math.max(...values) : null
  const peak = next24Max === null ? null : available.find((hour) => hour[metric] === next24Max) ?? null
  if (!first || !last) return { direction: 'unavailable', change: null, next24Max, peak, first, last }
  const change = Math.round((last[metric] - first[metric]) * 10) / 10
  return {
    direction: change >= 10 ? 'rising' : change <= -10 ? 'falling' : 'steady', change,
    next24Max, peak, first, last,
  }
}

export function assessHeat(weather: WeatherData): HazardAssessment {
  const level = getSimpleRisk(weather.risk)
  const category = level[0].toUpperCase() + level.slice(1)
  const forecastDays = weather.forecast.filter((day) => day.heatIndexMax !== null && day.heatIndexMax !== undefined)
  let consecutiveHotDays = 0
  for (const day of forecastDays) {
    if ((day.heatIndexMax ?? 0) < 33) break
    consecutiveHotDays += 1
  }
  const peak = forecastDays.length > 0 ? forecastDays.reduce((highest, day) => (day.heatIndexMax ?? Number.NEGATIVE_INFINITY) > (highest.heatIndexMax ?? Number.NEGATIVE_INFINITY) ? day : highest) : null
  const forecastTemperature = weather.forecast.length > 0 ? Math.max(...weather.forecast.map((day) => day.max)) : null
  const explanation = `${category} screening risk uses a ${weather.heatIndex.toFixed(1)}°C heat index, calculated from ${weather.temperature.toFixed(1)}°C model-estimated temperature and ${weather.humidity}% relative humidity. This is not an official warning, physical sensor reading, or ML prediction.`
  return {
    id: 'heat', title: 'Heatwave & extreme heat indicators', level, category,
    summary: `${category} current heat-index screening`,
    explanation, recommendation: riskRecommendations[level], source: weatherSource,
    modelTime: weather.observedAt, retrievedAt: weather.retrievedAt,
    method: 'NOAA/NWS heat-index regression with rounded screening bands. High includes the underlying Severe band. Forecast hot-day counts are not official IMD heatwave declarations.',
    methodUrl: 'https://www.weather.gov/safety/heat-tools',
    indicators: [
      { label: 'Current temperature', value: `${weather.temperature.toFixed(1)}°C`, source: weatherSource },
      { label: 'Feels like', value: `${weather.apparentTemperature.toFixed(1)}°C`, source: weatherSource },
      { label: 'Calculated heat index', value: `${weather.heatIndex.toFixed(1)}°C`, source: 'NOAA/NWS regression from model temperature and humidity' },
      { label: 'Consecutive high-heat days', value: forecastDays.length === weather.forecast.length ? `${consecutiveHotDays} forecast ${consecutiveHotDays === 1 ? 'day' : 'days'} at or above 33°C heat index` : 'Hourly humidity data unavailable for a complete five-day count', source: 'Open-Meteo hourly model + deterministic 33°C screening boundary' },
      { label: 'Five-day maximum temperature', value: forecastTemperature === null ? 'Unavailable' : `${forecastTemperature.toFixed(1)}°C`, source: weatherSource },
    ],
    forecastSummary: peak?.heatIndexMax != null ? `${peak.fullLabel} has the highest modelled daily heat index at ${peak.heatIndexMax.toFixed(1)}°C. This is a forecast screening signal, not an official heatwave warning.` : 'Daily heat-index maxima are unavailable because hourly temperature/humidity pairs are incomplete.',
  }
}

export function assessAirQuality(air: AirQualityData): HazardAssessment | null {
  if (air.usAqi === null && air.europeanAqi === null) return null
  const usCategory = air.usAqi === null ? null : usAqiCategory(air.usAqi)
  const europeanCategory = air.europeanAqi === null ? null : europeanAqiCategory(air.europeanAqi)
  const usLevel = air.usAqi === null ? null : riskFromUsAqi(air.usAqi)
  const europeanLevel = air.europeanAqi === null ? null : riskFromEuropeanAqi(air.europeanAqi)
  const level = [usLevel, europeanLevel].filter((value): value is SimpleRiskLevel => value !== null)
    .reduce<SimpleRiskLevel>((highest, value) => riskRank[value] > riskRank[highest] ? value : highest, 'low')
  const usTrend = airQualityTrend(air.hourly, 'usAqi')
  const europeanTrend = airQualityTrend(air.hourly, 'europeanAqi')
  const trendText = usTrend.change === null ? 'A 24-hour US AQI trend is unavailable.' : `Modelled US AQI changes by ${usTrend.change > 0 ? '+' : ''}${usTrend.change.toFixed(1)} over the available hourly outlook (${usTrend.direction}).`
  const summaryParts = [
    air.usAqi === null ? null : `${usCategory} · US AQI ${air.usAqi.toFixed(0)}`,
    air.europeanAqi === null ? null : `${europeanCategory} · European AQI ${air.europeanAqi.toFixed(0)}`,
  ].filter((value): value is string => value !== null)
  const recommendation = europeanLevel && (!usLevel || riskRank[europeanLevel] > riskRank[usLevel])
    ? europeanAqiRecommendations[europeanCategory as EuropeanAqiCategory]
    : aqiRecommendations[usCategory as UsAqiCategory]
  return {
    id: 'air-quality', title: 'Air pollution', level, category: summaryParts.join(' / '),
    summary: summaryParts.join(' · '),
    explanation: `The screening level is the more severe of the available US and European AQI mappings. ${summaryParts.join('; ')}. Both indices are Open-Meteo/CAMS model estimates. Neither is a CPCB monitoring-station observation, an Indian CPCB AQI value, or an official health warning.`,
    recommendation, source: airSource,
    modelTime: air.modelTime, retrievedAt: air.retrievedAt,
    method: 'US AQI screening: 0–50 Low, 51–150 Moderate, 151–200 High, above 200 Extreme. European AQI screening: 0–40 Low, 41–60 Moderate, 61–80 High, above 80 Extreme. Detailed AirNow and European Environment Agency categories remain visible; these are deterministic display mappings, not AI analysis.',
    methodUrl: AIR_QUALITY_MODEL_URL,
    indicators: [
      { label: 'US AQI', value: air.usAqi === null ? 'Unavailable' : `${air.usAqi.toFixed(0)} · ${usCategory}`, source: airSource },
      { label: 'European AQI', value: air.europeanAqi === null ? 'Unavailable' : `${air.europeanAqi.toFixed(0)} · ${europeanCategory}`, source: airSource },
      { label: 'PM2.5', value: pollutant(air.pm2_5), source: airSource },
      { label: 'PM10', value: pollutant(air.pm10), source: airSource },
      { label: 'Nitrogen dioxide (NO₂)', value: pollutant(air.nitrogenDioxide), source: airSource },
      { label: 'Ozone (O₃)', value: pollutant(air.ozone), source: airSource },
      { label: 'Sulphur dioxide (SO₂)', value: pollutant(air.sulphurDioxide), source: airSource },
      { label: 'Carbon monoxide (CO)', value: pollutant(air.carbonMonoxide), source: airSource },
    ],
    forecastSummary: `${trendText}${usTrend.next24Max !== null ? ` Peak modelled US AQI: ${usTrend.next24Max.toFixed(0)}${usTrend.peak ? ` around ${formatModelHour(usTrend.peak.modelTime)}` : ''}.` : ''}${europeanTrend.next24Max !== null ? ` Peak modelled European AQI: ${europeanTrend.next24Max.toFixed(0)}${europeanTrend.peak ? ` around ${formatModelHour(europeanTrend.peak.modelTime)}` : ''}.` : ''} Forecast indices and pollutants remain modelled, not station-observed.`,
  }
}

function pollutant(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(1)} µg/m³`
}

export function buildEnvironmentalScreening(weather: WeatherData | null, air: AirQualityData | null) {
  const hazards = [weather ? assessHeat(weather) : null, air ? assessAirQuality(air) : null].filter((item): item is HazardAssessment => item !== null)
  const highest = hazards.length > 0 ? hazards.reduce((current, item) => riskRank[item.level] > riskRank[current.level] ? item : current) : null
  const completeness = hazards.length === 2 ? 'complete' as const : hazards.length === 1 ? 'partial' as const : 'unavailable' as const
  return {
    level: highest?.level ?? null,
    label: !highest ? 'Unavailable' : completeness === 'partial' && highest.level === 'low' ? 'Status incomplete' : statusLabels[highest.level],
    completeness,
    reasons: hazards.map((hazard) => hazard.summary),
    hazards,
    officialWarningsIncluded: false,
  }
}

export function upcomingHazards(weather: WeatherData | null, air: AirQualityData | null): UpcomingHazard[] {
  const upcoming: UpcomingHazard[] = []
  const availableHeatDays = weather?.forecast.filter((day) => day.heatIndexMax !== null && day.heatIndexMax !== undefined) ?? []
  const heatDays = availableHeatDays.filter((day) => (day.heatIndexMax ?? 0) >= 33)
  if (heatDays.length > 0) {
    const peak = heatDays.reduce((highest, day) => (day.heatIndexMax ?? 0) > (highest.heatIndexMax ?? 0) ? day : highest)
    const heatIndex = peak.heatIndexMax ?? 33
    upcoming.push({
      id: 'heat', title: 'High heat-index forecast signal', level: getSimpleRisk(riskFromHeatIndex(heatIndex)),
      detail: `${peak.fullLabel}: modelled daily heat index up to ${heatIndex.toFixed(1)}°C. ${heatDays.length} of ${availableHeatDays.length} available forecast days meet or exceed the 33°C high-screening boundary.${availableHeatDays.length < (weather?.forecast.length ?? 0) ? ` ${((weather?.forecast.length ?? 0) - availableHeatDays.length)} forecast ${((weather?.forecast.length ?? 0) - availableHeatDays.length) === 1 ? 'day is' : 'days are'} unavailable.` : ''}`,
      source: 'Open-Meteo hourly forecast + NOAA/NWS screening · not an IMD warning',
      recommendation: riskRecommendations[getSimpleRisk(riskFromHeatIndex(heatIndex))],
      modelTime: weather?.observedAt ?? `${peak.date}T00:00:00+05:30`, validUntil: `${peak.date}T23:59:59+05:30`,
    })
  }
  if (air) {
    const usTrend = airQualityTrend(air.hourly, 'usAqi')
    const europeanTrend = airQualityTrend(air.hourly, 'europeanAqi')
    const usLevel = usTrend.next24Max === null ? null : riskFromUsAqi(usTrend.next24Max)
    const europeanLevel = europeanTrend.next24Max === null ? null : riskFromEuropeanAqi(europeanTrend.next24Max)
    const level = [usLevel, europeanLevel].filter((value): value is SimpleRiskLevel => value !== null)
      .reduce<SimpleRiskLevel>((highest, value) => riskRank[value] > riskRank[highest] ? value : highest, 'low')
    const last = [usTrend.last, europeanTrend.last].filter((value): value is AirQualityHour => value !== null)
      .sort((a, b) => b.modelTime.localeCompare(a.modelTime))[0]
    if (level !== 'low' && last) {
      const peaks = [
        usTrend.next24Max === null ? null : `US AQI ${usTrend.next24Max.toFixed(0)}${usTrend.peak ? ` around ${formatModelHour(usTrend.peak.modelTime)}` : ''}`,
        europeanTrend.next24Max === null ? null : `European AQI ${europeanTrend.next24Max.toFixed(0)}${europeanTrend.peak ? ` around ${formatModelHour(europeanTrend.peak.modelTime)}` : ''}`,
      ].filter((value): value is string => value !== null).join(' and ')
      upcoming.push({
        id: 'air-quality', title: 'Modelled air pollution may increase', level,
        detail: `The available hourly CAMS outlook peaks at ${peaks}. This is a model forecast, not a CPCB station alert.`,
        source: airSource, recommendation: europeanLevel && (!usLevel || riskRank[europeanLevel] > riskRank[usLevel])
          ? europeanAqiRecommendations[europeanAqiCategory(europeanTrend.next24Max as number)]
          : aqiRecommendations[usAqiCategory(usTrend.next24Max as number)],
        modelTime: air.modelTime, validUntil: last.modelTime,
      })
    }
  }
  return upcoming.sort((a, b) => riskRank[b.level] - riskRank[a.level])
}

function formatModelHour(timestamp: string): string {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(timestamp))
  return `${formatted} IST`
}
