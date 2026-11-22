import { useMemo } from 'react'
import {
  BellRing,
  Check,
  CloudSun,
  Droplets,
  FileText,
  Flame,
  Menu as MenuIcon,
  MessageCircle,
  ShieldCheck,
  Sun,
  Thermometer,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CityPicker } from '../components/CityPicker'
import { DayPlanner } from '../components/DayPlanner'
import { EarlyWarningsPanel } from '../components/EarlyWarningsPanel'
import { OfficialAlertsPanel } from '../components/OfficialAlertsPanel'
import { RiskBadge } from '../components/ui'
import { useApp } from '../context/AppContext'
import { useSettings } from '../context/SettingsContext'
import { useWeather } from '../context/WeatherContext'
import {
  buildDashboardSuggestions,
  computePreparednessProgress,
  getIstDateKey,
  selectPrimaryRiskSummary,
} from '../data/dashboardTasks'
import { assessAirQuality, assessHeat, europeanAqiCategory, usAqiCategory } from '../data/hazards'
import { getRegion } from '../data/regions'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useOfficialAlerts } from '../hooks/useOfficialData'
import { useT } from '../i18n'

type TaskCompletionStore = Record<string, string[]>

export default function Dashboard() {
  const t = useT()
  const { region } = useApp()
  const { formatTemp, tempSymbol } = useSettings()
  const selected = getRegion(region)
  const { status, data: weather, warning, airStatus, airQuality, airWarning } = useWeather()
  const officialAlerts = useOfficialAlerts(region)
  const primaryRisk = useMemo(() => selectPrimaryRiskSummary({
    weather,
    air: airQuality,
    weatherStatus: status,
    airStatus,
    officialAlerts,
  }), [airQuality, airStatus, officialAlerts, status, weather])

  const heat = weather ? assessHeat(weather) : null
  const airAssessment = airQuality ? assessAirQuality(airQuality) : null
  const primaryAqi = airQuality?.usAqi != null
    ? { label: 'US AQI', value: airQuality.usAqi, category: usAqiCategory(airQuality.usAqi) }
    : airQuality?.europeanAqi != null
      ? { label: 'European AQI', value: airQuality.europeanAqi, category: europeanAqiCategory(airQuality.europeanAqi) }
      : null
  const today = weather?.forecast[0]
  const latestOfficialAlert = officialAlerts.data?.alerts[0]

  const suggestions = useMemo(() => buildDashboardSuggestions(weather, airQuality), [airQuality, weather])
  const storageScope = `${getIstDateKey()}:${region}`
  const [completionStore, setCompletionStore] = useLocalStorage<TaskCompletionStore>('hs-dashboard-tasks-v1', {})
  const completedIds = completionStore[storageScope] ?? []
  const progress = useMemo(() => computePreparednessProgress(suggestions, completedIds), [completedIds, suggestions])

  const toggleTask = (taskId: string) => {
    setCompletionStore((previous) => {
      const current = previous[storageScope] ?? []
      const next = current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
      return { ...previous, [storageScope]: next }
    })
  }

  return <div className="uploaded-dashboard">
    <h1 className="sr-only">{t('dash.dashboardFor', { city: weather?.name ?? selected.name })}</h1>

    <header className="dashboard-topbar">
      <Link to="/" className="dashboard-brand" aria-label="Heat Shield dashboard">
        <span className="dashboard-brand-mark"><ShieldCheck size={23} aria-hidden="true" /></span>
        <span>{t('dash.brand')}</span>
      </Link>
      <div className="dashboard-top-actions">
        <a href="#situation-alert" className="dashboard-notify" aria-label={t('dash.notify')}><BellRing size={17} aria-hidden="true" /><span className="dashboard-action-label">{t('dash.notify')}</span></a>
        <Link to="/menu" className="dashboard-notify" aria-label={t('nav.menu')}><MenuIcon size={17} aria-hidden="true" /><span className="dashboard-action-label">{t('nav.menu')}</span></Link>
        <Link to="/profile" className="dashboard-profile"><UserRound size={17} aria-hidden="true" /><span>{t('nav.profile')}</span></Link>
      </div>
    </header>

    <div className="dashboard-overview">
      <div className="dashboard-overview-copy">
        <span className="dashboard-kicker">{t('dash.kicker')}</span>
        <p>{t('dash.lead')} <span>{t('dash.tail')}</span></p>
      </div>
      <div className="dashboard-location-row"><CityPicker /></div>
    </div>

    {(warning || airWarning) && <p className="dashboard-stale-note" role="status">{warning ?? airWarning}</p>}

    <section
      id="situation-alert"
      className={`uploaded-alert risk-${primaryRisk.level ?? 'unavailable'}`}
      aria-label="Official warnings versus model screening"
      aria-labelledby="overall-screening-title"
    >
      <div className="uploaded-alert-heading">
        <div>
          <span className="uploaded-eyebrow"><BellRing size={15} aria-hidden="true" />{t('dash.situation')} · <span className="uploaded-alert-place">{selected.name}, {selected.state}</span></span>
          <h2 id="overall-screening-title">{latestOfficialAlert ? t('dash.officialActive') : primaryRisk.bannerLabel}</h2>
        </div>
        {/* No RiskBadge here. The h2 already renders the same word ("High"),
            because bannerLabel is SCREENING_LABELS[level] — the badge printed it
            a second time right beside it. The level's colour still comes from
            this section's `risk-*` class, so nothing is lost by dropping it. */}
        {primaryRisk.level && latestOfficialAlert && <RiskBadge level={primaryRisk.level} />}
      </div>
      <p className="uploaded-alert-summary">
        {latestOfficialAlert
          ? latestOfficialAlert.headline ?? latestOfficialAlert.event ?? primaryRisk.shortReason
          : primaryRisk.shortReason}
      </p>
      <div className="uploaded-alert-footer">
        <span>{primaryRisk.officialSummary.headline}</span>
        <span className="alert-model-label">{t('dash.modelScreening')}</span>
      </div>
    </section>

    <EarlyWarningsPanel />
    <div id="official-warnings" className="dashboard-official-warnings">
      <OfficialAlertsPanel state={officialAlerts} />
    </div>
    <DayPlanner />

    <div className="dashboard-section-heading">
      <div><h2>{t('dash.conditions')}</h2></div>
      <span>{t('dash.weatherAir')}</span>
    </div>
    <section className="uploaded-metrics-grid key-readings-grid" aria-label="Dashboard readings and shortcuts">
      <MetricCard icon={Thermometer} title={t('metric.temperature')} value={weather ? formatTemp(weather.temperature) : '—'} unit={weather ? tempSymbol : undefined} detail={t('metric.modelAirTemp')} to="/metric/temperature" newTab />
      <MetricCard icon={Flame} title={t('metric.heatIndex')} value={weather ? formatTemp(weather.heatIndex) : '—'} unit={weather ? tempSymbol : undefined} detail={weather ? t('metric.feelsLike', { value: `${formatTemp(weather.apparentTemperature)}${tempSymbol}` }) : t('metric.notAssessed')} risk={heat?.level} to="/metric/heat-index" newTab />
      <MetricCard icon={Droplets} title={t('metric.humidity')} value={weather ? String(weather.humidity) : '—'} unit={weather ? '%' : undefined} detail={t('metric.relativeHumidity')} to="/metric/humidity" newTab />
      <MetricCard icon={Sun} title={t('metric.uvIndex')} value={today?.uvIndexMax == null ? '—' : today.uvIndexMax.toFixed(1)} unit={today?.uvIndexMax == null ? undefined : 'max'} detail={t('metric.dailyMax')} to="/metric/uv-index" newTab />
      <MetricCard
        icon={CloudSun}
        title={t('metric.airQuality')}
        value={primaryAqi ? primaryAqi.value.toFixed(0) : airStatus === 'loading' ? '…' : '—'}
        unit={primaryAqi?.label}
        detail={primaryAqi ? `${primaryAqi.category} · CAMS model` : airAssessment ? 'Modelled AQI unavailable' : t('metric.notAssessed')}
        risk={airAssessment?.level}
        to="/metric/air-quality"
        newTab
      />
      <ActionCard icon={ShieldCheck} title={t('metric.heatRisk')} value={heat?.level ?? 'Unassessed'} detail={t('metric.heatScreening')} to="/metric/heat-risk" newTab />
      <ActionCard
        icon={FileText}
        title={t('metric.reports')}
        value={officialAlerts.status === 'ready' ? String(officialAlerts.data?.count ?? 0) : '—'}
        detail={t('metric.officialWarnings')}
        {...(officialAlerts.status === 'ready' ? { to: '#official-warnings', label: `Open the ${officialAlerts.data?.count ?? 0} official warning matches` } : {})}
      />
      <ActionCard icon={MessageCircle} title={t('metric.assistant')} value={t('metric.open')} detail={t('metric.ask')} to="/assistant" />
    </section>

    <div className="uploaded-dashboard-lower-grid">
      <section className="uploaded-panel" aria-labelledby="dashboard-suggestions-title">
        <div className="uploaded-panel-heading">
          <div>
            <span className="uploaded-eyebrow">{t('dash.suggestionsKicker')}</span>
            <h2 id="dashboard-suggestions-title">{t('dash.suggestionsTitle')}</h2>
          </div>
        </div>
        {suggestions.length > 0 ? <ul className="uploaded-suggestion-list" aria-label={`Suggested precautions for ${selected.name}`}>
          {suggestions.slice(0, 3).map((task) => {
            const completed = completedIds.includes(task.id)
            return <li key={task.id} className={completed ? 'completed' : ''}>
              <label>
                <input type="checkbox" checked={completed} onChange={() => toggleTask(task.id)} />
                <span className="uploaded-checkmark" aria-hidden="true"><Check size={14} /></span>
                <span className="uploaded-suggestion-copy">
                  <span className="uploaded-suggestion-title">{task.title}</span>
                  <small>{task.level ? `${task.level[0].toUpperCase()}${task.level.slice(1)} screening` : 'Unassessed'}</small>
                </span>
              </label>
            </li>
          })}
        </ul> : <p className="uploaded-empty-copy">{t('dash.suggestionsEmpty')}</p>}
      </section>

      <section className="uploaded-panel mission-panel" aria-labelledby="dashboard-progress-title">
        <div className="uploaded-panel-heading">
          <div>
            <span className="uploaded-eyebrow">{t('dash.progressKicker')}</span>
            <h2 id="dashboard-progress-title">{t('dash.progressTitle')}</h2>
          </div>
        </div>
        <div className="mission-progress-copy">
          <strong>{progress.completedCount}<span>/{progress.totalCount}</span></strong>
          <p>{progress.completedCount === progress.totalCount && progress.totalCount > 0 ? t('dash.dailyPlanComplete') : t('dash.precautionsCompleted')}</p>
        </div>
        <progress value={progress.percent} max={100} aria-label={`Heat mission progress: ${progress.percent}%`} />
      </section>
    </div>
  </div>
}

