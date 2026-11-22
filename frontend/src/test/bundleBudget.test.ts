import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the two regressions a UI audit found by measuring the real build:
 *
 * 1. Every visitor downloaded Leaflet's stylesheet (243 selectors) although no
 *    routed screen renders a map. A `main.tsx` import had it in the shared CSS.
 * 2. Every visitor downloaded Chart.js (148 kB) because all four secondary
 *    routes were imported eagerly in App.tsx.
 *
 * These assert on source, not on `dist/`, so they run without a build.
 */

const read = (path: string) => readFileSync(path, 'utf8')

describe('bundle budget', () => {
  it('does not import Leaflet styles into the entry point', () => {
    const main = read('src/main.tsx')
    // Re-adding this ships ~240 unused selectors to every visitor.
    expect(main).not.toMatch(/import\s+['"]leaflet\/dist\/leaflet\.css['"]/)
  })

  it('only styles Leaflet from the component that renders it', () => {
    // The app's own Leaflet theming may stay in index.css (it is scoped to
    // .leaflet-* and costs ~8 selectors), but the vendor sheet must not be global.
    const appStyles = read('src/styles/index.css')
    const leafletSelectors = appStyles.match(/^\.leaflet-[^,{]*/gm) ?? []
    expect(leafletSelectors.length).toBeLessThan(20)
  })

  it('loads every secondary route lazily so Chart.js stays off the dashboard', () => {
    const app = read('src/App.tsx')
    for (const page of ['MetricDetail', 'Assistant', 'Menu', 'Profile']) {
      expect(app, `${page} must be lazy()`).toMatch(
        new RegExp(`const ${page}\\s*=\\s*lazy\\(`),
      )
      expect(app, `${page} must not be a static import`).not.toMatch(
        new RegExp(`^import ${page} from`, 'm'),
      )
    }
    // The dashboard is the landing view; it stays in the entry chunk on purpose.
    expect(app).toMatch(/^import Dashboard from/m)
  })

  it('gives the lazy fallback an announced status rather than a bare spinner', () => {
    const app = read('src/App.tsx')
    expect(app).toMatch(/role="status"/)
  })
})

describe('built assets (when dist exists)', () => {
  const dist = 'dist/assets'
  const exists = (() => {
    try {
      return statSync(dist).isDirectory()
    } catch {
      return false
    }
  })()

  it.skipIf(!exists)('does not preload Chart.js for a dashboard visit', () => {
    // The precise regression: `manualChunks: { 'chart-vendor': [...] }` made
    // Rollup treat Chart.js as entry-like, so index.html carried a modulepreload
    // for it and every visitor paid 52 kB gzipped before any chart was opened.
    const html = read('dist/index.html')
    expect(html).not.toMatch(/modulepreload[^>]*chart/i)
    expect(html).toMatch(/modulepreload[^>]*react-vendor/)
  })

  it.skipIf(!exists)('keeps Chart.js inside the lazily loaded metric chunk', () => {
    const files = readdirSync(dist)
    const entry = files.find((name) => name.startsWith('index-') && name.endsWith('.js'))
    expect(entry, 'entry chunk missing — run npm run build').toBeDefined()
    // No chunk named after a vendor we no longer split.
    expect(files.some((name) => name.startsWith('chart-vendor-'))).toBe(false)
    // The chart code ships with the lazy view, not the entry.
    const lazy = files.filter((name) => /^(MetricDetail|index)-.*\.js$/.test(name))
    const sizes = lazy.map((name) => statSync(join(dist, name)).size)
    expect(Math.max(...sizes)).toBeGreaterThan(100_000) // the chart-bearing chunk
  })

  it.skipIf(!exists)('ships substantially less CSS than the Leaflet-polluted build', () => {
    const css = readdirSync(dist).find((name) => name.startsWith('index-') && name.endsWith('.css'))
    expect(css, 'built stylesheet missing').toBeDefined()
    const source = read(join(dist, css!))
    // Was 155.4 kB with Leaflet's vendor sheet inlined; the app's own ~8
    // .leaflet-* theming rules are expected and small.
    expect(statSync(join(dist, css!)).size).toBeLessThan(145_000)
    expect((source.match(/\.leaflet-/g) ?? []).length).toBeLessThan(20)
  })
})
