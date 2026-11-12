import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(`src/styles/${f}`, 'utf8')
const tokens = read('tokens.css')
const base = read('base.css')
const sheet = read('index.css')
const all = [tokens, base, sheet].join('\n')

/**
 * These lock the Formwork system in place. Every rule below was a real defect in
 * the previous stylesheet: 128 colour literals bypassing the token block, labels
 * in tracked capitals, layout properties in transitions, and shapes at the wrong
 * radius. If a future edit reintroduces one, this fails rather than drifting.
 */
describe('design system', () => {
  it('declares every custom property it uses', () => {
    const declared = new Set([...all.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
    const used = new Set([...all.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    expect([...used].filter((v) => !declared.has(v))).toEqual([])
  })

  it('keeps every colour inside the token block', () => {
    const outsideTokens = all
      .split('\n')
      .filter((line) => !/^\s*--[a-z0-9-]+\s*:/.test(line))
      .join('\n')
    expect([...outsideTokens.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(/gi)].map((m) => m[0])).toEqual([])
  })

  it('never transitions all, and never animates layout properties', () => {
    expect(all).not.toMatch(/transition:\s*all/)
    expect(all).not.toMatch(/transition:[^;]*\b(width|height|top|left)\b/)
  })

  it('keeps labels out of tracked capitals', () => {
    // Capitalised display heads are the theme's voice; label roles are not.
    expect(sheet).not.toMatch(/\.(section-label|page-jump-label)[^{]*\{[^}]*text-transform:\s*uppercase/)
    expect(sheet).not.toMatch(/\.(section-label|page-jump-label)[^{]*\{[^}]*letter-spacing:\s*0\.0\d/)
    expect(sheet).not.toMatch(/\.alert-metadata dt[^{]*\{[^}]*text-transform:\s*uppercase/)
  })

  it('clips overflow on both html and body, and never reaches for 100vw', () => {
    expect(base).toMatch(/html,\s*body\s*\{\s*overflow-x:\s*clip/)
    expect(all).not.toMatch(/100vw/)
  })

  it('gives every risk state a distinct fill that carries ink text', () => {
    for (const state of ['low', 'moderate', 'high', 'extreme']) {
      expect(sheet).toContain(`.risk-badge.risk-${state}`)
    }
    expect(tokens).toMatch(/--risk-low:/)
    expect(tokens).toMatch(/--risk-watch:/)
    expect(tokens).toMatch(/--risk-warning:/)
    expect(tokens).toMatch(/--risk-severe:/)
  })

  it('ships reduced-motion and visible-focus fallbacks', () => {
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(base).toMatch(/:focus-visible\s*\{\s*outline:/)
    expect(sheet).toMatch(/prefers-reduced-motion:\s*reduce/)
  })

  it('uses the theme faces and no framework defaults', () => {
    expect(tokens).toContain('--font-display: "Oswald"')
    expect(tokens).toContain('--font-body: "Archivo"')
    expect(tokens).toContain('--font-outlier: "Archivo Narrow"')
    // No face from the previous system survives, and no framework default is the display.
    expect(all).not.toMatch(/Inter Variable|IBM Plex Mono/)
    expect(all).not.toMatch(/--font-(display|body|outlier):\s*"(Inter|Roboto|Open Sans|Poppins|Lato|Arial)"/)
  })

  it('never lets the nav row wrap, so a link cannot end up under the city picker', () => {
    // A real browser caught this: the picker's subtree intercepted a click on the
    // About link because the header row was allowed to overflow. The row never
    // wraps now, the labels shrink, and the desktop nav collapses to a menu at
    // 1100px rather than letting seven destinations crowd the picker.
    expect(sheet).toMatch(/\.nav-container\s*\{[^}]*flex-wrap:\s*nowrap/)
    expect(sheet).toMatch(/\.desktop-nav\s*\{[^}]*flex-shrink:\s*1/)
    expect(sheet).toMatch(/\.nav-actions\s*\{[^}]*flex-shrink:\s*0/)
    expect(sheet).toMatch(/\.brand\s*\{[^}]*flex-shrink:\s*0/)
    const collapse = sheet.match(/@media \(max-width: (\d+)px\) \{\s*\.desktop-nav \{ display: none; \}/)
    expect(collapse).not.toBeNull()
    expect(Number(collapse![1])).toBeGreaterThanOrEqual(1100)
  })

  it('keeps the city name and state as separate blocks with a list that has no markers', () => {
    // Without a grid on the wrapper, <strong>Pune</strong><small>Maharashtra</small>
    // rendered as one unspaced run and the option's accessible name lost its space.
    expect(sheet).toMatch(/\.city-picker-option-copy \{[^}]*display:\s*grid/)
    expect(sheet).toMatch(/\.city-picker-options \{[^}]*list-style:\s*none/)
    expect(sheet).toMatch(/\.city-picker-search \{[^}]*display:\s*flex/)
    // The panel is a real surface: rounded, lifted, and anchored under its trigger.
    expect(sheet).toMatch(/\.city-picker-popover \{[^}]*border-radius:/)
    expect(sheet).toMatch(/\.city-picker-popover \{[^}]*box-shadow:\s*var\(--shadow-glow\)/)
    expect(sheet).toMatch(/\.city-picker-popover \{[^}]*animation:\s*picker-in/)
  })

  it('names every animation and keeps motion off layout properties', () => {
    const animated = [...sheet.matchAll(/animation:\s*([a-z-]+)/g)]
      .map((m) => m[1])
      .filter((name) => name !== 'none') // the reduced-motion override is not an animation
    // Loading affordances plus the two entrances this theme adds: the city panel
    // and the drawer backdrop. Nothing else is orchestrated.
    expect([...new Set(animated)].sort()).toEqual(['fade-in', 'loading-sweep', 'picker-in', 'spin'])
    // Every entrance and every loading indicator is switched off under reduced motion.
    const reducedMotionBlocks = [...sheet.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n')
    expect(reducedMotionBlocks).toMatch(/\.weather-spinner\s*\{[^}]*animation:\s*none/)
    expect(reducedMotionBlocks).toMatch(/\.action-checklist-loading-line\s*\{[^}]*animation:\s*none/)
    expect(reducedMotionBlocks).toMatch(/\.city-picker-popover\s*\{[^}]*animation:\s*none/)
  })

  it('carries the check stamp on the first line', () => {
    expect(sheet.split('\n')[0]).toMatch(/^\/\* Hallmark ·/)
  })
})
