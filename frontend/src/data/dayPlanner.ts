/**
 * Non-AI heat-risk day planning over the modelled hourly forecast.
 *
 * Everything here is deterministic screening on data the dashboard already
 * fetches: hourly temperature + humidity are fed through the same NWS
 * heat-index approximation and risk thresholds as the rest of the app
 * (`data/heat.ts`). Hours the model does not screen are left unscreened —
 * missing data is never treated as an all-clear.
 */

import type { PlannerHour, RiskLevel, SimpleRiskLevel } from '../types'
import { getSimpleRisk, heatIndexC, riskFromHeatIndex } from './heat'

/** Hours within this many degrees of the window's minimum count as comparatively lower heat. */
export const LOWER_WINDOW_TOLERANCE_C = 1.5
/** Hours within this many degrees of the window's maximum count as peak heat. */
export const PEAK_TOLERANCE_C = 0.5
/** Below this spread there is no meaningfully cooler window to recommend. */
export const MIN_CONTRAST_C = 3

export interface PlannerHourView {
  isoTime: string
  label: string
  temperature: number
  humidity: number | null
  heatIndex: number | null
  risk: RiskLevel | null
  displayRisk: SimpleRiskLevel | null
  isPeak: boolean
  inLowerWindow: boolean
}

export interface LowerHeatWindow {
  startLabel: string
  endLabel: string
  peakHeatIndex: number
  band: SimpleRiskLevel
}

export interface CompareBlock {
  rangeLabel: string
  peakHeatIndex: number | null
  band: SimpleRiskLevel | null
  kind: 'peak' | 'mixed' | 'lower' | 'unscreened'
}

export interface DayPlan {
  hours: PlannerHourView[]
  screenedCount: number
  unscreenedCount: number
  peakHeatIndex: number | null
  peakBand: SimpleRiskLevel | null
  peakLabels: string[]
  lowerWindows: LowerHeatWindow[]
  blocks: CompareBlock[]
  summary: string
  /** Enough screened hours to plan with; false means show an unavailable state. */
  sufficient: boolean
  /** Some hours are unscreened — the summary must say so explicitly. */
  hasGaps: boolean
}

function screenHour(hour: PlannerHour): Pick<PlannerHourView, 'heatIndex' | 'risk' | 'displayRisk'> {
  if (hour.humidity === null) return { heatIndex: null, risk: null, displayRisk: null }
  const heatIndex = heatIndexC(hour.temperature, hour.humidity)
  const risk = riskFromHeatIndex(heatIndex)
  return { heatIndex, risk, displayRisk: getSimpleRisk(risk) }
}

function formatIndex(value: number, formatTemp: (celsius: number, digits?: number) => string, tempSymbol: string): string {
  return `${formatTemp(value)}${tempSymbol}`
}

