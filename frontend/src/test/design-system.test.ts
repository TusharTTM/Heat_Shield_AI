import { readFileSync, readdirSync } from 'node:fs'
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

  it('keeps the dashboard masthead from overflowing into its actions', () => {
    // The old seven-destination nav row is gone with the retired pages, so the
    // wrap/collapse assertions that guarded it went too. The live equivalent:
    // the masthead must not wrap and its action group must not shrink, or a
    // brand mark can collide with the city picker the way the old About link did.
    expect(sheet).toMatch(/\.dashboard-topbar\s*\{[^}]*display:\s*flex/)
    // The action group holds its width while the brand and picker give way.
    expect(sheet).toMatch(/\.dashboard-top-actions\s*\{[^}]*inline-flex/)
    // The picker row may wrap on narrow screens rather than push the actions off.
    expect(sheet).toMatch(/\.dashboard-location-row\s*\{[^}]*flex-wrap:\s*wrap/)
    // The retired nav must not creep back without a component to use it.
    expect(sheet).not.toMatch(/\.desktop-nav\s*\{/)
    expect(sheet).not.toMatch(/\.nav-container\s*\{/)
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
    // and the drawer backdrop. Nothing else is orchestrated. `spin` belonged to
    // the deleted WeatherLoading spinner, so it is gone with its only user.
    expect([...new Set(animated)].sort()).toEqual(['fade-in', 'loading-sweep', 'picker-in'])
    // Every entrance and every loading indicator is switched off under reduced motion.
    const reducedMotionBlocks = [...sheet.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n')
    expect(reducedMotionBlocks).toMatch(/\.action-checklist-loading-line\s*\{[^}]*animation:\s*none/)
    expect(reducedMotionBlocks).toMatch(/\.city-picker-popover\s*\{[^}]*animation:\s*none/)

  })

  it('has no stylesheet rule for a class the app stopped rendering', () => {
    // Deleting a component leaves its rules behind; that is exactly how the
    // retired nav, map scene and planner cards survived two redesigns. Classes
    // built as `${prefix}-${value}` are exempt because they never appear
    // literally in source, so their prefix is collected first.
    const source = readdirSync('src', { recursive: true })
      .map(String)
      .filter((f) => /\.(tsx?|ts)$/.test(f) && !f.includes('test') && !f.startsWith('styles'))
      .map((f) => readFileSync(`src/${f}`, 'utf8'))
      .join('\n')
    const dynamicPrefixes = new Set(
      [...source.matchAll(/([a-z][\w-]*?)-\$\{/g)].map((m) => m[1]),
    )
    const orphaned = [...new Set([...sheet.matchAll(/^\.([a-z][\w-]*)/gm)].map((m) => m[1]))]
      .filter((cls) => !new RegExp(`\\b${cls}\\b`).test(source))
      .filter((cls) => ![...dynamicPrefixes].some((p) => cls === p || cls.startsWith(`${p}-`)))
    expect(orphaned, `orphaned CSS classes: ${orphaned.slice(0, 12).join(', ')}`).toEqual([])
  })

  it('rounds corners only through the radius tokens', () => {
    // The stylesheet used to carry four competing radius idioms (99px, 999px,
    // 20px, 24px, 6px) while its own header claimed "nothing is rounded".
    // A perfect circle on a fixed-size element is the one legitimate literal.
    const literals = [...sheet.matchAll(/border-radius:\s*([^;]+);/g)]
      .map((m) => m[1].trim())
      .filter((value) => !value.startsWith('var(--radius'))
      .filter((value) => value !== '50%' && value !== '0' && value !== 'inherit')
    expect(literals, `hardcoded radii: ${literals.join(', ')}`).toEqual([])
    // And the header must describe what the stylesheet actually does.
    expect(sheet).not.toMatch(/Nothing is rounded/)
    expect(sheet).toMatch(/radius tokens only/)
  })

  it('keeps every declaration inside a rule, so the stylesheet still parses', () => {
    // Pruning an unused rule by deleting its selector line leaves the body behind
    // as bare declarations. `vite build` catches that; these tests did not, so the
    // same defect reached a green test run. Here a declaration is only legal after
    // an opening brace and before the matching closing one.
    let depth = 0
    const stray: string[] = []
    for (const raw of sheet.split('\n')) {
      const line = raw.trim()
      if (!line.startsWith('/*')) {
        const declaration = /^-?[a-z-]+\s*:/.test(line) && !line.startsWith('--') && !line.startsWith(':')
        if (declaration && depth === 0) stray.push(line)
      }
      depth += (raw.match(/{/g) ?? []).length - (raw.match(/}/g) ?? []).length
    }
    expect(stray).toEqual([])
    expect(depth).toBe(0)
    // No empty rule or empty at-rule block either.
    expect(sheet).not.toMatch(/\{\s*\}/)
  })

  it('carries the check stamp on the first line', () => {
    expect(sheet.split('\n')[0]).toMatch(/^\/\* Hallmark ·/)
  })
})
