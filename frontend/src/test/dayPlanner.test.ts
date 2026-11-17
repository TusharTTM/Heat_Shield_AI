import { describe, expect, it } from 'vitest'
import { buildDayPlan, MIN_CONTRAST_C } from '../data/dayPlanner'
import { heatIndexC, riskFromHeatIndex } from '../data/heat'
import type { PlannerHour } from '../types'

const formatTemp = (celsius: number, digits = 1) => celsius.toFixed(digits)

function hours(specs: [number, number | null][]): PlannerHour[] {
  return specs.map(([temperature, humidity], index) => ({
    isoTime: new Date(Date.UTC(2026, 10, 8, index)).toISOString(),
    label: `${index % 12 === 0 ? 12 : index % 12} ${index < 12 ? 'AM' : 'PM'}`,
    temperature,
    humidity,
  }))
}

/** Warm afternoon, cooler night: peak at hours 2–4, lower window at hours 0–1 and 8–11 (of 12). */
function dayCurve(count = 12): PlannerHour[] {
  return Array.from({ length: count }, (_, index) => {
    const temperature = 26 + 10 * Math.max(0, Math.sin(((index - 2) / count) * Math.PI))
    const humidity = 70 - 25 * Math.max(0, Math.sin(((index - 2) / count) * Math.PI))
    return {
      isoTime: new Date(Date.UTC(2026, 10, 8, index)).toISOString(),
      label: `${index}h`,
      temperature: Math.round(temperature * 10) / 10,
      humidity: Math.round(humidity),
    }
  })
}

describe('buildDayPlan', () => {
  it('screens each hour with the shared heat-index and risk thresholds', () => {
    const input = hours([[34, 60], [28, 40]])
    const plan = buildDayPlan(input, formatTemp, '°C')
    expect(plan.hours[0].heatIndex).toBe(heatIndexC(34, 60))
    expect(plan.hours[0].risk).toBe(riskFromHeatIndex(heatIndexC(34, 60)))
    expect(plan.hours[0].displayRisk).not.toBeNull()
  })

  it('marks the highest-screened hours as peak heat', () => {
    const plan = buildDayPlan(dayCurve(12), formatTemp, '°C')
    const peakIndexes = plan.hours.filter((hour) => hour.isPeak).map((hour) => hour.label)
    expect(plan.peakLabels.length).toBeGreaterThan(0)
    expect(peakIndexes).toContain(plan.peakLabels[0])
    const maxIndex = Math.max(...plan.hours.map((hour) => hour.heatIndex as number))
    for (const hour of plan.hours.filter((h) => h.isPeak)) {
      expect(hour.heatIndex as number).toBeGreaterThanOrEqual(maxIndex - 0.5)
    }
  })

  it('finds contiguous comparatively lower-heat windows and never calls them safe', () => {
    const plan = buildDayPlan(dayCurve(12), formatTemp, '°C')
    expect(plan.lowerWindows.length).toBeGreaterThan(0)
    for (const window of plan.lowerWindows) {
      expect(window.peakHeatIndex).toBeLessThanOrEqual((plan.peakHeatIndex as number) - MIN_CONTRAST_C + 1.5)
    }
    for (const hour of plan.hours.filter((h) => h.inLowerWindow)) {
      expect(hour.heatIndex as number).toBeLessThan(plan.peakHeatIndex as number)
    }
    expect(plan.summary).toContain('Lower is not safe')
    expect(plan.summary).toContain('model estimates, not official warnings')
  })

  it('reports no cooler window when heat stays flat', () => {
    const flat = Array.from({ length: 8 }, (_, index) => ({
      isoTime: new Date(Date.UTC(2026, 10, 8, index)).toISOString(),
      label: `${index}h`,
      temperature: 33 + index * 0.1,
      humidity: 55,
    }))
    const plan = buildDayPlan(flat, formatTemp, '°C')
    expect(plan.lowerWindows).toHaveLength(0)
    expect(plan.summary).toContain('no notably cooler window')
  })

  it('treats unscreened hours as unknown, never as an all-clear', () => {
    const plan = buildDayPlan(hours([[34, 60], [30, null], [28, 45], [26, null]]), formatTemp, '°C')
    expect(plan.unscreenedCount).toBe(2)
    expect(plan.hasGaps).toBe(true)
    expect(plan.summary).toContain('2 of 4 hours have no humidity reading')
    expect(plan.summary).toContain('unknown, not safe')
    expect(plan.summary).not.toContain('safe period')
  })

  it('declines to plan on insufficient data', () => {
    const plan = buildDayPlan(hours([[34, null], [30, null]]), formatTemp, '°C')
    expect(plan.sufficient).toBe(false)
    expect(plan.summary).toContain('Not enough modelled hourly data')
  })

  it('splits the window into four comparable six-hour blocks', () => {
    const plan = buildDayPlan(dayCurve(24), formatTemp, '°C')
    expect(plan.blocks).toHaveLength(4)
    expect(plan.blocks[0].rangeLabel).toContain(' – ')
    const kinds = new Set(plan.blocks.map((block) => block.kind))
    expect(kinds.has('peak') || kinds.has('mixed')).toBe(true)
    for (const block of plan.blocks) {
      expect(block.peakHeatIndex === null || typeof block.peakHeatIndex === 'number').toBe(true)
    }
  })

  it('includes peak and lower markers plus screen-reader summary text', () => {
    const plan = buildDayPlan(dayCurve(12), formatTemp, '°C')
    expect(plan.summary).toMatch(/ranges from .+ to .+/)
    expect(plan.summary).toContain('Highest screened heat')
    expect(plan.summary).toMatch(/hours have no humidity|model estimates/)
  })
})
