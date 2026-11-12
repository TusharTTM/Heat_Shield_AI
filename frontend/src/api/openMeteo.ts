import { getSimpleRisk, heatIndexC, riskFromHeatIndex } from '../data/heat'
import type {
  AirQualityData, AirQualityHour, AirQualityResult, AirQualityValues, CurrentWeather, CurrentWeatherResult,
  ForecastDay, HistoricalData, Region, TodayHour, WeatherResult,
} from '../types'

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
export const OPEN_METEO_AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
export const OPEN_METEO_AIR_QUALITY_DOCS_URL = 'https://open-meteo.com/en/docs/air-quality-api'
export const OPEN_METEO_ATTRIBUTION_URL = 'https://open-meteo.com/'
export const OPEN_METEO_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'
export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000
export const HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'hs-open-meteo-v1:'
const REQUEST_ATTEMPT_TIMEOUTS_MS = [8000, 12000] as const

export class WeatherApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeatherApiError'
  }
}

export interface CachedResult<T> {
  data: T
  freshness: 'current' | 'stale'
  fromCache: boolean
  warning?: string
}

interface CacheEntry<T> { storedAt: number; data: T }
type RawPayload = {
  current?: Record<string, unknown>
  daily?: Record<string, unknown>
  hourly?: Record<string, unknown>
  utc_offset_seconds?: number
  error?: boolean
  reason?: string
}

const memoryCache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

const descriptions: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
}

function readCache<T>(key: string): CacheEntry<T> | null {
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined
  if (memory) return memory
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (typeof parsed.storedAt !== 'number' || !parsed.data) return null
    memoryCache.set(key, parsed as CacheEntry<unknown>)
    return parsed
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): CacheEntry<T> {
  const entry = { storedAt: Date.now(), data }
  memoryCache.set(key, entry as CacheEntry<unknown>)
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Memory caching still works when browser storage is unavailable or full.
  }
  return entry
}

async function cachedRequest<T>(key: string, ttl: number, force: boolean, loader: () => Promise<T>): Promise<CachedResult<T>> {
  const cached = readCache<T>(key)
  if (!force && cached && Date.now() - cached.storedAt >= 0 && Date.now() - cached.storedAt < ttl) {
    return { data: cached.data, freshness: 'current', fromCache: true }
  }
  const existing = inFlight.get(key) as Promise<CachedResult<T>> | undefined
  if (existing) return existing
  const request = loader().then((data) => {
    writeCache(key, data)
    return { data, freshness: 'current' as const, fromCache: false }
  }).catch((error: unknown) => {
    if (cached) {
      return {
        data: cached.data, freshness: 'stale' as const, fromCache: true,
        warning: 'Live refresh failed. Showing the most recent cached Open-Meteo response.',
      }
    }
    throw error instanceof WeatherApiError ? error : new WeatherApiError('Open-Meteo weather is unavailable. Check your connection and try again.')
  }).finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key)
  })
  inFlight.set(key, request as Promise<unknown>)
  return request
}

async function requestJson(url: URL): Promise<RawPayload> {
  for (let attempt = 0; attempt < REQUEST_ATTEMPT_TIMEOUTS_MS.length; attempt += 1) {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_ATTEMPT_TIMEOUTS_MS[attempt])
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new WeatherApiError(`Open-Meteo returned HTTP ${response.status}. Try again later.`)
      const payload = await response.json() as RawPayload
      if (!payload || payload.error) throw new WeatherApiError('Open-Meteo returned an error response. Try again later.')
      return payload
    } catch (error) {
      if (error instanceof WeatherApiError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (attempt + 1 < REQUEST_ATTEMPT_TIMEOUTS_MS.length) continue
        throw new WeatherApiError('Open-Meteo took too long to respond. Try again.')
      }
      throw new WeatherApiError('Could not reach Open-Meteo. Check your connection and try again.')
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }
  throw new WeatherApiError('Open-Meteo took too long to respond. Try again.')
}

