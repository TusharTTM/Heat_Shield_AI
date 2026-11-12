import { useCallback, useMemo } from 'react'
import {
  ArrowRight,
  BellRing,
  Check,
  CloudSun,
  Droplets,
  FileText,
  Flame,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { CityPicker } from '../components/CityPicker'
import { OfficialAirQualityPanel } from '../components/OfficialAirQualityPanel'
import { OfficialAlertsPanel } from '../components/OfficialAlertsPanel'
import {
  AirQualitySourceNote,
  DemoBanner,
  formatWeatherTime,
  RiskBadge,
  StatusBadge,
  WeatherSourceNote,
} from '../components/ui'
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
import { useOfficialAirQuality, useOfficialAlerts } from '../hooks/useOfficialData'

type TaskCompletionStore = Record<string, string[]>

export default function Dashboard() {
  const { region } = useApp()
  const selected = getRegion(region)
  const {
    status,
    data: weather,
    error,
    freshness,
    warning,
    refresh,
    airStatus,
    airQuality,
    airError,
    airFreshness,
    airWarning,
  } = useWeather()

  const officialAlerts = useOfficialAlerts(region)
  const officialAirQuality = useOfficialAirQuality(region)
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

  const toggleTask = useCallback((taskId: string) => {
    setCompletionStore((previous) => {
      const current = previous[storageScope] ?? []
      const next = current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
      return { ...previous, [storageScope]: next }
    })
  }, [setCompletionStore, storageScope])

  const resetTasks = useCallback(() => {
    setCompletionStore((previous) => ({ ...previous, [storageScope]: [] }))
  }, [setCompletionStore, storageScope])

  const modelStatus = freshness === 'stale' || airFreshness === 'stale'
    ? 'Stale cached data'
    : status === 'loading' || airStatus === 'loading'
      ? `Loading weather for ${selected.name}`
      : status === 'error' && airStatus === 'error'
        ? 'Models unavailable'
        : 'Weather + air models'

  return (
    <div className="uploaded-dashboard">
      <h1 className="sr-only">Environmental dashboard for {weather?.name ?? selected.name}</h1>

      <div className="dashboard-location-row">
        <div className="dashboard-location-label">
          <MapPin size={16} aria-hidden="true" />
          <span>City selection</span>
        </div>
        <CityPicker />
        <span role="status" aria-live="polite">
          <StatusBadge status={freshness === 'stale' || airFreshness === 'stale' ? 'stale' : status === 'ready' || airStatus === 'ready' ? 'weather-model' : status === 'loading' || airStatus === 'loading' ? 'loading' : 'unavailable'}>
            {modelStatus}
          </StatusBadge>
        </span>
        <button
          type="button"
          className="dashboard-refresh"
          onClick={refresh}
          disabled={status === 'loading' || airStatus === 'loading'}
          aria-label="Refresh weather and air quality"
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {(warning || airWarning) && (
        <p className="dashboard-stale-note" role="status">
          {warning ?? airWarning} Showing cached weather and air-quality readings.
        </p>
      )}
      {((error && !weather) || (airError && !airQuality)) && (
        <div className="dashboard-stale-note dashboard-error-note" role="alert">
          <p><strong>{error && !weather ? `Weather unavailable for ${selected.name}` : `Air quality unavailable for ${selected.name}`}</strong></p>
          <p>{error && !weather ? error : airError}</p>
          <button type="button" className="dashboard-try-again" onClick={refresh}>Try again</button>
        </div>
      )}

      <section
        className={`uploaded-alert risk-${primaryRisk.level ?? 'unavailable'}`}
        aria-label="Official warnings versus model screening"
        aria-labelledby="overall-screening-title"
      >
        <div className="uploaded-alert-heading">
          <div>
            <span className="uploaded-eyebrow"><BellRing size={15} aria-hidden="true" />Situation alert · {selected.name}, {selected.state}</span>
            <h2 id="overall-screening-title">
              {latestOfficialAlert ? 'Official warning active' : primaryRisk.bannerLabel}
            </h2>
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
          <Link to="/alerts">Review alerts <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="uploaded-dashboard-section" aria-labelledby="dashboard-readings-title">
        <div className="uploaded-section-heading">
          <div>
            <span className="uploaded-eyebrow">Current conditions</span>
            <h2 id="dashboard-readings-title">Heat and air quality</h2>
          </div>
          <span className="uploaded-model-time">
            {weather ? `Updated ${formatWeatherTime(weather.retrievedAt)} IST` : 'Waiting for current readings'}
          </span>
        </div>

        <div className="uploaded-metrics-grid key-readings-grid" aria-label="Key environmental readings">
          <MetricCard icon={Thermometer} title="Temperature" value={weather ? weather.temperature.toFixed(1) : '—'} unit={weather ? '°C' : undefined} detail="Model air temperature" destination="/monitor" />
          <MetricCard icon={Flame} title="Heat index" value={weather ? weather.heatIndex.toFixed(1) : '—'} unit={weather ? '°C' : undefined} detail={weather ? `Feels like ${weather.apparentTemperature.toFixed(1)}°C` : 'Not assessed'} destination="/monitor" risk={heat?.level} />
          <MetricCard icon={Droplets} title="Humidity" value={weather ? String(weather.humidity) : '—'} unit={weather ? '%' : undefined} detail="Relative humidity" destination="/monitor" />
          <MetricCard icon={Sun} title="UV index" value={today?.uvIndexMax == null ? '—' : today.uvIndexMax.toFixed(1)} unit={today?.uvIndexMax == null ? undefined : 'today max'} detail="Daily forecast maximum" destination="/forecast" />
          <MetricCard
            icon={Wind}
            title="Air quality"
            value={primaryAqi ? primaryAqi.value.toFixed(0) : airStatus === 'loading' ? '…' : '—'}
            unit={primaryAqi?.label}
            detail={primaryAqi ? `${primaryAqi.category} · CAMS model` : airAssessment ? 'Modelled AQI unavailable' : 'Not assessed'}
            destination="/monitor"
            risk={airAssessment?.level}
          />
          <MetricLink icon={ShieldCheck} title="Heat risk" value={heat ? heat.level : 'Unassessed'} detail={heat ? 'Heat-index screening' : 'Waiting for weather'} destination="/monitor" risk={heat?.level} />
          <MetricLink icon={FileText} title="Reports" value={officialAlerts.status === 'ready' ? String(officialAlerts.data?.count ?? 0) : '—'} detail={officialAlerts.status === 'ready' ? 'Official local warnings' : 'Official feed status'} destination="/alerts" />
          <MetricLink icon={CloudSun} title="Safety guide" value="Open" detail="Precautions for this location" destination="/safety" />
        </div>
      </section>

      <div className="uploaded-dashboard-lower-grid">
        <section className="uploaded-panel" aria-labelledby="dashboard-suggestions-title">
          <div className="uploaded-panel-heading">
            <div>
              <span className="uploaded-eyebrow">Based on current screening</span>
              <h2 id="dashboard-suggestions-title">Safety suggestions</h2>
            </div>
            <Link to="/safety" aria-label="Open the full Safety Guide"><ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          {suggestions.length > 0 ? (
            <ul className="uploaded-suggestion-list" aria-label={`Suggested preparedness tasks for ${selected.name}`}>
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
                  <details className="action-task-more">
                    <summary>Why this helps</summary>
                    <p className="action-task-detail">{task.detail}</p>
                  </details>
                </li>
              })}
            </ul>
          ) : <p className="uploaded-empty-copy">Safety suggestions will appear when conditions are assessed.</p>}
          <p className="uploaded-panel-footnote">Rule-based precautions from the current weather and air-quality screening.</p>
        </section>

        <section className="uploaded-panel mission-panel" aria-labelledby="dashboard-progress-title">
          <div className="uploaded-panel-heading">
            <div>
              <span className="uploaded-eyebrow">Your daily checklist</span>
              <h2 id="dashboard-progress-title">Heat mission progress</h2>
            </div>
            {completedIds.length > 0 && <button type="button" className="dashboard-reset" onClick={resetTasks}>Reset</button>}
          </div>
          <div className="mission-progress-copy">
            <strong>{progress.completedCount}<span>/{progress.totalCount}</span></strong>
            <p>{progress.completedCount === progress.totalCount && progress.totalCount > 0 ? 'Daily plan complete' : 'precautions completed today'}</p>
          </div>
          <progress value={progress.percent} max={100} aria-label={`Heat mission progress: ${progress.percent}%`} />
          <div className="mission-progress-footer">
            <span>{progress.percent}% complete</span>
            <Link to="/safety">View safety guide <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <p className="uploaded-panel-footnote">Checking off a precaution does not change the reported heat or air-quality risk.</p>
        </section>
      </div>

      <details className="uploaded-sources secondary-details-drawer">
        <summary>More measurements, daytime hours, official feed status &amp; source details</summary>
        <div className="uploaded-sources-content">
          {weather && <div className="secondary-metrics-grid">
            <article className="weather-card secondary-weather-card">
              <h3>Wind speed</h3>
              <strong className="metric-value">{weather.windSpeed.toFixed(1)}<span>km/h</span></strong>
              <p>{weather.windGusts == null ? 'Wind gust estimate unavailable' : `Gusts ${weather.windGusts.toFixed(1)} km/h · model estimate`}</p>
            </article>
            <article className="weather-card secondary-weather-card">
              <h3>Rainfall</h3>
              <strong className="metric-value">{weather.rain == null ? '—' : weather.rain.toFixed(1)}<span>{weather.rain == null ? '' : 'mm'}</span></strong>
              <p>Current model estimate</p>
            </article>
          </div>}
          {weather && <div className="hour-grid" aria-label="Today's model temperatures">
            {weather.hours.map((hour) => <div className="hour-item" key={hour.time}><span>{hour.time}</span><strong>{hour.temperature.toFixed(1)}°</strong></div>)}
          </div>}
          <div className="dashboard-official-panels">
            <OfficialAlertsPanel state={officialAlerts} compact />
            <OfficialAirQualityPanel state={officialAirQuality} />
          </div>
          {weather && <WeatherSourceNote weather={weather} freshness={freshness} />}
          {airQuality && <AirQualitySourceNote air={airQuality} freshness={airFreshness} />}
          <DemoBanner />
          <nav className="dashboard-secondary-navigation" aria-label="Supporting detail pages">
            <Link to="/monitor">Disaster Monitor</Link>
            <Link to="/forecast">5-Day Forecast</Link>
            <Link to="/maps">Risk Map</Link>
          </nav>
        </div>
      </details>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  title,
  value,
  unit,
  detail,
  destination,
  risk,
}: {
  icon: typeof Thermometer
  title: string
  value: string
  unit?: string
  detail: string
  destination: string
  risk?: 'low' | 'moderate' | 'high' | 'extreme'
}) {
  return <Link to={destination} className={`uploaded-tile weather-card${risk ? ` risk-${risk}` : ''}`}>
    <h3 className="uploaded-tile-heading"><Icon size={17} aria-hidden="true" /><span>{title}</span></h3>
    <strong className="uploaded-tile-value">{value}{unit && <small>{unit}</small>}</strong>
    <span className="uploaded-tile-detail">{detail}</span>
  </Link>
}

function MetricLink({
  icon: Icon,
  title,
  value,
  detail,
  destination,
  risk,
}: {
  icon: typeof Thermometer
  title: string
  value: string
  detail: string
  destination: string
  risk?: 'low' | 'moderate' | 'high' | 'extreme'
}) {
  return <Link to={destination} className={`uploaded-tile uploaded-action-tile${risk ? ` risk-${risk}` : ''}`}>
    <h3 className="uploaded-tile-heading"><Icon size={17} aria-hidden="true" /><span>{title}</span></h3>
    <strong className="uploaded-action-value">{value}</strong>
    <span className="uploaded-tile-detail">{detail}</span>
  </Link>
}