export function buildDayPlan(
  forecastHours: PlannerHour[],
  formatTemp: (celsius: number, digits?: number) => string,
  tempSymbol: string,
): DayPlan {
  const screened = forecastHours.map((hour) => ({ ...hour, ...screenHour(hour) }))
  const withIndex = screened.filter((hour) => hour.heatIndex !== null)
  const screenedCount = withIndex.length
  const unscreenedCount = screened.length - screenedCount
  const sufficient = screenedCount >= 3

  const maxHeatIndex = screenedCount > 0 ? Math.max(...withIndex.map((hour) => hour.heatIndex as number)) : null
  const minHeatIndex = screenedCount > 0 ? Math.min(...withIndex.map((hour) => hour.heatIndex as number)) : null
  const spread = maxHeatIndex !== null && minHeatIndex !== null ? maxHeatIndex - minHeatIndex : 0

  const views: PlannerHourView[] = screened.map((hour) => ({
    ...hour,
    isPeak: hour.heatIndex !== null && maxHeatIndex !== null && hour.heatIndex >= maxHeatIndex - PEAK_TOLERANCE_C,
    inLowerWindow: false,
  }))

  // Contiguous runs of comparatively lower heat (>= 2 hours), only when the day
  // has real contrast — a flat forecast has no meaningfully cooler window.
  const lowerWindows: LowerHeatWindow[] = []
  if (spread >= MIN_CONTRAST_C && minHeatIndex !== null) {
    let run: PlannerHourView[] = []
    const flush = () => {
      if (run.length >= 2) {
        lowerWindows.push({
          startLabel: run[0].label,
          endLabel: run[run.length - 1].label,
          peakHeatIndex: Math.max(...run.map((hour) => hour.heatIndex as number)),
          band: getSimpleRisk(riskFromHeatIndex(Math.max(...run.map((hour) => hour.heatIndex as number)))),
        })
        for (const hour of run) hour.inLowerWindow = true
      }
      run = []
    }
    for (const hour of views) {
      if (hour.heatIndex !== null && hour.heatIndex <= minHeatIndex + LOWER_WINDOW_TOLERANCE_C) run.push(hour)
      else flush()
    }
    flush()
  }

  const blocks: CompareBlock[] = []
  for (let block = 0; block < 4; block += 1) {
    const slice = views.slice(block * 6, block * 6 + 6)
    if (slice.length === 0) continue
    const indexed = slice.filter((hour) => hour.heatIndex !== null)
    const peakHeatIndex = indexed.length > 0 ? Math.max(...indexed.map((hour) => hour.heatIndex as number)) : null
    const band = peakHeatIndex !== null ? getSimpleRisk(riskFromHeatIndex(peakHeatIndex)) : null
    const hasPeak = slice.some((hour) => hour.isPeak)
    const hasLower = slice.some((hour) => hour.inLowerWindow)
    blocks.push({
      rangeLabel: `${slice[0].label} – ${slice[slice.length - 1].label}`,
      peakHeatIndex,
      band,
      kind: indexed.length === 0 ? 'unscreened' : hasPeak ? 'peak' : hasLower ? 'lower' : 'mixed',
    })
  }

  const peakLabels = views.filter((hour) => hour.isPeak).map((hour) => hour.label)
  const peakBand = maxHeatIndex !== null ? getSimpleRisk(riskFromHeatIndex(maxHeatIndex)) : null

  const summaryParts: string[] = []
  if (sufficient && maxHeatIndex !== null && minHeatIndex !== null) {
    summaryParts.push(
      `Modelled heat index for the next ${views.length} hours ranges from ${formatIndex(minHeatIndex, formatTemp, tempSymbol)} to ${formatIndex(maxHeatIndex, formatTemp, tempSymbol)}.`,
    )
    if (peakLabels.length > 0) {
      summaryParts.push(`Highest screened heat: ${peakLabels[0]} to ${peakLabels[peakLabels.length - 1]} (peak ${formatIndex(maxHeatIndex, formatTemp, tempSymbol)}).`)
    }
    if (lowerWindows.length > 0) {
      summaryParts.push(
        `Comparatively lower-heat windows: ${lowerWindows.map((window) => `${window.startLabel} to ${window.endLabel}`).join('; ')}. Lower is not safe — heat stress is still possible.`,
      )
    } else {
      summaryParts.push('Heat stays fairly steady across the period, so there is no notably cooler window to single out.')
    }
  } else {
    summaryParts.push('Not enough modelled hourly data to screen the next 24 hours. Unscreened hours are unknown, not safe.')
  }
  if (unscreenedCount > 0) {
    summaryParts.push(`${unscreenedCount} of ${views.length} hours have no humidity reading and are left unscreened — treat them as unknown.`)
  }
  summaryParts.push('All values are model estimates, not official warnings.')

  return {
    hours: views,
    screenedCount,
    unscreenedCount,
    peakHeatIndex: maxHeatIndex,
    peakBand,
    peakLabels,
    lowerWindows,
    blocks,
    summary: summaryParts.join(' '),
    sufficient,
    hasGaps: unscreenedCount > 0,
  }
}