function numberField(payload: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = Number(payload[key])
  if (payload[key] === null || payload[key] === undefined || !Number.isFinite(value) || value < min || value > max) {
    throw new WeatherApiError(`Open-Meteo returned an invalid ${key} value.`)
  }
  return value
}

function optionalNumberField(payload: Record<string, unknown>, key: string, min: number, max: number): number | null {
  if (payload[key] === null || payload[key] === undefined) return null
  return numberField(payload, key, min, max)
}

function optionalArrayNumber(values: unknown, index: number, min: number, max: number): number | null {
  if (!Array.isArray(values) || values[index] === null || values[index] === undefined) return null
  const value = Number(values[index])
  if (!Number.isFinite(value) || value < min || value > max) throw new WeatherApiError('Open-Meteo returned an invalid optional forecast value.')
  return value
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || !value) throw new WeatherApiError(`Open-Meteo omitted ${key}.`)
  return value
}

function modelTimeToIso(value: string, offsetSeconds = 0): string {
  const hasZone = /(?:Z|[+-]\d\d:\d\d)$/.test(value)
  const timestamp = new Date(hasZone ? value : `${value}Z`).getTime() - (hasZone ? 0 : offsetSeconds * 1000)
  if (!Number.isFinite(timestamp)) throw new WeatherApiError('Open-Meteo returned an invalid model timestamp.')
  return new Date(timestamp).toISOString()
}

function forecastUrl(region: Region, currentOnly: boolean): URL {
  const url = new URL(OPEN_METEO_FORECAST_URL)
  url.searchParams.set('latitude', String(region.latitude))
  url.searchParams.set('longitude', String(region.longitude))
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,rain,precipitation,pressure_msl,surface_pressure,visibility')
  url.searchParams.set('timezone', 'Asia/Kolkata')
  url.searchParams.set('temperature_unit', 'celsius')
  url.searchParams.set('wind_speed_unit', 'kmh')
  if (!currentOnly) {
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max')
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,visibility,uv_index')
    url.searchParams.set('forecast_days', '5')
  }
  return url
}

function parseCurrent(region: Region, payload: RawPayload): CurrentWeather {
  if (!payload.current) throw new WeatherApiError('Open-Meteo omitted current weather.')
  const current = payload.current
  const temperature = numberField(current, 'temperature_2m', -70, 65)
  const humidity = numberField(current, 'relative_humidity_2m', 0, 100)
  const weatherCode = numberField(current, 'weather_code', 0, 99)
  const heatIndex = heatIndexC(temperature, humidity)
  return {
    ...region, temperature, humidity, heatIndex, risk: riskFromHeatIndex(heatIndex),
    apparentTemperature: numberField(current, 'apparent_temperature', -90, 80),
    windSpeed: numberField(current, 'wind_speed_10m', 0, 200),
    windGusts: optionalNumberField(current, 'wind_gusts_10m', 0, 300),
    rain: optionalNumberField(current, 'rain', 0, 500),
    precipitation: optionalNumberField(current, 'precipitation', 0, 500),
    pressureMsl: optionalNumberField(current, 'pressure_msl', 800, 1200),
    surfacePressure: optionalNumberField(current, 'surface_pressure', 500, 1200),
    visibility: optionalNumberField(current, 'visibility', 0, 100000),
    condition: descriptions[weatherCode] ?? 'Weather condition unavailable',
    observedAt: modelTimeToIso(stringField(current, 'time'), payload.utc_offset_seconds),
    retrievedAt: new Date().toISOString(), source: 'Open-Meteo', evidenceType: 'weather-model',
  }
}

const dayFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDayFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

