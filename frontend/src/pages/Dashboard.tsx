import { useCallback, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  Clock3,
  CloudRain,
  CloudSun,
  Droplets,
  ExternalLink,
  Gauge,
  LineChart,
  LoaderCircle,
  Map as MapIcon,
  RefreshCw,
  ShieldAlert,
  Siren,
  Sparkles,
  Sun,
  Thermometer,
  ThermometerSun,
  Wind,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionChecklistCard, PreparednessProgressCard } from '../components/DashboardActionCards'
import { IndiaRiskScene3D } from '../components/IndiaRiskScene3D'
import { OfficialAirQualityPanel } from '../components/OfficialAirQualityPanel'
import { OfficialAlertsPanel } from '../components/OfficialAlertsPanel'
import {
  AirQualitySourceNote,
  Card,
  CardHeader,
  formatWeatherTime,
  InlineNotice,
  PageHeader,
  RiskBadge,
  StatusBadge,
  WeatherError,
  WeatherLoading,
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
import { riskRecommendations } from '../data/guidance'
import { assessAirQuality, assessHeat, europeanAqiCategory, upcomingHazards, usAqiCategory } from '../data/hazards'
import { getSimpleRisk } from '../data/heat'
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

  const anyReady = status === 'ready' || airStatus === 'ready'
  const anyLoading = status === 'loading' || airStatus === 'loading'
  const anyStale = freshness === 'stale' || airFreshness === 'stale'

  const primaryRisk = useMemo(
    () =>
      selectPrimaryRiskSummary({
        weather,
        air: airQuality,
        weatherStatus: status,
        airStatus,
        officialAlerts,
      }),
    [airQuality, airStatus, officialAlerts, status, weather],
  )
  const officialWarningLabel = primaryRisk.officialSummary.status === 'active-warning'
    ? primaryRisk.officialSummary.headline
    : primaryRisk.officialSummary.status === 'checked-none'
      ? primaryRisk.officialSummary.headline.includes('partial area coverage') ? 'Checked · partial coverage' : 'No matched alerts'
      : primaryRisk.officialSummary.status === 'unconfigured'
        ? 'Not connected'
        : primaryRisk.officialSummary.status === 'unavailable'
          ? 'Feed unavailable'
          : 'Checking…'

  const heat = weather ? assessHeat(weather) : null
  const airAssessment = airQuality ? assessAirQuality(airQuality) : null

  // US AQI leads when it is available; otherwise the European index takes its
  // place. Whichever leads is printed once as the metric, and the other becomes
  // the supporting text — so neither index is stated twice in the same card.
  const primaryAqi = airQuality?.usAqi != null
    ? { label: 'US AQI', value: airQuality.usAqi.toFixed(0), category: usAqiCategory(airQuality.usAqi) }
    : airQuality?.europeanAqi != null
      ? { label: 'European AQI', value: airQuality.europeanAqi.toFixed(0), category: europeanAqiCategory(airQuality.europeanAqi) }
      : null
  const secondaryAqi = airQuality?.usAqi != null && airQuality.europeanAqi != null
    ? { label: 'European AQI', value: airQuality.europeanAqi.toFixed(0), category: europeanAqiCategory(airQuality.europeanAqi) }
    : null
  const upcoming = upcomingHazards(weather, airQuality)
  const simpleHeatRisk = weather ? getSimpleRisk(weather.risk) : null
  const rain = weather ? weather.rain ?? weather.precipitation ?? null : null
  const hottestHour =
    weather && weather.hours.length > 0
      ? weather.hours.reduce((hottest, hour) => (hour.temperature > hottest.temperature ? hour : hottest))
      : null
  const today = weather?.forecast[0]

  const suggestions = useMemo(
    () => buildDashboardSuggestions(weather, airQuality),
    [airQuality, weather],
  )

  const istDateKey = getIstDateKey()
  const storageScope = `${istDateKey}:${region}`
  const [completionStore, setCompletionStore] = useLocalStorage<TaskCompletionStore>('hs-dashboard-tasks-v1', {})
  const completedIds = completionStore[storageScope] ?? []

  const toggleTask = useCallback(
    (taskId: string) => {
      setCompletionStore((prev) => {
        const current = prev[storageScope] ?? []
        const exists = current.includes(taskId)
        const nextList = exists ? current.filter((id) => id !== taskId) : [...current, taskId]
        return { ...prev, [storageScope]: nextList }
      })
    },
    [setCompletionStore, storageScope],
  )

  const resetTasks = useCallback(() => {
    setCompletionStore((prev) => ({ ...prev, [storageScope]: [] }))
  }, [setCompletionStore, storageScope])

  const progress = useMemo(
    () => computePreparednessProgress(suggestions, completedIds),
    [completedIds, suggestions],
  )

  const headerActions = (
    <div className="page-action-group">
      <StatusBadge status={anyStale && anyReady ? 'stale' : anyReady ? 'weather-model' : anyLoading ? 'loading' : 'unavailable'}>
        {!anyStale && anyReady ? 'Weather + air models' : undefined}
      </StatusBadge>
      <button
        type="button"
        className="icon-text-button"
        onClick={refresh}
        disabled={status === 'loading' || airStatus === 'loading'}
      >
        <RefreshCw size={14} aria-hidden="true" />
        <span>Refresh</span>
      </button>
    </div>
  )

  return (
    <div className="page home-page">
      {/* On this screen the verdict outranks the page title, so the title is the
          place and the verdict is the headline. The h1 keeps its exact wording;
          the description is the one line a person needs before acting. */}
      <PageHeader
        title={`Environmental dashboard for ${weather?.name ?? selected.name}`}
        description="Model screening for heat and air quality, with the precautions that follow from it."
        actions={headerActions}
      />

      {warning && weather && (
        <InlineNotice kind="warning" title="Showing cached weather">
          {warning} Last updated {new Date(weather.retrievedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.
        </InlineNotice>
      )}
      {airWarning && airQuality && (
        <InlineNotice kind="warning" title="Showing cached air quality">
          {airWarning} Values remain CAMS model estimates, not station observations.
        </InlineNotice>
      )}

      {/* 1. Current warning and risk */}
      <section
        className={`overall-screening dashboard-warning-hero risk-${primaryRisk.level ?? 'unavailable'}`}
        aria-labelledby="overall-screening-title"
      >
        <div className="warning-hero-top">
          <div className="overall-screening-main">
            <span className="overall-screening-icon">
              <Gauge size={26} aria-hidden="true" />
            </span>
            <div>
              <span className="section-label">
                {selected.name}, {selected.state} · {primaryRisk.hazardLabel}
              </span>
              <div className="warning-hero-title-row">
                <span className="warning-hero-scale-label">HeatShield screening</span>
                <h2 id="overall-screening-title">{primaryRisk.bannerLabel}</h2>
                {primaryRisk.level && <RiskBadge level={primaryRisk.level} />}
              </div>
              <p className="warning-hero-reason">{primaryRisk.shortReason}</p>
              <details className="warning-scale-explainer">
                <summary>How Low / Moderate / High / Extreme are decided</summary>
                {/* The four bands are HeatShield's own. Each published scale maps
                    onto them, so the original category name travels beside the
                    band: US AQI "Good" and European AQI "Good" are both Low, but
                    "Unhealthy for Sensitive Groups" is where the two diverge. */}
                <div className="decoder-scale-grid" aria-label="Four-level screening scale decoder">
                  <div className="decoder-scale-item risk-low">
                    <RiskBadge level="low" />
                    <strong>Low</strong>
                    <p>Heat index below 27 °C · US AQI 0–50 (<em>Good</em>) · European AQI 0–40 (<em>Good</em>)</p>
                  </div>
                  <div className="decoder-scale-item risk-moderate">
                    <RiskBadge level="moderate" />
                    <strong>Moderate</strong>
                    <p>Heat index 27 to below 33 °C · US AQI 51–150 (<em>Moderate</em> to <em>Unhealthy for Sensitive Groups</em>) · European AQI 41–60 (<em>Fair</em> to <em>Moderate</em>)</p>
                  </div>
                  <div className="decoder-scale-item risk-high">
                    <RiskBadge level="high" />
                    <strong>High</strong>
                    <p>Heat index 33 to below 52 °C · US AQI 151–200 (<em>Unhealthy</em>) · European AQI 61–80 (<em>Poor</em>)</p>
                  </div>
                  <div className="decoder-scale-item risk-extreme">
                    <RiskBadge level="extreme" />
                    <strong>Extreme</strong>
                    <p>Heat index 52 °C and above · US AQI above 200 (<em>Very Unhealthy</em> or <em>Hazardous</em>) · European AQI above 80 (<em>Very Poor</em> or <em>Extremely Poor</em>)</p>
                  </div>
                </div>
                <p className="screening-disclaimer">
                  These are HeatShield’s own screening bands, applied to deterministic heat-index and modelled US/European
                  AQI results. The bracketed words are each scale’s own category and are kept so you can match them to an
                  official source. The bands are <strong>not</strong> official disaster warnings, CAP severity levels, or
                  prediction probabilities — an official NDMA/IMD warning always takes priority.
                </p>
              </details>
              {primaryRisk.missingNotice && primaryRisk.level !== null && (
                <p className="warning-hero-missing">
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>{primaryRisk.missingNotice}</span>
                </p>
              )}
            </div>
          </div>

          <div className="warning-hero-meta">
            <span className="warning-updated-pill">
              <Clock3 size={14} aria-hidden="true" />
              {primaryRisk.updatedAt ? (
                <span>
                  Updated <time dateTime={primaryRisk.updatedAt}>{formatWeatherTime(primaryRisk.updatedAt)} IST</time>
                </span>
              ) : (
                <span>Update time pending</span>
              )}
            </span>
            <Link to="/monitor" className="text-link">
              Full hazard breakdown <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Explicit Official Government Warnings vs. HeatShield Screening distinction */}
        <div className="warning-source-split" aria-label="Official warnings versus model screening">
          <div className={`warning-source-chip official-${primaryRisk.officialSummary.status}`}>
            <ShieldAlert size={16} aria-hidden="true" />
            <div>
              <strong>Official government warnings: {officialWarningLabel}</strong>
              {primaryRisk.officialSummary.status === 'active-warning'
                ? <span>{primaryRisk.officialSummary.detail}</span>
                : <details className="source-note-detail warning-source-detail">
                  <summary>Coverage &amp; source details</summary>
                  <p><strong>{primaryRisk.officialSummary.headline}.</strong> {primaryRisk.officialSummary.detail} Official warnings come from the NDMA SACHET CAP feed and are separate from model screening.</p>
                </details>}
            </div>
            {primaryRisk.officialSummary.status === 'active-warning' ? (
              <Link to="/alerts" className="chip-link">
                View CAP alert <ArrowRight size={13} aria-hidden="true" />
              </Link>
            ) : (
              <a href="https://sachet.ndma.gov.in/" rel="external" className="chip-link">
                SACHET <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="warning-source-chip model-screening">
            <Sparkles size={16} aria-hidden="true" />
            <div>
              <strong>HeatShield model screening</strong>
              <span>Heat and air-quality estimates, assessed with published rules.</span>
              <details className="source-note-detail warning-source-detail">
                <summary>How screening works</summary>
                <p>Open-Meteo weather and CAMS air-quality estimates use deterministic heat-index and US/European AQI rules. They are not official alerts, physical sensor readings, CPCB station observations, or AI/ML predictions.</p>
              </details>
            </div>
          </div>
        </div>
      </section>

      {status === 'loading' && !weather && <WeatherLoading name={selected.name} />}
      {status === 'error' && !weather && <WeatherError name={selected.name} error={error} onRetry={refresh} />}
      {airStatus === 'error' && !airQuality && (
        <InlineNotice kind="warning" title="Air quality unavailable">
          {airError ?? 'The CAMS air-quality model could not be reached.'} No AQI substitute is shown; available weather screening remains independent.
        </InlineNotice>
      )}

      {/* 2. Suggested actions and checklist — first content after the warning on every width.
          3. Interactive 3D risk view. 4. Gamified preparedness progress. */}
      <div className="dashboard-workspace-grid">
        <div className="dashboard-action-column">
          <ActionChecklistCard
            cityName={selected.name}
            tasks={suggestions}
            completedIds={completedIds}
            onToggleTask={toggleTask}
            onResetTasks={resetTasks}
            loading={status === 'loading' && !weather}
          />
          <PreparednessProgressCard cityName={selected.name} progress={progress} />
        </div>

        <IndiaRiskScene3D
          selectedWeather={weather}
          selectedAir={airQuality}
          selectedWeatherFreshness={freshness}
          selectedAirFreshness={airFreshness}
        />
      </div>

      {/* 6. A few key readings that explain the warning and suggested actions */}
      {weather ? (
        <section className="key-readings-section" aria-labelledby="key-readings-heading">
          <div className="key-readings-header">
            <div>
              <span className="section-label">Key measurements</span>
              <h2 id="key-readings-heading">Readings behind today’s screening</h2>
            </div>
            {simpleHeatRisk && <span className="sr-only recommendation-text">{riskRecommendations[simpleHeatRisk]}</span>}
          </div>

          <div className="weather-grid key-readings-grid" aria-label="Key environmental readings">
            <article className="weather-card">
              <div className="weather-card-label">
                <Thermometer size={20} aria-hidden="true" />
                <h3>Temperature</h3>
              </div>
              <strong className="metric-value">
                {weather.temperature.toFixed(1)}
                <span>°C</span>
              </strong>
              <p>Open-Meteo air temperature (2 m)</p>
            </article>

            <article className="weather-card">
              <div className="weather-card-label">
                <ThermometerSun size={20} aria-hidden="true" />
                <h3>Heat index</h3>
              </div>
              <strong className="metric-value">
                {weather.heatIndex.toFixed(1)}
                <span>°C</span>
              </strong>
              <p>Feels like {weather.apparentTemperature.toFixed(1)}°C · model estimate</p>
            </article>

            <article className="weather-card">
              <div className="weather-card-label">
                <Droplets size={20} aria-hidden="true" />
                <h3>Humidity</h3>
              </div>
              <strong className="metric-value">
                {weather.humidity}
                <span>%</span>
              </strong>
              <p>Relative humidity · drives humid heat stress</p>
            </article>

            <article className="weather-card">
              <div className="weather-card-label">
                <Sun size={20} aria-hidden="true" />
                <h3>UV index</h3>
              </div>
              <strong className="metric-value">
                {today?.uvIndexMax == null ? '—' : today.uvIndexMax.toFixed(1)}
                {today?.uvIndexMax != null && <span>today max</span>}
              </strong>
              <p>Open-Meteo daily maximum · forecast estimate</p>
            </article>

            <article className={`weather-card air-quality-card${airAssessment ? ` risk-${airAssessment.level}` : ''}`}>
              <div className="weather-card-label">
                <Wind size={20} aria-hidden="true" />
                <h3>Air quality</h3>
              </div>
              {airStatus === 'loading' ? (
                <>
                  <strong className="metric-value">
                    <LoaderCircle className="weather-spinner" size={28} aria-label="Loading air quality" />
                  </strong>
                  <p>Requesting CAMS US + European AQI…</p>
                </>
              ) : airQuality && airAssessment ? (
                <>
                  {/* The index printed as the metric is not printed again below it.
                      The supporting line carries the other index and both category
                      names, so US and European AQI stay visible side by side. */}
                  <strong className="metric-value">
                    {primaryAqi?.value ?? '—'}
                    <span>{primaryAqi?.label}</span>
                  </strong>
                  <p>
                    {primaryAqi?.category}
                    {secondaryAqi ? ` · ${secondaryAqi.label} ${secondaryAqi.value} (${secondaryAqi.category})` : ''}
                    {' · CAMS model, not CPCB'}
                  </p>
                </>
              ) : (
                <>
                  <strong className="metric-value">—</strong>
                  <p>Modelled AQI unavailable · no station substitute</p>
                </>
              )}
            </article>
          </div>
        </section>
      ) : airQuality && airAssessment ? (
        <Card className="air-only-reading-card">
          <div className="weather-card-label">
            <Wind size={20} aria-hidden="true" />
            <h3>Modelled air quality ({selected.name})</h3>
          </div>
          {/* Only the index that could not lead is named here, so the value is
              stated once whether or not weather loaded. */}
          <p className="muted-copy">
            <strong>{primaryAqi ? `${primaryAqi.label} ${primaryAqi.value} · ${primaryAqi.category}${secondaryAqi ? ` · ${secondaryAqi.label} ${secondaryAqi.value} (${secondaryAqi.category})` : ''}` : 'Modelled AQI unavailable'}</strong>
            {' '}(CAMS model estimate, not physical CPCB stations). Weather readings are currently unavailable.
          </p>
        </Card>
      ) : null}

      {/* Progressive disclosure for secondary measurements, daytime hours, upcoming signals, official panels & provenance */}
      <details className="card decoder-drawer secondary-details-drawer">
        <summary>More measurements, daytime hours, official feed status &amp; source details</summary>
        <div className="decoder-drawer-body">
          {heat && <p className="risk-explanation">{heat.explanation}</p>}

          {weather && (
            <div className="secondary-metrics-grid" aria-label="Secondary weather measurements">
              <article className="weather-card secondary-weather-card">
                <div className="weather-card-label">
                  <Wind size={20} aria-hidden="true" />
                  <h3>Wind speed</h3>
                </div>
                <strong className="metric-value">
                  {weather.windSpeed.toFixed(1)}
                  <span>km/h</span>
                </strong>
                <p>
                  {weather.windGusts != null
                    ? `Gusts ${weather.windGusts.toFixed(1)} km/h · model estimate`
                    : 'Gust estimate unavailable'}
                </p>
              </article>

              <article className="weather-card secondary-weather-card">
                <div className="weather-card-label">
                  <CloudRain size={20} aria-hidden="true" />
                  <h3>Rainfall</h3>
                </div>
                <strong className="metric-value">
                  {rain === null ? '—' : rain.toFixed(1)}
                  <span>{rain === null ? '' : 'mm'}</span>
                </strong>
                <p>
                  {rain === null
                    ? 'Current rain estimate unavailable'
                    : `${weather.rain !== null && weather.rain !== undefined ? 'Rain' : 'Precipitation'} in the preceding hour · model estimate`}
                </p>
              </article>
            </div>
          )}

          {weather && today && (
            <Card className="today-card secondary-subcard">
              <CardHeader
                title="Today's model temperatures"
                subtitle={`${today.fullLabel} · ${today.condition} · High ${today.max.toFixed(1)}°C · Low ${today.min.toFixed(1)}°C`}
                icon={<CloudSun size={22} aria-hidden="true" />}
              />
              {weather.hours.length > 0 ? (
                <div className="hour-grid">
                  {weather.hours.map((hour) => (
                    <div className="hour-item" key={hour.time}>
                      <span>{hour.time}</span>
                      <strong>{hour.temperature.toFixed(1)}°</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Hourly model temperatures are unavailable for today.</p>
              )}
              {hottestHour && (
                <p className="peak-note">
                  <Clock3 size={16} aria-hidden="true" />
                  Warmest listed hour: {hottestHour.time} in this weather model.
                </p>
              )}
            </Card>
          )}

          <Card className="upcoming-card secondary-subcard">
            <CardHeader
              title="Upcoming potential hazards"
              subtitle="Raised heat (≥33°C heat index) and air-quality forecast signals"
              icon={<CloudSun size={22} aria-hidden="true" />}
            />
            {upcoming.length > 0 ? (
              <div className="upcoming-list">
                {upcoming.map((hazard) => (
                  <article key={hazard.id} className="upcoming-item">
                    <div>
                      <h3>{hazard.title}</h3>
                      <RiskBadge level={hazard.level} subtle />
                    </div>
                    <p>{hazard.detail}</p>
                    <small>{hazard.source}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy">
                {anyReady
                  ? 'No raised heat or modelled-AQI signal appears in the available forecast. Rainfall, flood, cyclone, lightning, and drought risks are not assessed by this rule set.'
                  : 'Forecast signals are unavailable until environmental data loads.'}
              </p>
            )}
          </Card>

          <div className="dashboard-signal-grid">
            <OfficialAlertsPanel state={officialAlerts} compact />
            <OfficialAirQualityPanel state={officialAirQuality} />
          </div>

          {weather && <WeatherSourceNote weather={weather} freshness={freshness} />}
          {airQuality && <AirQualitySourceNote air={airQuality} freshness={airFreshness} />}
        </div>
      </details>

      {/* Supporting pages strip */}
      <nav className="supporting-pages-strip" aria-label="Supporting detail pages">
        <Link to="/monitor" className="supporting-page-link">
          <Siren size={18} aria-hidden="true" />
          <div>
            <strong>Disaster Monitor</strong>
            <span>5 heat &amp; 8 air-quality metrics, 24h chart, hazard limits</span>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <Link to="/forecast" className="supporting-page-link">
          <LineChart size={18} aria-hidden="true" />
          <div>
            <strong>5-Day Forecast</strong>
            <span>Daily highs/lows, rain chance &amp; UV</span>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <Link to="/maps" className="supporting-page-link">
          <MapIcon size={18} aria-hidden="true" />
          <div>
            <strong>Risk Map</strong>
            <span>Full 2D map &amp; 15-city table</span>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <Link to="/alerts" className="supporting-page-link">
          <BellRing size={18} aria-hidden="true" />
          <div>
            <strong>Alerts</strong>
            <span>SACHET CAP &amp; browser notices</span>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <Link to="/safety" className="supporting-page-link">
          <BookOpenCheck size={18} aria-hidden="true" />
          <div>
            <strong>Safety Guide</strong>
            <span>Scale tables, checklists &amp; 112 help</span>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </nav>
    </div>
  )
}
