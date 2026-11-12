import { useMemo } from 'react'
import {
  BellRing,
  Check,
  CloudSun,
  Droplets,
  FileText,
  Flame,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sun,
  Thermometer,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CityPicker } from '../components/CityPicker'
import { RiskBadge } from '../components/ui'
import { useApp } from '../context/AppContext'
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

type TaskCompletionStore = Record<string, string[]>

export default function Dashboard() {
  const { region } = useApp()
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
    <h1 className="sr-only">Heat Shield dashboard for {weather?.name ?? selected.name}</h1>

    <header className="dashboard-topbar">
      <Link to="/" className="dashboard-brand" aria-label="Heat Shield dashboard">
        <span className="dashboard-brand-mark"><ShieldCheck size={23} aria-hidden="true" /></span>
        <span>Heat Shield</span>
      </Link>
      <div className="dashboard-top-actions">
        <a href="#situation-alert" className="dashboard-notify"><BellRing size={17} aria-hidden="true" /><span>Notify</span></a>
        <span className="dashboard-profile"><UserRound size={17} aria-hidden="true" /><span>Profile</span></span>
      </div>
    </header>

    <div className="dashboard-location-row">
      <div className="dashboard-location-label"><MapPin size={16} aria-hidden="true" /><span>City selection</span></div>
      <CityPicker />
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
          <span className="uploaded-eyebrow"><BellRing size={15} aria-hidden="true" />Situation alert · {selected.name}, {selected.state}</span>
          <h2 id="overall-screening-title">{latestOfficialAlert ? 'Official warning active' : primaryRisk.bannerLabel}</h2>
        </div>
        {primaryRisk.level && <RiskBadge level={primaryRisk.level} />}
      </div>
      <p className="uploaded-alert-summary">
        {latestOfficialAlert
          ? latestOfficialAlert.headline ?? latestOfficialAlert.event ?? primaryRisk.shortReason
          : primaryRisk.shortReason}
      </p>
      <div className="uploaded-alert-footer">
        <span>{primaryRisk.officialSummary.headline}</span>
        <span className="alert-model-label">Weather model screening</span>
      </div>
    </section>

    <section className="uploaded-metrics-grid key-readings-grid" aria-label="Dashboard readings and shortcuts">
      <MetricCard icon={Thermometer} title="Temperature" value={weather ? weather.temperature.toFixed(1) : '—'} unit={weather ? '°C' : undefined} detail="Model air temperature" />
      <MetricCard icon={Flame} title="Heat Index" value={weather ? weather.heatIndex.toFixed(1) : '—'} unit={weather ? '°C' : undefined} detail={weather ? `Feels like ${weather.apparentTemperature.toFixed(1)}°C` : 'Not assessed'} risk={heat?.level} />
      <MetricCard icon={Droplets} title="Humidity" value={weather ? String(weather.humidity) : '—'} unit={weather ? '%' : undefined} detail="Relative humidity" />
      <MetricCard icon={Sun} title="UV Index" value={today?.uvIndexMax == null ? '—' : today.uvIndexMax.toFixed(1)} unit={today?.uvIndexMax == null ? undefined : 'today max'} detail="Daily forecast maximum" />
      <MetricCard
        icon={CloudSun}
        title="Air Quality"
        value={primaryAqi ? primaryAqi.value.toFixed(0) : airStatus === 'loading' ? '…' : '—'}
        unit={primaryAqi?.label}
        detail={primaryAqi ? `${primaryAqi.category} · CAMS model` : airAssessment ? 'Modelled AQI unavailable' : 'Not assessed'}
        risk={airAssessment?.level}
      />
      <ActionCard icon={ShieldCheck} title="Heat Risk" value={heat?.level ?? 'Unassessed'} detail="Heat-index screening" />
      <ActionCard icon={FileText} title="Reports" value={officialAlerts.status === 'ready' ? String(officialAlerts.data?.count ?? 0) : '—'} detail="Official warnings" />
      <ActionCard icon={MessageCircle} title="AI Assistant" value="Open" detail="Ask Heat Shield" to="/assistant" />
    </section>

    <div className="uploaded-dashboard-lower-grid">
      <section className="uploaded-panel" aria-labelledby="dashboard-suggestions-title">
        <div className="uploaded-panel-heading">
          <div>
            <span className="uploaded-eyebrow">Rule-based safety suggestions</span>
            <h2 id="dashboard-suggestions-title">AI suggestions</h2>
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
        </ul> : <p className="uploaded-empty-copy">Suggestions will appear when readings are available.</p>}
      </section>

      <section className="uploaded-panel mission-panel" aria-labelledby="dashboard-progress-title">
        <div className="uploaded-panel-heading">
          <div>
            <span className="uploaded-eyebrow">Your daily checklist</span>
            <h2 id="dashboard-progress-title">Heat mission progress</h2>
          </div>
        </div>
        <div className="mission-progress-copy">
          <strong>{progress.completedCount}<span>/{progress.totalCount}</span></strong>
          <p>{progress.completedCount === progress.totalCount && progress.totalCount > 0 ? 'Daily plan complete' : 'precautions completed today'}</p>
        </div>
        <progress value={progress.percent} max={100} aria-label={`Heat mission progress: ${progress.percent}%`} />
        <div className="mission-progress-footer"><span>{progress.percent}% complete</span></div>
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
}: {
  icon: LucideIcon
  title: string
  value: string
  unit?: string
  detail: string
  risk?: 'low' | 'moderate' | 'high' | 'extreme'
}) {
  return <article className={`uploaded-tile weather-card${risk ? ` risk-${risk}` : ''}`}>
    <h2 className="uploaded-tile-heading"><Icon size={17} aria-hidden="true" /><span>{title}</span></h2>
    <strong className="uploaded-tile-value">{value}{unit && <small>{unit}</small>}</strong>
    <span className="uploaded-tile-detail">{detail}</span>
  </article>
}

function ActionCard({
  icon: Icon,
  title,
  value,
  detail,
  to,
}: {
  icon: LucideIcon
  title: string
  value: string
  detail: string
  to?: string
}) {
  const content = <>
    <h2 className="uploaded-tile-heading"><Icon size={17} aria-hidden="true" /><span>{title}</span></h2>
    <strong className="uploaded-action-value">{value}</strong>
    <span className="uploaded-tile-detail">{detail}</span>
  </>

  return to
    ? <Link to={to} className="uploaded-tile uploaded-action-tile">{content}</Link>
    : <article className="uploaded-tile uploaded-action-tile">{content}</article>
}
