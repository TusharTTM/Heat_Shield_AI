import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The reading sheet is a grid of five tiles whose column count steps down as the
 * viewport narrows, and every step is a place where a tile can quietly become
 * unreadable or a row can be left with one lonely tile and a band of dead page.
 * jsdom reports every box as 0x0, so a rendered assertion would pass against
 * anything. These tests read the sheet instead, resolve the arithmetic at real
 * viewport widths, and assert the result.
 *
 * The rule they encode: five tracks while a tile can stay readable, then step
 * down as a set. The readable floor is 150px. `repeat(4, ...)` with the fifth
 * tile stretched across the width was here before this — it closed the orphan
 * row but turned one reading into a full-width empty band, which reads as a
 * different kind of thing from the other four.
 */

const sheet = readFileSync('src/styles/index.css', 'utf8')
const tokens = readFileSync('src/styles/tokens.css', 'utf8')
const base = readFileSync('src/styles/base.css', 'utf8')

/** Track count from a `grid-template-columns` value, or a stop-the-world error. */
function tracksIn(declaration: string): number {
  const fixed = /^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/.exec(declaration.trim())
  if (fixed) return Number(fixed[1])
  const single = /^minmax\(0,\s*1fr\)$/.exec(declaration.trim())
  if (single) return 1
  throw new Error(`unexpected grid-template-columns for .key-readings-grid: ${declaration.trim()}`)
}

interface Step {
  /** Upper bound of the media query, or Infinity for the base rule. */
  upTo: number
  columns: number
  /** The block that declared it, for reporting. */
  body: string
}

/**
 * Every column-count step for `.key-readings-grid`, in source order. CSS applies
 * all matching rules in order and the last one wins, so the list is ordered and
 * the resolve step below walks it — it does not pick by specificity.
 */
function columnSteps(): Step[] {
  const steps: Step[] = []

  // Media-query blocks first, so the base rule can be appended after them in
  // source order. Each block is matched with its own brace pair, which is
  // enough here because nothing nests.
  const media = /@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g
  const mediaBlocks: { upTo: number; body: string; index: number }[] = []
  for (const match of sheet.matchAll(media)) {
    mediaBlocks.push({ upTo: Number(match[1]), body: match[2], index: match.index ?? 0 })
  }

  const gridRule = (body: string): string | null => {
    const rule = /\.key-readings-grid\s*\{([^}]*)\}/.exec(body)
    if (!rule) return null
    const declaration = /grid-template-columns:\s*([^;]+);/.exec(rule[1])
    return declaration?.[1].trim() ?? null
  }

  // The base rule: the last top-level `.key-readings-grid` block that sets a
  // column count and is not inside a media block. Its position in the sheet
  // decides where it sorts.
  const topLevel = [...sheet.matchAll(/^\.key-readings-grid\s*\{([^}]*)\}/gm)]
    .map((m) => {
      const declaration = /grid-template-columns:\s*([^;]+);/.exec(m[1])
      return { index: m.index ?? 0, declaration: declaration?.[1].trim() ?? null }
    })
    .filter((r): r is { index: number; declaration: string } => r.declaration !== null)

  const typed: { index: number; step: Step }[] = [
    ...mediaBlocks.flatMap((block) => {
      const declaration = gridRule(block.body)
      if (declaration === null) return []
      return [{ index: block.index, step: { upTo: block.upTo, columns: tracksIn(declaration), body: block.body } }]
    }),
    ...topLevel.map((rule) => ({
      index: rule.index,
      step: { upTo: Infinity, columns: tracksIn(rule.declaration), body: rule.declaration },
    })),
  ]

  typed.sort((a, b) => a.index - b.index).forEach((entry) => steps.push(entry.step))
  return steps
}

const steps = columnSteps()

/** Column count for `.key-readings-grid` at a viewport width. */
function columns(viewport: number): number {
  // Last matching step wins, exactly as the cascade does.
  const matching = steps.filter((step) => viewport <= step.upTo)
  if (matching.length === 0) throw new Error(`no column rule matches a ${viewport}px viewport`)
  return matching[matching.length - 1].columns
}

