import { describe, expect, it } from 'vitest'

/**
 * Guards the drift that let six whole pages and a 993-line component sit in the
 * tree with no importer while README/CI still described them. Any page or
 * component must be reachable from an entry point (`main.tsx` or `App.tsx`),
 * from another reachable module, or be explicitly listed as intentionally
 * unrouted below.
 *
 * To retire a screen: delete the file. To keep one knowingly, add it here with
 * the reason, so the exception is visible in review.
 */
const UNROUTED = new Set<string>([
  // Retired screens kept only for history; every old path redirects to the
  // dashboard. Delete these files (and this allowlist) when convenient.
  'pages/About.tsx',
  'pages/Alerts.tsx',
  'pages/DisasterMonitor.tsx',
  'pages/Forecast.tsx',
  'pages/Maps.tsx',
  'pages/NotFound.tsx',
  'pages/Safety.tsx',
  // Support components used only by the retired screens above.
  'components/HazardCard.tsx',
  'components/IndiaRiskScene3D.tsx',
  'components/OfficialAlertsPanel.tsx',
  'components/RegionMap.tsx',
  // Dead since a dashboard redesign: the checklist and map-disclosure helpers
  // are no longer rendered anywhere. Safe to delete with the files above.
  'components/DashboardActionCards.tsx',
  'components/HashDisclosureOpener.tsx',
])

const modules = import.meta.glob(['../*.tsx', '../**/*.tsx', '../**/*.ts', '!../test/**', '!../**/*.test.*', '!../**/*.spec.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function nameOf(path: string): string {
  return path.replace(/^\.\.\//, '')
}

function importers(target: string): string[] {
  const base = nameOf(target).replace(/\.tsx?$/, '')
  const stem = base.split('/').pop()!
  return Object.entries(modules)
    .filter(([path]) => nameOf(path) !== nameOf(target))
    .filter(([, source]) =>
      new RegExp(`from ['"][^'"]*(?:\\.\\./|\\./)${stem}['"]`).test(source) ||
      new RegExp(`from ['"][^'"]*\\/${stem}['"]`).test(source),
    )
    .map(([path]) => nameOf(path))
}

describe('module reachability', () => {
  it('keeps every page reachable from the router', () => {
    const app = modules['../App.tsx']
    expect(app).toBeDefined()
    for (const page of ['Dashboard', 'MetricDetail', 'Assistant', 'Menu', 'Profile']) {
      expect(app, `${page} must be routed`).toContain(`./pages/${page}`)
    }
  })

  it('has no page or component without an importer unless it is allowlisted', () => {
    const orphans: string[] = []
    for (const path of Object.keys(modules)) {
      const name = nameOf(path)
      if (!/^(pages|components)\//.test(name)) continue
      if (UNROUTED.has(name)) continue
      if (importers(path).length === 0) orphans.push(name)
    }
    expect(orphans, `unreferenced modules (delete them or add to UNROUTED with a reason): ${orphans.join(', ')}`).toEqual([])
  })

  it('does not keep an allowlist entry whose file is already gone', () => {
    const present = new Set(Object.keys(modules).map(nameOf))
    const stale = [...UNROUTED].filter((entry) => !present.has(entry))
    expect(stale, `remove these from UNROUTED: ${stale.join(', ')}`).toEqual([])
  })
})
