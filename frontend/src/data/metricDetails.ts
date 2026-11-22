/**
 * Metric detail views — deterministic assembly of per-metric, per-day hourly
 * series from the data the app already fetches (Open-Meteo forecast model,
 * Open-Meteo Historical reanalysis, Open-Meteo/CAMS air-quality model).
 *
 * Rules: never invent values — a missing reading stays null and is shown as
 * unavailable; derived quantities (shade heat index, screening bands) use the
 * same pure functions as the rest of the app and are labelled as modelled
 * screening, not observations or medical advice.
 */

import type {
  AirQualityData, AirQualityHour, HistoricalData, MetricHourPoint, SimpleRiskLevel, WeatherData,
} from '../types'
import type { MessageKey } from '../i18n'
import { riskFromEuropeanAqi, riskFromUsAqi, usAqiCategory } from './hazards'
import { getSimpleRisk, heatIndexC, riskFromHeatIndex } from './heat'

export type MetricId = 'temperature' | 'heat-index' | 'humidity' | 'uv-index' | 'air-quality'
export type DayId = 'yesterday' | 'today' | 'tomorrow'

export const METRIC_ORDER: MetricId[] = ['temperature', 'heat-index', 'humidity', 'uv-index', 'air-quality']

export const DAY_ORDER: DayId[] = ['yesterday', 'today', 'tomorrow']

/** i18n title keys per metric — shared by the detail page headings and document titles. */
export const METRIC_TITLE_KEYS: Record<MetricId, MessageKey> = {
  temperature: 'metric.temperature',
  'heat-index': 'metric.heatIndex',
  humidity: 'metric.humidity',
  'uv-index': 'metric.uvIndex',
  'air-quality': 'metric.airQuality',
}

/** i18n day labels — shared by the date tabs and document titles. */
export const DAY_TITLE_KEYS: Record<DayId, MessageKey> = {
  yesterday: 'detail.yesterday',
  today: 'detail.today',
  tomorrow: 'detail.tomorrow',
}

export function isMetricId(value: string | undefined): value is MetricId {
  return typeof value === 'string' && (METRIC_ORDER as string[]).includes(value)
}

export function isDayId(value: string | null | undefined): value is DayId {
  return value !== null && value !== undefined && (DAY_ORDER as string[]).includes(value)
}

export interface MetricDefinition {
  id: MetricId
  /** Short label used for aria/tooltip naming; the page title reuses the i18n metric.* keys. */
  chartLabel: string
  unit: 'temperature' | 'percent' | 'index' | 'aqi'
  whatItMeans: string
  safetyGuidance: string
}

/** Plain-language copy, English — matching the Safety page and glossary precedent. */
export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  temperature: {
    id: 'temperature',
    chartLabel: 'Air temperature',
    unit: 'temperature',
    whatItMeans: 'The air temperature 2 metres above ground at the selected city, as estimated by the weather model in shade.',
    safetyGuidance: 'Higher temperature raises heat-stress risk, especially for older adults, children, and outdoor workers. Plan strenuous work for cooler hours, drink water before feeling thirsty, and rest in shade often.',
  },
  'heat-index': {
    id: 'heat-index',
    chartLabel: 'Heat index (shade)',
    unit: 'temperature',
    whatItMeans: 'How hot the air feels to the human body when air temperature and humidity are combined in shade. Calculated with the NOAA/NWS Rothfusz regression (the same screening the dashboard uses).',
    safetyGuidance: 'Values in the high and extreme screening bands raise the risk of heat exhaustion and heat stroke. Take the heat-index screening seriously even when the air temperature looks moderate — humidity makes it feel much hotter.',
  },
  humidity: {
    id: 'humidity',
    chartLabel: 'Relative humidity',
    unit: 'percent',
    whatItMeans: 'Relative humidity — how much water vapour the air holds as a percentage of the maximum it could hold at that temperature.',
    safetyGuidance: 'High humidity slows sweat evaporation, so the body cools itself less effectively. On hot and humid hours, reduce physical effort, and prefer ventilated or cooled spaces.',
  },
  'uv-index': {
    id: 'uv-index',
    chartLabel: 'UV index',
    unit: 'index',
    whatItMeans: 'The WHO UV index scale for sunburn risk: 0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme. Modelled for the selected city by the weather model.',
    safetyGuidance: 'Around midday, seek shade, wear protective clothing, and use sunscreen on exposed skin. UV can be high even when it feels cool or cloudy — check the hourly values before planning time outdoors.',
  },
  'air-quality': {
    id: 'air-quality',
    chartLabel: 'US AQI',
    unit: 'aqi',
    whatItMeans: 'The US Air Quality Index (0–500) estimated by the CAMS atmospheric model via the Open-Meteo Air Quality API. Modelled grid estimates, not physical CPCB ground-station readings.',
    safetyGuidance: 'Higher AQI values mean more pollution. People with asthma or heart conditions, children, and older adults should limit prolonged outdoor exertion when AQI is in the unhealthy ranges, and consider a well-fitted mask on very poor days.',
  },
}