function MetricCard({
  icon: Icon,
  title,
  value,
  unit,
  detail,
  risk,
  to,
  newTab = false,
  label,
}: {
  icon: LucideIcon
  title: string
  value: string
  unit?: string
  detail: string
  risk?: 'low' | 'moderate' | 'high' | 'extreme'
  /** Detail view for this metric; opens in a new tab so the dashboard stays open. */
  to?: string
  newTab?: boolean
  /** Overrides the generated link name when `to` is an in-page anchor. */
  label?: string
}) {
  const content = <>
    <h2 className="uploaded-tile-heading"><Icon size={17} aria-hidden="true" /><span>{title}</span></h2>
    <strong className={`uploaded-tile-value${value === '—' ? ' uploaded-tile-value--empty' : ''}`}>{value}{unit && <small>{unit}</small>}</strong>
    <span className="uploaded-tile-detail">{detail}</span>
  </>

  if (to) {
    // The link wraps the same <article> card the dashboard always rendered, so
    // the layout and styling stay identical while the whole card becomes openable.
    return <Link
      to={to}
      target={newTab ? '_blank' : undefined}
      className="metric-card-link"
      aria-label={label ?? `${title} — ${newTab ? 'open detail view in a new tab' : 'open detail view'}`}
    >
      <article className={`uploaded-tile weather-card${risk ? ` risk-${risk}` : ''}`}>{content}</article>
    </Link>
  }
  return <article className={`uploaded-tile weather-card${risk ? ` risk-${risk}` : ''}`}>{content}</article>
}

function ActionCard({
  icon: Icon,
  title,
  value,
  detail,
  to,
  newTab = false,
  label,
}: {
  icon: LucideIcon
  title: string
  value: string
  detail: string
  to?: string
  newTab?: boolean
  /** Overrides the generated link name when `to` is an in-page anchor. */
  label?: string
}) {
  const content = <>
    <h2 className="uploaded-tile-heading"><Icon size={17} aria-hidden="true" /><span>{title}</span></h2>
    <strong className={`uploaded-action-value${value === '—' ? ' uploaded-action-value--empty' : ''}`}>{value}</strong>
    <span className="uploaded-tile-detail">{detail}</span>
  </>

  return to
    ? <Link
      to={to}
      target={newTab ? '_blank' : undefined}
      className="uploaded-tile uploaded-action-tile"
      aria-label={label ?? (newTab ? `${title} — open detail view in a new tab` : undefined)}
    >{content}</Link>
    : <article className="uploaded-tile uploaded-action-tile">{content}</article>
}
