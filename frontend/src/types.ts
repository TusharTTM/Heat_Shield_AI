export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe' | 'extreme'
export type SimpleRiskLevel = 'low' | 'moderate' | 'high' | 'extreme'
export type DataStatus = 'demonstration' | 'unavailable' | 'weather-model' | 'stale' | 'loading'

export interface Region {
  slug: string
  name: string
  state: string
  latitude: number
  longitude: number
}

export interface RegionWeather extends Region {
  temperature: number
  humidity: number
  heatIndex: number
  risk: RiskLevel
  condition: string
}

export interface CurrentWeather extends RegionWeather {
  apparentTemperature: number
  windSpeed: number
  rain?: number | null
  precipitation?: number | null
  windGusts?: number | null
  pressureMsl?: number | null
  surfacePressure?: number | null
  visibility?: number | null
  observedAt: string
  retrievedAt: string
  source: 'Open-Meteo'
  evidenceType: 'weather-model'
}

export interface ForecastDay {
  date: string
  label: string
  fullLabel: string
  max: number
  min: number
  condition?: string
  heatIndexMax?: number | null
  precipitationSum?: number | null
  rainSum?: number | null
  precipitationProbabilityMax?: number | null
  windGustsMax?: number | null
  uvIndexMax?: number | null
}

export interface TodayHour {
  time: string
  temperature: number
}

/** One modelled forecast hour for the day planner (next-24-hours window). */
export interface PlannerHour {
  /** ISO timestamp of the modelled hour (UTC). */
  isoTime: string
  /** Display label in the app's clock format, e.g. "2 PM". */
  label: string
  temperature: number
  /** Relative humidity percent when the model supplies it; null keeps the hour unscreened. */
  humidity: number | null
}

/**
 * One hourly model point for the metric detail views. Null means the data
 * source did not provide that field for that hour — never zero-filled.
 */
export interface MetricHourPoint {
  isoTime: string
  label: string
  temperature: number | null
  humidity: number | null
  uvIndex: number | null
}

export interface WeatherData extends CurrentWeather {
  forecast: ForecastDay[]
  hours: TodayHour[]
  /** Modelled hours from "now" for the heat-risk day planner. */
  next24Hours: PlannerHour[]
  /** All modelled hours the forecast payload provides (for metric detail views). */
  hourlySeries: MetricHourPoint[]
}

export interface WeatherResult {
  data: WeatherData
  freshness: 'current' | 'stale'
  fromCache: boolean
  warning?: string
}

export interface CurrentWeatherResult {
  data: CurrentWeather
  freshness: 'current' | 'stale'
  fromCache: boolean
  warning?: string
}

export interface HistoricalDay {
  date: string
  max: number
  min: number
  mean: number
}

export interface HistoricalData {
  region: Region
  days: HistoricalDay[]
  /** Modelled hourly reanalysis points for the range (temperature + humidity). */
  hourly: MetricHourPoint[]
  observedTimeRange: { start: string; end: string }
  retrievedAt: string
  source: 'Open-Meteo Historical Weather API'
  evidenceType: 'weather-model-reanalysis'
}

export interface AirQualityValues {
  usAqi: number | null
  europeanAqi: number | null
  pm10: number | null
  pm2_5: number | null
  carbonMonoxide: number | null
  nitrogenDioxide: number | null
  sulphurDioxide: number | null
  ozone: number | null
}

export interface AirQualityHour extends AirQualityValues {
  modelTime: string
  label: string
}

export interface AirQualityData extends Region, AirQualityValues {
  modelTime: string
  retrievedAt: string
  hourly: AirQualityHour[]
  /** All modelled hours the air-quality payload provides (for metric detail views). */
  hourlySeries: AirQualityHour[]
  /** Kept for compatibility with the original US-AQI card. */
  aqiStandard: 'US AQI'
  aqiStandards: ['US AQI', 'European AQI']
  source: 'Open-Meteo Air Quality API (CAMS model)'
  evidenceType: 'air-quality-model'
  isStationObservation: false
}

export interface AirQualityResult {
  data: AirQualityData
  freshness: 'current' | 'stale'
  fromCache: boolean
  warning?: string
}
