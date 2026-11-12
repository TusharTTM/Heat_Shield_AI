import { describe, expect, it } from 'vitest'
import sharedRegions from '../../../shared/regions.json'
import { getRegion, regions } from '../data/regions'

describe('frontend location configuration', () => {
  it('includes all fifteen cities with unique, valid identities and exact backend parity', () => {
    expect(regions).toHaveLength(15)
    expect(sharedRegions).toHaveLength(15)
    expect(regions.slice(7).map((region) => region.slug)).toEqual([
      'jaipur', 'lucknow', 'bhopal', 'hyderabad', 'bengaluru', 'chennai', 'kochi', 'kolkata',
    ])
    expect(new Set(regions.map((region) => region.slug)).size).toBe(regions.length)
    expect(new Set(regions.map((region) => region.name)).size).toBe(regions.length)
    expect(new Set(regions.map((region) => `${region.latitude},${region.longitude}`)).size).toBe(regions.length)
    expect(sharedRegions.map(({ slug, name, state, latitude, longitude }) => ({
      slug, name, state, latitude, longitude,
    }))).toEqual(regions)
    for (const region of regions) {
      expect(region.state.length).toBeGreaterThan(0)
      expect(region.latitude).toBeGreaterThanOrEqual(8)
      expect(region.latitude).toBeLessThanOrEqual(37)
      expect(region.longitude).toBeGreaterThanOrEqual(68)
      expect(region.longitude).toBeLessThanOrEqual(97.5)
      expect(getRegion(region.slug)).toEqual(region)
    }
  })
})