export interface MetricPointView {
  isoTime: string
  label: string
  /** Display value in the requested unit; null = the source has no reading (a gap, never zero). */
  value: number | null
  risk: SimpleRiskLevel | null
  /** Extra tooltip/table text (categories, secondary readings). */
  note: string | null
}

export interface MetricSummary {
  min: number | null
  max: number | null
  /** Current reading when the day is today; null otherwise. */
  current: number | null
  currentLabel: string | null
  /** Context line: 'So far today' / 'Full-day forecast' / 'Historical reanalysis'. */
  rangeLabel: string
}

export interface MetricDayView {
  metric: MetricId
  day: DayId
  unitLabel: string
  points: MetricPointView[]
  hasData: boolean
  gapCount: number
  summary: MetricSummary
  /**
   * Screening band for a derived risk series (heat index only). The retired
   * heat-risk page plotted this; it belongs here because it is a property of
   * the heat index, not a separate reading.
   */
  band: { worst: SimpleRiskLevel } | null
  source: string
  updatedAt: string | null
  unavailableReason: string | null
}

export interface MetricSources {
  weather: WeatherData | null
  air: AirQualityData | null
  history: HistoricalData | null
}

export interface ValueFormat {
  /** Convert a base-unit value (°C) for display (temperature unit setting). */
  convert: (celsius: number) => number
  /** Unit suffix after conversion, e.g. '°C' or '°F'. */
  temperatureSymbol: string
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

/** The model's own calendar day (never the device clock) — consistent with daily forecast dates. */
export function resolveDayDates(weather: WeatherData | null, air: AirQualityData | null): Record<DayId, string> {
  const base = weather?.forecast[0]?.date
    ?? (weather ? weather.observedAt.slice(0, 10) : null)
    ?? (air ? new Date(new Date(air.modelTime).getTime() + 19800e3).toISOString().slice(0, 10) : null)
    ?? new Date().toISOString().slice(0, 10)
  return { yesterday: addDays(base, -1), today: base, tomorrow: addDays(base, 1) }
}

function weatherPointsForDate(weather: WeatherData | null, date: string): MetricHourPoint[] {
  if (!weather) return []
  const series = weather.hourlySeries && weather.hourlySeries.length > 0
    ? weather.hourlySeries
    : (weather.next24Hours ?? []).map((hour) => ({ isoTime: hour.isoTime, label: hour.label, temperature: hour.temperature, humidity: hour.humidity, uvIndex: null }))
  return series.filter((point) => point.isoTime.slice(0, 10) === date)
}

function historyPointsForDate(history: HistoricalData | null, date: string): MetricHourPoint[] {
  if (!history) return []
  return (history.hourly ?? []).filter((point) => point.isoTime.slice(0, 10) === date)
}

function airPointsForDate(air: AirQualityData | null, date: string): AirQualityHour[] {
  if (!air) return []
  const series = air.hourlySeries && air.hourlySeries.length > 0 ? air.hourlySeries : air.hourly
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
  return series.filter((hour) => formatter.format(new Date(hour.modelTime)) === date)
}

export function uvCategory(value: number): string {
  if (value < 3) return 'Low'
  if (value < 6) return 'Moderate'
  if (value < 8) return 'High'
  if (value < 11) return 'Very high'
  return 'Extreme'
}

function unitLabelFor(definition: MetricDefinition, format: ValueFormat): string {
  if (definition.unit === 'temperature') return format.temperatureSymbol
  if (definition.unit === 'percent') return '%'
  if (definition.unit === 'index') return 'UV index'
  return 'US AQI'
}

function displayValue(definition: MetricDefinition, value: number, format: ValueFormat): number {
  return definition.unit === 'temperature' ? format.convert(value) : value
}

function heatIndexPoint(point: MetricHourPoint): { value: number | null; risk: SimpleRiskLevel | null } {
  if (point.temperature === null || point.humidity === null) return { value: null, risk: null }
  const heatIndex = heatIndexC(point.temperature, point.humidity)
  return { value: heatIndex, risk: getSimpleRisk(riskFromHeatIndex(heatIndex)) }
}

function noteForWeatherPoint(metric: MetricId, point: MetricHourPoint, value: number | null, format: ValueFormat): string | null {
  if (metric === 'heat-index') {
    const { risk } = heatIndexPoint(point)
    return risk ? `${risk[0].toUpperCase()}${risk.slice(1)} screening` : 'Not screened (humidity missing)'
  }
  if (metric === 'uv-index') return value === null ? null : uvCategory(value)
  if (metric === 'temperature' && point.humidity !== null) return `Humidity ${Math.round(point.humidity)}%`
  if (metric === 'humidity' && point.temperature !== null) return `Air temperature ${format.convert(point.temperature).toFixed(1)}${format.temperatureSymbol}`
  return null
}

function noteForAirPoint(hour: AirQualityHour): string | null {
  const parts: string[] = []
  if (hour.usAqi !== null) parts.push(usAqiCategory(hour.usAqi))
  if (hour.europeanAqi !== null) parts.push(`EU AQI ${Math.round(hour.europeanAqi)}`)
  if (hour.pm2_5 !== null) parts.push(`PM2.5 ${hour.pm2_5.toFixed(0)} µg/m³`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function riskForAirPoint(hour: AirQualityHour): SimpleRiskLevel | null {
  if (hour.usAqi !== null) return riskFromUsAqi(hour.usAqi)
  if (hour.europeanAqi !== null) return riskFromEuropeanAqi(hour.europeanAqi)
  return null
}

function summarize(points: MetricPointView[], day: DayId, metric: MetricId, format: ValueFormat, sources: MetricSources): MetricSummary {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null)
  const min = values.length > 0 ? Math.min(...values) : null
  const max = values.length > 0 ? Math.max(...values) : null
  let current: number | null = null
  let currentLabel: string | null = null
  if (day === 'today') {
    const definition = METRIC_DEFINITIONS[metric]
    if (metric === 'air-quality' && sources.air) {
      current = sources.air.usAqi === null ? null : displayValue(definition, sources.air.usAqi, format)
      currentLabel = current === null ? null : 'Current model value'
    } else if (metric === 'uv-index') {
      const uvValues = points.map((point) => point.value).filter((value): value is number => value !== null)
      current = uvValues.length > 0 ? Math.max(...uvValues) : null
      currentLabel = current === null ? null : 'Highest forecast today'
    } else if (sources.weather) {
      const raw = metric === 'temperature' ? sources.weather.temperature
        : metric === 'heat-index' ? sources.weather.heatIndex
          : sources.weather.humidity
      current = raw === null || metric === 'humidity' ? raw : displayValue(definition, raw, format)
      currentLabel = current === null ? null : 'Current model value'
    }
  }
  return {
    min: min === null ? null : min,
    max: max === null ? null : max,
    current,
    currentLabel,
    rangeLabel: day === 'yesterday' ? 'Historical reanalysis' : day === 'today' ? 'Today (modelled hours)' : 'Full-day forecast',
  }
}

/**
 * Build the hourly detail view for one metric on one day. Returns hasData=false
 * with an honest reason when the connected source provides nothing — never
 * fills or fakes values.
 */
export function buildMetricDay(
  metric: MetricId,
  day: DayId,
  sources: MetricSources,
  format: ValueFormat,
): MetricDayView {
  const definition = METRIC_DEFINITIONS[metric]
  const unitLabel = unitLabelFor(definition, format)
  const dates = resolveDayDates(sources.weather, sources.air)
  const isAir = metric === 'air-quality'
  const sourceLabel = isAir
    ? 'Open-Meteo Air Quality API (CAMS model estimate)'
    : day === 'yesterday'
      ? 'Open-Meteo Historical Weather API (ERA5 reanalysis)'
      : 'Open-Meteo (weather model)'
  const updatedAt = isAir
    ? (sources.air ? sources.air.retrievedAt : null)
    : day === 'yesterday'
      ? (sources.history ? sources.history.retrievedAt : null)
      : (sources.weather ? sources.weather.retrievedAt : null)

  const airPoints = isAir ? airPointsForDate(sources.air, dates[day]) : []
  const weatherPoints = isAir
    ? []
    : day === 'yesterday'
      ? historyPointsForDate(sources.history, dates[day])
      : weatherPointsForDate(sources.weather, dates[day])

  const points: MetricPointView[] = isAir
    ? airPoints.map((hour) => {
      const raw = hour.usAqi
      return {
        isoTime: hour.modelTime,
        label: hour.label,
        value: raw === null ? null : displayValue(definition, raw, format),
        risk: riskForAirPoint(hour),
        note: noteForAirPoint(hour),
      }
    })
    : weatherPoints.map((point) => {
      let raw: number | null
      let risk: SimpleRiskLevel | null = null
      if (metric === 'heat-index') {
        const screened = heatIndexPoint(point)
        raw = screened.value
        risk = screened.risk
      } else if (metric === 'temperature') raw = point.temperature
      else if (metric === 'humidity') raw = point.humidity
      else raw = point.uvIndex
      const value = raw === null ? null : displayValue(definition, raw, format)
      return {
        isoTime: point.isoTime,
        label: point.label,
        value,
        risk,
        note: noteForWeatherPoint(metric, point, value, format),
      }
    })

  const gapCount = points.filter((point) => point.value === null).length
  const hasData = points.some((point) => point.value !== null)
  const unavailableReason = !hasData
    ? isAir
      ? 'The connected air-quality model provides no hourly estimates for this date. This is unknown — not clean air.'
      : metric === 'uv-index' && day === 'yesterday'
        ? 'The connected data source does not provide historical UV index readings for yesterday. This is unknown — not a low-UV day.'
        : 'The connected data source provides no hourly readings for this metric and date. This is unknown — not an all-clear.'
    : null

  const levels = points.map((point) => point.risk).filter((level): level is SimpleRiskLevel => level !== null)
  const rank: Record<SimpleRiskLevel, number> = { low: 0, moderate: 1, high: 2, extreme: 3 }
  const band = metric === 'heat-index' && levels.length > 0
    ? { worst: levels.reduce((worst, level) => (rank[level] > rank[worst] ? level : worst), levels[0]) }
    : null

  return {
    metric,
    day,
    unitLabel,
    points,
    hasData,
    gapCount,
    band,
    summary: hasData ? summarize(points, day, metric, format, sources) : { min: null, max: null, current: null, currentLabel: null, rangeLabel: day === 'yesterday' ? 'Historical reanalysis' : day === 'today' ? 'Today (modelled hours)' : 'Full-day forecast' },
    source: sourceLabel,
    updatedAt,
    unavailableReason,
  }
}

export function neighborMetrics(metric: MetricId): { previous: MetricId; next: MetricId } {
  const index = METRIC_ORDER.indexOf(metric)
  return {
    previous: METRIC_ORDER[(index + METRIC_ORDER.length - 1) % METRIC_ORDER.length],
    next: METRIC_ORDER[(index + 1) % METRIC_ORDER.length],
  }
}
