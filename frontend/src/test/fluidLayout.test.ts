import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The layout is fluid: column counts come from `auto-fit` and a calculated
 * track minimum, not from breakpoints. That makes the sheet easy to get subtly
 * wrong — a track minimum that never fits four columns, or a stray fixed count
 * that wins on source order, is invisible in a unit test and only shows up as a
 * ragged page in a browser nobody here can open.
 *
 * So these tests read the sheet, resolve the arithmetic at real viewport
 * widths, and assert the result. They are the substitute for eyeballing it.
 */

const sheet = readFileSync('src/styles/index.css', 'utf8')
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

function tokenPx(name: string): number {
  const match = new RegExp(`${name}:\\s*([0-9.]+)px`).exec(tokens)
  if (!match) throw new Error(`token ${name} is not defined in px`)
  return Number(match[1])
}

/** Column count and tile width for `.key-readings-grid` at a viewport width. */
function readingGridRule(): RegExpExecArray {
  // Every block for the selector, so a second declaration that overrides the
  // fluid one is a loud failure rather than a silent last-one-wins.
  const blocks = [...sheet.matchAll(/\.key-readings-grid\s*\{([^}]*)\}/g)].map((m) => m[1])
  const declarations = blocks.filter((block) => /grid-template-columns/.test(block))
  if (declarations.length !== 1) {
    throw new Error(`expected one grid-template-columns for .key-readings-grid, found ${declarations.length}`)
  }
  const rule = /repeat\(auto-fit,\s*minmax\(max\(([\d.]+)rem,\s*calc\(\(100% - (\d+) \* var\(--space-4\)\) \/ (\d+)\)\),\s*1fr\)\)/.exec(declarations[0])
  if (!rule) throw new Error('.key-readings-grid is not a fluid auto-fit grid')
  return rule as unknown as RegExpExecArray
}

function readingGrid(viewport: number): { columns: number; tile: number } {
  const rule = readingGridRule()
  const [, floorRem, gapCount, divisor] = rule
  const gap = tokenPx('--space-4')
  const gutter = viewport <= 680 ? 12 : 32
  const content = viewport - 2 * gutter
  const trackMin = Math.max(Number(floorRem) * 16, (content - Number(gapCount) * gap) / Number(divisor))

  let columns = 1
  while ((columns + 1) * trackMin + columns * gap <= content) columns += 1
  // Four is the declared ceiling in the track-minimum expression.
  columns = Math.min(columns, 4)
  return { columns, tile: (content - (columns - 1) * gap) / columns }
}

describe('fluid layout', () => {
  it('gives the reading tiles 1-4 columns that grow with the viewport, never 5', () => {
    const seen = new Map<number, number>()
    for (let viewport = 320; viewport <= 1920; viewport += 20) {
      const { columns } = readingGrid(viewport)
      seen.set(columns, (seen.get(columns) ?? 0) + 1)
    }
    // Every count that appears must be one the design supports.
    expect([...seen.keys()].sort()).toEqual([1, 2, 3, 4])
    // One column for the narrowest phones, four for any laptop.
    expect(readingGrid(320).columns).toBe(1)
    expect(readingGrid(1440).columns).toBe(4)
    expect(readingGrid(1920).columns).toBe(4)
  })

  it('never lets a reading tile get narrower than the readable floor', () => {
    for (let viewport = 320; viewport <= 1920; viewport += 20) {
      // 9.5rem at the 16px root the tokens assume, minus nothing: the tile is
      // the track, so it must not fall under the floor the rule declares.
      expect(readingGrid(viewport).tile, `${viewport}px viewport`).toBeGreaterThanOrEqual(152)
    }
  })

  it('has no fixed multi-column grid left to disagree with the fluid one', () => {
    // This is the bug that was here: one element carried .key-readings-grid
    // (5 columns) and .uploaded-metrics-grid (4 columns), and source order
    // silently picked 4 for eight tiles. A single element must not be governed
    // by two grids, and no grid should hard-code a row it cannot know.
    expect(sheet).not.toMatch(/\.uploaded-metrics-grid\s*\{/)
    expect(sheet).not.toMatch(/grid-template-columns:\s*repeat\([2-9],/)
  })

  it('draws the tile seam without assuming where a row ends', () => {
    // `:last-child { border-right: 0 }` was correct for a single row and wrong
    // for any other. The rule now fills two trailing edges, which tiles at any
    // column count.
    expect(sheet).toMatch(/\.key-readings-grid \.weather-card \{[^}]*border-right:[^}]*border-bottom:/)
    expect(sheet).not.toMatch(/\.weather-card:last-child\s*\{[^}]*border/)
  })

  it('sizes the shell to the visible viewport with a fallback for older engines', () => {
    // Declared twice, smallest-support first: an engine without svh keeps the
    // vh declaration above it rather than collapsing to auto.
    expect(sheet).toMatch(/min-height:\s*100vh;\s*\n\s*min-height:\s*100svh;/)
    expect(sheet).toMatch(/min-height:\s*100vh; min-height:\s*100svh;/)
  })
})