function forecastHeatIndexMaxima(payload: RawPayload): Record<string, number> {
  const hourly = payload.hourly
  const temperatures = hourly?.temperature_2m
  const humidities = hourly?.relative_humidity_2m
  if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(temperatures) || !Array.isArray(humidities)) return {}
  const maxima: Record<string, number> = {}
  hourly.time.forEach((value, index) => {
    if (typeof value !== 'string') return
    const temperature = Number(temperatures[index])
    const humidity = Number(humidities[index])
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || temperature < -70 || temperature > 65 || humidity < 0 || humidity > 100) return
    const date = value.slice(0, 10)
    const indexC = heatIndexC(temperature, humidity)
    maxima[date] = Math.max(maxima[date] ?? Number.NEGATIVE_INFINITY, indexC)
  })
  return maxima
}

function parseForecast(payload: RawPayload): ForecastDay[] {
  const daily = payload.daily
  if (!daily || !Array.isArray(daily.time) || daily.time.length !== 5) throw new WeatherApiError('Open-Meteo did not return exactly five forecast days.')
  const heatIndexMaxima = forecastHeatIndexMaxima(payload)
  return daily.time.map((date, index) => {
    if (typeof date !== 'string') throw new WeatherApiError('Open-Meteo returned an invalid forecast date.')
    const record = daily as Record<string, unknown>
    const maxValues = record.temperature_2m_max as unknown[]
    const minValues = record.temperature_2m_min as unknown[]
    const codes = record.weather_code as unknown[]
    if (!Array.isArray(maxValues) || !Array.isArray(minValues) || !Array.isArray(codes)) throw new WeatherApiError('Open-Meteo returned incomplete forecast arrays.')
    if (maxValues[index] === null || maxValues[index] === undefined || minValues[index] === null || minValues[index] === undefined || codes[index] === null || codes[index] === undefined) {
      throw new WeatherApiError('Open-Meteo returned an incomplete forecast day.')
    }
    const maxValue = Number(maxValues[index])
    const minValue = Number(minValues[index])
    const code = Number(codes[index])
    if (!Number.isFinite(maxValue) || maxValue < -70 || maxValue > 65 || !Number.isFinite(minValue) || minValue < -80 || minValue > 60 || !Number.isFinite(code) || code < 0 || code > 99) {
      throw new WeatherApiError('Open-Meteo returned an incomplete or out-of-range forecast day.')
    }
    const parsedDate = new Date(`${date}T00:00:00Z`)
    if (!Number.isFinite(parsedDate.getTime())) throw new WeatherApiError('Open-Meteo returned an invalid forecast date.')
    return {
      date, label: dayFormatter.format(parsedDate), fullLabel: fullDayFormatter.format(parsedDate),
      max: maxValue, min: minValue, condition: descriptions[code] ?? 'Weather condition unavailable',
      heatIndexMax: heatIndexMaxima[date] ?? null,
      precipitationSum: optionalArrayNumber(record.precipitation_sum, index, 0, 2000),
      rainSum: optionalArrayNumber(record.rain_sum, index, 0, 2000),
      precipitationProbabilityMax: optionalArrayNumber(record.precipitation_probability_max, index, 0, 100),
      windGustsMax: optionalArrayNumber(record.wind_gusts_10m_max, index, 0, 300),
      uvIndexMax: optionalArrayNumber(record.uv_index_max, index, 0, 30),
    }
  })
}

function parseHours(payload: RawPayload): TodayHour[] {
  const hourly = payload.hourly
  const currentTime = payload.current?.time
  if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.temperature_2m) || typeof currentTime !== 'string') return []
  const times = hourly.time as unknown[]
  const temperatures = hourly.temperature_2m as unknown[]
  const date = currentTime.slice(0, 10)
  return [8, 10, 12, 14, 16, 18].flatMap((hour) => {
    const target = `${date}T${String(hour).padStart(2, '0')}:00`
    const index = times.indexOf(target)
    if (index < 0) return []
    if (temperatures[index] === null || temperatures[index] === undefined) return []
    const temperature = Number(temperatures[index])
    if (!Number.isFinite(temperature)) return []
    const label = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', timeZone: 'UTC' }).format(new Date(`${target}Z`)).toUpperCase()
    return [{ time: label, temperature }]
  })
}

