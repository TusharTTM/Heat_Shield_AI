import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BookOpen, HelpCircle, Sparkles, X } from 'lucide-react'

export interface TermDefinition {
  term: string
  plain: string
  technical: string
}

export const GLOSSARY_TERMS = {
  heatIndex: {
    term: 'Heat index',
    plain: 'How hot the air feels to the human body when air temperature and humidity are combined in shade.',
    technical: 'Calculated deterministically using the NOAA/NWS Rothfusz regression with low- and high-humidity adjustments, assuming shade and light wind.',
  },
  apparentTemperature: {
    term: 'Feels like (apparent temperature)',
    plain: 'Open-Meteo’s estimate of outdoor thermal comfort factoring in temperature, humidity, and wind.',
    technical: 'Distinct from the NOAA/NWS shade heat index; wind can lower apparent temperature even when humid shade heat index remains high.',
  },
  cams: {
    term: 'CAMS air-quality model',
    plain: 'A computer atmospheric forecast (Copernicus Atmosphere Monitoring Service) that estimates city-grid air pollution.',
    technical: 'Provided via the Open-Meteo Air Quality API. Modelled grid estimates are not physical readings from ground-level CPCB monitoring stations.',
  },
  usVsEuAqi: {
    term: 'US AQI vs European AQI',
    plain: 'Two international air-quality scales with different number ranges (US: 0–500; European: 0–100+). HeatShield shows both and uses whichever gives the higher caution level.',
    technical: 'US AQI maps 0–50 Low, 51–150 Moderate, 151–200 High, >200 Extreme. European AQI maps 0–40 Low, 41–60 Moderate, 61–80 High, >80 Extreme. Neither is Indian CPCB NAQI.',
  },
  cpcbAqi: {
    term: 'Indian CPCB AQI',
    plain: 'Official air-quality index measured at physical Central Pollution Control Board ground stations in India.',
    technical: 'Retrieved only when an optional FastAPI backend is configured with a server-side data.gov.in key (resource 3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69). Never estimated from CAMS.',
  },
  cap: {
    term: 'CAP (Common Alerting Protocol)',
    plain: 'The international digital format used by NDMA SACHET and IMD to publish official disaster warnings with affected areas, severity, and expiry times.',
    technical: 'Validated XML messages from sachet.ndma.gov.in. Requires a configured FastAPI backend; static GitHub Pages cannot fetch cross-origin CAP XML directly.',
  },
  pm: {
    term: 'PM2.5 & PM10 (µg/m³)',
    plain: 'Tiny airborne particles measured in micrograms per cubic metre of air (µg/m³). PM2.5 is fine smoke/exhaust; PM10 includes coarser dust.',
    technical: 'PM2.5 refers to particulate matter ≤2.5 micrometres in diameter; PM10 refers to particulate matter ≤10 micrometres.',
  },
  deterministic: {
    term: 'Deterministic rules (not AI/ML)',
    plain: 'Fixed, published threshold formulas where the same temperature, humidity, or AQI input always produces the exact same result.',
    technical: 'No machine-learning model or probabilistic forecast runs in this public web interface; repository ML training workflows remain separate offline/CI candidates.',
  },
  freshness: {
    term: 'Model time vs Last updated',
    plain: '“Model time” is the hour the weather/air model represents; “Last updated” is when your browser downloaded it (cached for 10 minutes).',
    technical: 'If a live refresh fails while cached data exists, HeatShield marks the data “Stale cached data” instead of pretending it is fresh.',
  },
} as const satisfies Record<string, TermDefinition>

export function TermHelp({
  definition,
  label,
}: {
  definition: TermDefinition
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const popoverId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  return (
    <span
      ref={rootRef}
      className={`term-help${open ? ' open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="term-help-trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`Explain term: ${definition.term}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <HelpCircle size={14} aria-hidden="true" />
        <span>{label ?? 'What’s this?'}</span>
      </button>
      {open && (
        <span id={popoverId} className="term-help-popover" role="region" aria-label={`${definition.term} definition`}>
          <span className="term-help-header">
            <strong>{definition.term}</strong>
            <button type="button" className="term-help-close" aria-label={`Close ${definition.term} explanation`} onClick={() => close(true)}>
              <X size={14} aria-hidden="true" />
            </button>
          </span>
          <span className="term-help-plain"><strong>In plain language:</strong> {definition.plain}</span>
          <span className="term-help-tech"><strong>Technical detail:</strong> {definition.technical}</span>
        </span>
      )}
    </span>
  )
}

export interface JumpItem {
  id: string
  label: string
}

export function PageJumpNav({ items, label = 'On this page' }: { items: JumpItem[]; label?: string }) {
  return (
    <nav className="page-jump-nav" aria-label={label}>
      <span className="page-jump-label"><BookOpen size={14} aria-hidden="true" />Jump to:</span>
      <div className="page-jump-links">
        {items.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="page-jump-pill">{item.label}</a>
        ))}
      </div>
    </nav>
  )
}

export function SectionIntro({
  id,
  eyebrow,
  title,
  summary,
  action,
}: {
  id?: string
  eyebrow: string
  title: string
  summary: string
  action?: ReactNode
}) {
  return (
    <div id={id} className="section-intro">
      <div>
        <span className="section-label">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{summary}</p>
      </div>
      {action && <div className="section-intro-action">{action}</div>}
    </div>
  )
}

export function IllustrativeExample({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <aside className="illustrative-example" aria-label={`Illustrative example: ${title}`}>
      <div className="illustrative-example-badge">
        <Sparkles size={14} aria-hidden="true" />
        <span>Illustrative example · not live data</span>
      </div>
      <strong>{title}</strong>
      <p>{children}</p>
    </aside>
  )
}
