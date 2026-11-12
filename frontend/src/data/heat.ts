import type { RiskLevel, SimpleRiskLevel } from '../types'

export const HEAT_INDEX_METHOD_URL = 'https://www.weather.gov/safety/heat-tools'

export interface DisplayHeatRiskBand {
  level: SimpleRiskLevel
  range: string
  basis: string
}

/** Rounded Celsius screening bands; the High display band includes the underlying severe band. */
export const displayHeatRiskBands: readonly DisplayHeatRiskBand[] = [
  { level: 'low', range: 'Below 27°C', basis: 'Below the rounded NWS Caution boundary' },
  { level: 'moderate', range: '27°C to below 33°C', basis: 'NWS Caution, rounded to whole °C boundaries' },
  { level: 'high', range: '33°C to below 52°C', basis: 'NWS Extreme Caution and Danger, combined for this four-level interface' },
  { level: 'extreme', range: '52°C and above', basis: 'NWS Extreme Danger, rounded to a whole °C boundary' },
]

/**
 * Deterministic NOAA/NWS heat-index approximation: the Rothfusz regression with
 * the NWS low/high-humidity adjustments. It assumes shade and light wind and is not ML.
 */
export function heatIndexC(temperatureC: number, humidity: number): number {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
    throw new RangeError('Heat index requires finite temperature and relative humidity from 0 to 100%.')
  }
  const t = temperatureC * 9 / 5 + 32
  const rh = humidity
  const simple = 0.5 * (t + 61 + ((t - 68) * 1.2) + rh * 0.094)
  let hi = (simple + t) / 2
  if (hi >= 80) {
    hi = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh
      - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh
      + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
    if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17)
    else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5)
  }
  return Math.round((hi - 32) * 5 / 9 * 10) / 10
}

export function riskFromHeatIndex(heatIndex: number): RiskLevel {
  if (heatIndex < 27) return 'low'
  if (heatIndex < 33) return 'moderate'
  if (heatIndex < 40) return 'high'
  if (heatIndex < 52) return 'severe'
  return 'extreme'
}

export function getSimpleRisk(level: RiskLevel): SimpleRiskLevel {
  if (level === 'low') return 'low'
  if (level === 'moderate') return 'moderate'
  if (level === 'extreme') return 'extreme'
  return 'high'
}