const AIR_QUALITY_FIELDS = [
  ['usAqi', 'us_aqi', 0, 1000],
  ['europeanAqi', 'european_aqi', 0, 1000],
  ['pm10', 'pm10', 0, 5000],
  ['pm2_5', 'pm2_5', 0, 5000],
  ['carbonMonoxide', 'carbon_monoxide', 0, 20000],
  ['nitrogenDioxide', 'nitrogen_dioxide', 0, 2000],
  ['sulphurDioxide', 'sulphur_dioxide', 0, 2000],
  ['ozone', 'ozone', 0, 2000],
] as const

function airQualityUrl(region: Region): URL {
  const url = new URL(OPEN_METEO_AIR_QUALITY_URL)
  const fields = AIR_QUALITY_FIELDS.map(([, field]) => field).join(',')
  url.searchParams.set('latitude', String(region.latitude))
  url.searchParams.set('longitude', String(region.longitude))
  url.searchParams.set('current', fields)
  url.searchParams.set('hourly', fields)
  url.searchParams.set('forecast_days', '2')
  url.searchParams.set('timezone', 'Asia/Kolkata')
  return url
}

function parseCurrentAirQualityValues(current: Record<string, unknown>): AirQualityValues {
  const values = Object.fromEntries(AIR_QUALITY_FIELDS.map(([property, field, min, max]) => [
    property, optionalNumberField(current, field, min, max),
  ])) as unknown as AirQualityValues
  if (Object.values(values).every((value) => value === null)) throw new WeatherApiError('Open-Meteo returned no current air-quality values.')
  return values
}

function parseAirQualityHours(payload: RawPayload, rawModelTime: string): AirQualityHour[] {
  const hourly = payload.hourly
  const times = hourly?.time
  if (!hourly || !Array.isArray(times)) return []
  const exactIndex = times.indexOf(rawModelTime)
  const currentIndex = exactIndex >= 0 ? exactIndex : times.findIndex((value) => typeof value === 'string' && value >= rawModelTime)
  if (currentIndex < 0) return []
  const hours: AirQualityHour[] = []
  times.slice(currentIndex, currentIndex + 24).forEach((value, offset) => {
    const index = currentIndex + offset
    if (typeof value !== 'string') throw new WeatherApiError('Open-Meteo returned an invalid hourly air-quality timestamp.')
    const values = Object.fromEntries(AIR_QUALITY_FIELDS.map(([property, field, min, max]) => [
      property, optionalArrayNumber(hourly[field], index, min, max),
    ])) as unknown as AirQualityValues
    if (Object.values(values).every((reading) => reading === null)) return
    const localTime = new Date(`${value}Z`)
    if (!Number.isFinite(localTime.getTime())) throw new WeatherApiError('Open-Meteo returned an invalid hourly air-quality timestamp.')
    hours.push({
      ...values, modelTime: modelTimeToIso(value, payload.utc_offset_seconds),
      label: new Intl.DateTimeFormat('en-IN', { weekday: 'short', hour: 'numeric', timeZone: 'UTC' }).format(localTime),
    })
  })
  return hours
}

function parseAirQuality(region: Region, payload: RawPayload): AirQualityData {
  if (!payload.current) throw new WeatherApiError('Open-Meteo omitted current air-quality model data.')
  const current = payload.current
  const rawModelTime = stringField(current, 'time')
  const values = parseCurrentAirQualityValues(current)
  const hourly = parseAirQualityHours(payload, rawModelTime)
  return {
    ...region, ...values, hourly, modelTime: modelTimeToIso(rawModelTime, payload.utc_offset_seconds),
    retrievedAt: new Date().toISOString(), aqiStandard: 'US AQI', aqiStandards: ['US AQI', 'European AQI'],
    source: 'Open-Meteo Air Quality API (CAMS model)', evidenceType: 'air-quality-model', isStationObservation: false,
  }
}

