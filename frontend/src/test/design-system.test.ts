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
    expect(sheet).toMatch(/\.city-picker-popover \{[^}]*box-shadow:\s*var\(--shadow-float\)/)
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

  it('never hides a section except behind the class that can un-hide it', () => {
    // The reveal's whole safety property: a section is only held out of view
    // under `.is-reveal-ready`, which useScrollReveal adds itself, in the same
    // effect that attaches the observer. An unscoped `.scroll-section {
    // opacity: 0 }` would leave a script-less or failed load with a blank page.
    // Comments are stripped first. The reveal's own comment explains the
    // class by name, and a selector regex that swallows it "finds"
    // is-reveal-ready in an unscoped rule and passes when it should fail.
    const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...bare.matchAll(/([^{}]*\.scroll-section[^{}]*)\{([^}]*)\}/g)]
      .map(([, selector, body]) => [selector.split('}').pop() ?? selector, body] as const)
    expect(blocks.length).toBeGreaterThan(0)
    for (const [selector, body] of blocks) {
      const hides = /opacity:\s*0(?![.\d])/.test(body) || /visibility:\s*hidden/.test(body)
      if (hides) expect(selector.trim(), `unscoped hidden state: ${selector.trim()}`).toContain('is-reveal-ready')
    }
  })

  it('keeps the reveal to transform and opacity, never layout', () => {
    // Animating height/margin/filter would reflow every section on the page.
    const reveal = [...sheet.matchAll(/\.is-reveal-ready \.scroll-section[^{]*\{([^}]*)\}/g)]
      .map((m) => m[1])
      .join('\n')
    expect(reveal).toContain('transform: translateY(')
    expect(reveal).not.toMatch(/(?:^|;)\s*(?:height|margin|padding|width|top|left|filter|box-shadow):/)
  })

  it('reveals the readings grid as one sheet, not card by card', () => {
    // The tiles carry half-borders that only form a sheet when flush. A
    // staggered or lifted tile opens a seam onto the page background.
    expect(sheet).toMatch(/\.is-reveal-ready \.key-readings-grid > \* \{[^}]*opacity:\s*1/)
    expect(sheet).toMatch(/\.is-reveal-ready \.key-readings-grid > \* \{[^}]*transition:\s*none/)
  })

  it('turns the reveal off entirely, not just faster, under reduced motion', () => {
    // Collapsing the duration leaves below-fold sections at opacity 0 until an
    // observer fires. That pops, and it leaves the page incomplete for anyone
    // who never scrolls. Verified in a real browser: 0 sections hidden.
    const reduced = [...sheet.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n')
    expect(reduced).toMatch(/\.is-reveal-ready \.scroll-section[^{]*\{[^}]*opacity:\s*1/)
    expect(reduced).toMatch(/\.is-reveal-ready \.scroll-section[^{]*\{[^}]*transform:\s*none/)
  })

  it('prints every section even when the page was scrolled to the top', () => {
    const print = [...sheet.matchAll(/@media print\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n')
    expect(print).toMatch(/\.is-reveal-ready \.scroll-section[^{]*\{[^}]*opacity:\s*1/)
    expect(print).toMatch(/\.is-reveal-ready \.scroll-section[^{]*\{[^}]*transition:\s*none/)
  })

  it('never leaves the frame offset on a settled intro phase', () => {
    // The base `.brand-intro-copy` rule carries the entrance lift. A phase that
    // declares only `opacity` silently falls back to that lift, and the wordmark
    // dropped 10px at the handover — the exact jump the intro must not have.
    // Every phase where the copy is at rest must cancel the transform.
    for (const p of ['enter', 'merge', 'land']) {
      const rule = new RegExp(`\\.brand-intro\\[data-phase='${p}'\\] \\.brand-intro-copy \\{[^}]*\\}`)
      const found = sheet.match(rule)
      expect(found, `missing rule for ${p}`).not.toBeNull()
      expect(found![0], `phase ${p} lets the entrance lift through`).toMatch(/transform:\s*none/)
    }
  })

  it('cross-fades the copy in place instead of fading it mid-flight', () => {
    // Fading during the travel makes the wordmark dissolve on its way and the
    // page brand pop in — the merge reads as a cut, not a landing. The travel
    // phase must keep the copy opaque; only the landed phase fades it.
    const merge = sheet.match(/\.brand-intro\[data-phase='merge'\] \.brand-intro-copy \{[^}]*\}/)
    expect(merge?.[0]).toMatch(/opacity:\s*1/)
  })

  it('lays the copy out as a grid item, not a line box', () => {
    // As a block child the inline-flex copy is pushed down by the inherited
    // half-leading, which put it 10px below the brand at every breakpoint.
    expect(sheet).toMatch(/\.brand-intro-stage \{[^}]*display:\s*grid/)
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

  it('never leaks the location in the URL to another origin', () => {
    // Readings are per-city, so the document URL carries a location. GitHub
    // Pages cannot set response headers, so the meta tag is the only lever.
    const html = readFileSync('index.html', 'utf8')
    expect(html).toMatch(/<meta name="referrer" content="strict-origin-when-cross-origin" \/>/)
    // A looser value would send the full path, including coordinates.
    expect(html).not.toMatch(/name="referrer" content="(?:unsafe-url|origin-when-cross-origin)"/)
  })

  it('meets the Web Interface Guidelines checks a stylesheet can carry', () => {
    // Vercel's Web Interface Guidelines, as far as CSS can prove them. Each of
    // these was violated somewhere in the app when the guideline was adopted.
    // 1. Never disable zoom.
    const html = readFileSync('index.html', 'utf8')
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/)
    // 2. Dark-first: color-scheme and theme-color agree with the actual canvas.
    expect(tokens).toMatch(/color-scheme:\s*dark/)
    expect(html).toMatch(/<html[^>]*data-theme="dark"/)
    expect(html).toMatch(/theme-color" content="#120e09"/)
    // 3. A visible focus ring exists globally, and no rule removes one without
    //    either a replacement outline or a focus-within treatment on the parent.
    expect(base).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/)
    //    Three opt-outs are deliberate and each is listed here:
    //      .page-content          a scroll target, not a control (skip link)
    //      .city-picker-search input  the ring moves to the parent :focus-within
    //      .assistant-prompt      the ring moves to .assistant-composer:focus-within
    //      .page-content no longer appears: the skip-link target keeps its own
    //      ring now, offset inward so it does not clip against the viewport.
    const FOCUS_HANDLED_BY_PARENT = ['.city-picker-search input', '.assistant-prompt']
    const stripped = [...sheet.matchAll(/([^{}]+)\{[^}]*outline:\s*(?:none|0)[^}]*\}/g)]
      .map((m) => m[1].trim())
      // A selector that carries a preceding comment is still that selector.
      .map((selector) => selector.split('*/').pop()!.trim())
      .filter((selector) => !FOCUS_HANDLED_BY_PARENT.includes(selector))
    expect(stripped).toEqual([])
    // And the two focus-within replacements must actually exist.
    expect(sheet).toMatch(/\.city-picker-search:focus-within/)
    expect(sheet).toMatch(/\.assistant-composer:focus-within/)
    // 4. Motion is opt-out, and never `transition: all`.
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(all).not.toMatch(/transition:\s*all/)
    // 5. Taps act immediately; the risk scene opts into `none` deliberately.
    expect(base).toMatch(/touch-action:\s*manipulation/)
    // 6. Full-bleed fixed surfaces respect the notch and home indicator.
    expect(sheet).toMatch(/env\(safe-area-inset-bottom\)/)
    // 7. Scroll containers inside overlays must not chain to the page.
    expect(sheet).toMatch(/overscroll-behavior:\s*contain/)
  })

  it('keeps every touch control at or above the 44px floor', () => {
    // ui-ux-pro-max priority 2 (Touch & Interaction): 44x44 minimum, and small
    // screens must never shrink below it. Icon-only controls expand their hit
    // area instead of their glyph, so the check accepts either width/height or
    // min-height/min-width at 44 or more.
    const CONTROL = /button|link|trigger|option|close|action|switch|pill|chip|row/
    const offenders: string[] = []
    for (const match of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim()
      if (!CONTROL.test(selector)) continue
      if (/\bsvg\b|thumb|loading-line/.test(selector)) continue
      const body = match[2]
      // A control may be sized with min-height or with a plain height; both are
      // checked, because a fixed 30px switch escapes a min-height-only scan.
      const minHeight = /min-height:\s*(\d+)px/.exec(body)
      if (minHeight && Number(minHeight[1]) < 44) offenders.push(`${selector} min-height ${minHeight[1]}`)
      const fixed = /(?:^|[;{\s])height:\s*(\d+)px/.exec(body)
      if (fixed && Number(fixed[1]) < 44) offenders.push(`${selector} height ${fixed[1]}`)
    }
    expect(offenders).toEqual([])
    // Adjacent icon rows keep at least the 8px gap the same rule requires.
    for (const selector of ['.chat-history-actions', '.page-jump-links', '.dashboard-shortcuts']) {
      const escaped = selector.replace(/\./g, '\\.')
      expect(sheet, selector).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*gap:\\s*var\\(--space-[2-9]`))
    }
  })

  it('gives every hover fill a pressed state instead of relying on hover alone', () => {
    // Touch devices never hover, so a control whose only feedback is :hover has
    // no feedback at all there. Each of these had a bare hover style.
    for (const selector of [
      '.chat-history-action',
      '.profile-button',
      '.settings-switch',
      '.profile-button.primary',
      '.profile-button.danger',
    ]) {
      const escaped = selector.replace(/\./g, '\\.')
      expect(sheet, selector).toMatch(new RegExp(`${escaped}[^{]*:active`))
    }
    // And hover-only tinting is dropped where it would stick to a tapped row.
    expect(base).toMatch(/@media \(hover: none\)/)
  })

  it('carries the check stamp on the first line', () => {
    expect(sheet.split('\n')[0]).toMatch(/^\/\* Hallmark ·/)
  })
})