/** Content width the sheet gets: the page caps at 1120px and pads by --gutter. */
function contentWidth(viewport: number): number {
  const cap = /width:\s*min\(100%,\s*(\d+)px\)/.exec(sheet)?.[1]
  if (!cap) throw new Error('.dashboard-shell .page-content has no width cap to measure against')
  // Mirrors base.css: 32px, then 24px under 60rem, then 16px under 40rem.
  const gutter = viewport <= 640 ? 16 : viewport <= 960 ? 24 : 32
  const declaredDesktop = Number(/--gutter:\s*(\d+)px/.exec(tokens)?.[1] ?? 32)
  const below60 = /@media \(max-width: 60rem\)\s*\{\s*:root \{ --gutter: (\d+)px/.exec(base)?.[1]
  const below40 = /@media \(max-width: 40rem\)\s*\{\s*:root \{ --gutter: (\d+)px/.exec(base)?.[1]
  const resolved = viewport <= 640 ? Number(below40) : viewport <= 960 ? Number(below60) : declaredDesktop
  if (resolved !== gutter) {
    throw new Error(`gutter model drifted: base.css resolves ${resolved}px at ${viewport}px, test assumes ${gutter}px`)
  }
  return Math.min(viewport, Number(cap)) - 2 * gutter
}

function tileWidth(viewport: number): number {
  const count = columns(viewport)
  const gap = Number(/--space-4:\s*(\d+)px/.exec(tokens)?.[1])
  return (contentWidth(viewport) - (count - 1) * gap) / count
}

/** Does the sheet close its own ragged last row at this column count? */
function closesLastRow(): boolean {
  // A row of five over N columns is complete when N divides five, or when the
  // sheet spans the leftover tail. Leaving one tile alone with empty cells
  // beside it is the failure this whole file exists to catch.
  return /\.key-readings-grid > :last-child:nth-child\(odd\)\s*\{\s*grid-column: 1 \/ -1;/.test(sheet)
}

describe('reading sheet columns', () => {
  it('uses every count from one to five and never more than five', () => {
    const seen = new Set<number>()
    for (let viewport = 320; viewport <= 1920; viewport += 4) seen.add(columns(viewport))
    expect([...seen].sort()).toEqual([1, 2, 3, 5])
  })

  it('holds one flush row of five on any laptop', () => {
    for (const viewport of [1024, 1280, 1440, 1920]) {
      expect(columns(viewport), `${viewport}px`).toBe(5)
    }
  })

  it('never lets a tile fall under the readable floor', () => {
    for (let viewport = 320; viewport <= 1920; viewport += 4) {
      expect(tileWidth(viewport), `${viewport}px viewport`).toBeGreaterThanOrEqual(150)
    }
  })

  it('closes a ragged last row instead of leaving one tile alone', () => {
    // Five tiles split 2 + 2 + 1 at two columns: the tail spans the full width.
    expect(columns(390)).toBe(2)
    expect(closesLastRow()).toBe(true)
    // Three columns split 3 + 2, so the tail has a neighbour and must NOT span.
    expect(columns(760)).toBe(3)
    expect(sheet).toMatch(/@media \(max-width: 599px\)/)
  })

  it('has no fixed multi-column grid left to disagree with the sheet', () => {
    // The original bug: one element carried .key-readings-grid (5 columns) and
    // .uploaded-metrics-grid (4 columns), and source order silently picked 4.
    expect(sheet).not.toMatch(/\.uploaded-metrics-grid\s*\{/)
    // Every .key-readings-grid column count is a fluid 1fr track list, so no
    // count can be smaller than the space it is given.
    for (const step of steps) {
      expect(step.body, `a step declares a fixed-width track`).not.toMatch(/repeat\(\d+,\s*\d/)
    }
  })

  it('draws the tile seam without assuming where a row ends', () => {
    // `:last-child { border-right: 0 }` was correct for a single row and wrong
    // for any other. The rule fills two trailing edges, which tiles at any
    // column count.
    expect(sheet).toMatch(/\.key-readings-grid \.weather-card \{[^}]*border-right:[^}]*border-bottom:/)
    expect(sheet).not.toMatch(/\.weather-card:last-child\s*\{[^}]*border/)
  })
})

describe('dashboard spacing', () => {
  it('leaves the section rhythm to one gap rule, not five margins', () => {
    // Four separate margins used to stack on the column gap, producing 12, 20,
    // 28, 36 and 44px between sections — the "big gap". Any section that adds
    // its own top margin brings that back.
    const column = /\.uploaded-dashboard \{[^}]*gap:\s*var\(--space-5\)/.test(sheet)
    expect(column, 'the dashboard column lost its single gap').toBe(true)
    for (const selector of ['.dashboard-official-warnings', '.official-cap-panel']) {
      const escaped = selector.replace('.', '\\.')
      expect(sheet, `${selector} still adds its own top margin`).not.toMatch(
        new RegExp(`${escaped}\\s*\\{[^}]*margin-top:\\s*var\\(--space-`),
      )
    }
  })

  it('sizes the shell to the visible viewport with a fallback for older engines', () => {
    // Declared twice, smallest-support first: an engine without svh keeps the
    // vh declaration above it rather than collapsing to auto.
    expect(sheet).toMatch(/min-height:\s*100vh;\s*\n\s*min-height:\s*100svh;/)
    expect(sheet).toMatch(/min-height:\s*100vh; min-height:\s*100svh;/)
  })
})