export async function getAirQuality(region: Region, force = false): Promise<AirQualityResult> {
  return cachedRequest(`air-quality:${region.slug}`, WEATHER_CACHE_TTL_MS, force, async () => parseAirQuality(region, await requestJson(airQualityUrl(region))))
}

export async function getCurrentWeather(region: Region, force = false): Promise<CurrentWeatherResult> {
  return cachedRequest(`current:${region.slug}`, WEATHER_CACHE_TTL_MS, force, async () => parseCurrent(region, await requestJson(forecastUrl(region, true))))
}

export async function getWeather(region: Region, force = false): Promise<WeatherResult> {
  return cachedRequest(`forecast:${region.slug}`, WEATHER_CACHE_TTL_MS, force, async () => {
    const payload = await requestJson(forecastUrl(region, false))
    const current = parseCurrent(region, payload)
    const forecast = parseForecast(payload)
    const hours = parseHours(payload)
    return { ...current, forecast, hours }
  })
}

export async function getHistoricalWeather(region: Region, start: string, end: string, force = false): Promise<CachedResult<HistoricalData>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new WeatherApiError('Historical dates must be valid YYYY-MM-DD dates in chronological order.')
  }
  return cachedRequest(`history:${region.slug}:${start}:${end}`, HISTORY_CACHE_TTL_MS, force, async () => {
    const url = new URL(OPEN_METEO_ARCHIVE_URL)
    url.searchParams.set('latitude', String(region.latitude))
    url.searchParams.set('longitude', String(region.longitude))
    url.searchParams.set('start_date', start)
    url.searchParams.set('end_date', end)
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,temperature_2m_mean')
    url.searchParams.set('timezone', 'Asia/Kolkata')
    url.searchParams.set('temperature_unit', 'celsius')
    const payload = await requestJson(url)
    const daily = payload.daily
    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) throw new WeatherApiError('Open-Meteo returned no historical days for this range.')
    const maxValues = daily.temperature_2m_max
    const minValues = daily.temperature_2m_min
    const meanValues = daily.temperature_2m_mean
    if (!Array.isArray(maxValues) || !Array.isArray(minValues) || !Array.isArray(meanValues)) throw new WeatherApiError('Open-Meteo returned incomplete historical arrays.')
    const days = daily.time.map((date, index) => {
      if (date === null || date === undefined || maxValues[index] === null || maxValues[index] === undefined || minValues[index] === null || minValues[index] === undefined || meanValues[index] === null || meanValues[index] === undefined) {
        throw new WeatherApiError('Open-Meteo returned an incomplete historical day.')
      }
      return { date: String(date), max: Number(maxValues[index]), min: Number(minValues[index]), mean: Number(meanValues[index]) }
    })
    if (days.some((day) => !Number.isFinite(day.max) || !Number.isFinite(day.min) || !Number.isFinite(day.mean))) throw new WeatherApiError('Open-Meteo returned an incomplete historical day.')
    return {
      region, days, observedTimeRange: { start, end }, retrievedAt: new Date().toISOString(),
      source: 'Open-Meteo Historical Weather API', evidenceType: 'weather-model-reanalysis',
    }
  })
}

export function clearWeatherCache() {
  memoryCache.clear()
  try {
    if (typeof window !== 'undefined') {
      Object.keys(window.localStorage).filter((key) => key.startsWith(CACHE_PREFIX)).forEach((key) => window.localStorage.removeItem(key))
    }
  } catch {
    // Storage is optional.
  }
}

export function weatherRiskExplanation(weather: CurrentWeather): string {
  const simple = getSimpleRisk(weather.risk)
  const label = simple[0].toUpperCase() + simple.slice(1)
  return `${label} screening risk uses a ${weather.heatIndex.toFixed(1)}°C heat index, calculated from ${weather.temperature.toFixed(1)}°C model-estimated temperature and ${weather.humidity}% relative humidity. This is not an official warning, physical sensor reading, or ML prediction.`
}

