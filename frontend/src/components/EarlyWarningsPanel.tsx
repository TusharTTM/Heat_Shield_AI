import { useMemo } from 'react'
import { AlertTriangle, BellRing, Flame, Leaf, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useSettings } from '../context/SettingsContext'
import { useWeather } from '../context/WeatherContext'
import { buildEarlyWarnings, type EarlyWarning, type EarlyWarningType } from '../data/earlyWarnings'
import { useOfficialAlerts } from '../hooks/useOfficialData'
import { useT } from '../i18n'
import { RiskBadge } from './ui'

const TYPE_ICONS: Record<EarlyWarningType, LucideIcon> = {
  extremeHeat: Flame,
  heatIndex: Sun,
  airQuality: Leaf,
  official: BellRing,
  hotNights: Moon,
}

function WarningRow({ warning }: { warning: EarlyWarning }) {
  const t = useT()
  const Icon = TYPE_ICONS[warning.type]
  const hoursUntil = Math.max(0, Math.round((Date.parse(warning.onset) - Date.now()) / 3_600_000))
  return <li className={`early-warning-row risk-${warning.level}`}>
    <span className="early-warning-icon"><Icon size={17} aria-hidden="true" /></span>
    <div className="early-warning-copy">
      <strong>{warning.title}</strong>
      <small>{warning.detail}</small>
    </div>
    <div className="early-warning-meta">
      <RiskBadge level={warning.level} subtle />
      <span className="early-warning-when">{t('early.within', { hours: hoursUntil })}</span>
    </div>
  </li>
}

/**
 * Dashboard strip that turns the Profile → Heat alerts preferences into
 * visible behaviour: only enabled alert types appear, and only inside the
 * configured lead time. Screening signals, never official warnings — those
 * keep showing in the situation alert regardless of these settings.
 */
export function EarlyWarningsPanel() {
  const t = useT()
  const { region } = useApp()
  const { settings } = useSettings()
  const { data: weather, airQuality } = useWeather()
  const officialAlerts = useOfficialAlerts(region)
  const { earlyWarnings, leadHours, types } = settings.heatAlerts

  const warnings = useMemo(() => buildEarlyWarnings(
    {
      weather,
      air: airQuality,
      officialAlerts: { status: officialAlerts.status, data: officialAlerts.data },
    },
    { earlyWarnings, leadHours, types },
    new Date(),
  ), [weather, airQuality, officialAlerts.status, officialAlerts.data, earlyWarnings, leadHours, types])

  if (!earlyWarnings || warnings.length === 0) return null

  return <section className="early-warnings" aria-labelledby="early-warnings-title">
    <div className="early-warnings-heading">
      <div>
        <span className="uploaded-eyebrow"><AlertTriangle size={14} aria-hidden="true" />{t('early.title')}</span>
        <h2 id="early-warnings-title">{t('early.subtitle', { hours: leadHours })}</h2>
      </div>
    </div>
    <ul className="early-warning-list" aria-label={t('early.title')}>
      {warnings.map((warning) => <WarningRow key={warning.id} warning={warning} />)}
    </ul>
    <p className="early-warnings-note">{t('early.sourceNote')}</p>
  </section>
}
