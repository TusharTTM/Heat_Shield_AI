import { ArrowRight, BellRing, CloudRain, CloudLightning, Droplets, RefreshCw, Tornado } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useWeather } from '../context/WeatherContext'
import { getRegion } from '../data/regions'
import { airQualityTrend, assessAirQuality, assessHeat } from '../data/hazards'
import { AirQualityChart } from '../components/AirQualityChart'
import { GLOSSARY_TERMS, IllustrativeExample, PageJumpNav, SectionIntro, TermHelp } from '../components/Comprehension'
import { HazardCard } from '../components/HazardCard'
import { AirQualitySourceNote, Card, CardHeader, InlineNotice, PageHeader, StatusBadge, WeatherError, WeatherLoading, WeatherSourceNote } from '../components/ui'
import { OfficialAlertsPanel } from '../components/OfficialAlertsPanel'
import { OfficialAirQualityPanel } from '../components/OfficialAirQualityPanel'
import { useOfficialAirQuality, useOfficialAlerts } from '../hooks/useOfficialData'

export default function DisasterMonitor() {
  const { region } = useApp()
  const selected = getRegion(region)
  const {
    status, data: weather, error, freshness, refresh,
    airStatus, airQuality, airError, airFreshness,
  } = useWeather()
  const officialAlerts = useOfficialAlerts(region)
  const officialAirQuality = useOfficialAirQuality(region)
  const heat = weather ? assessHeat(weather) : null
  const air = airQuality ? assessAirQuality(airQuality) : null
  const trend = airQualityTrend(airQuality?.hourly ?? [])
  const stale = freshness === 'stale' || airFreshness === 'stale'

  return <div className="page disaster-monitor-page">
    <PageHeader title="Disaster Monitor" description={`Start with the current warning and suggested action for ${selected.name}. Open readings and methods when you need more detail.`} actions={<div className="page-action-group"><StatusBadge status={stale ? 'stale' : status === 'loading' && airStatus === 'loading' ? 'loading' : weather || airQuality ? 'weather-model' : 'unavailable'}>{!stale && (weather || airQuality) ? 'Model assessments' : undefined}</StatusBadge><button type="button" className="icon-text-button" onClick={refresh} disabled={status === 'loading' || airStatus === 'loading'}><RefreshCw size={15} aria-hidden="true" />Refresh data</button></div>} />

    <PageJumpNav items={[
      { id: 'monitor-official-alerts', label: '1. Official warnings' },
      { id: 'monitor-assessments', label: '2. Heat & air breakdown' },
      { id: 'monitor-air-trend', label: '3. 24-hour air trend' },
      { id: 'monitor-cpcb', label: '4. CPCB stations' },
      { id: 'monitor-coverage', label: '5. Other hazards & limits' },
    ]} />

    <div id="monitor-official-alerts">
      <SectionIntro
        eyebrow="Section 1 · Government disaster alerts"
        title="Official warning channel"
        summary="Official Common Alerting Protocol (CAP) bulletins take priority over all model estimates on this page."
      />
      <OfficialAlertsPanel state={officialAlerts} />
    </div>

    <div id="monitor-assessments">
      <SectionIntro
        eyebrow="Section 2 · Detailed model screening"
        title={`Heat and air-pollution breakdown for ${selected.name}`}
        summary="Each card shows what to do and the key readings first. Expand for more measurements, calculations, sources, and times."
      />
      <div className="hazard-card-grid">
        {heat && <HazardCard assessment={heat} />}
        {air && <HazardCard assessment={air} />}
      </div>
      {status === 'loading' && <WeatherLoading name={selected.name} />}
      {status === 'error' && <WeatherError name={selected.name} error={error} onRetry={refresh} />}
      {airStatus === 'loading' && <section className="weather-state" role="status"><h2>Loading modelled air quality for {selected.name}</h2><p>Requesting current pollutants and a 24-hour CAMS model outlook with US and European AQI…</p></section>}
      {airStatus === 'error' && <InlineNotice kind="warning" title="Air-pollution assessment unavailable">{airError ?? 'Open-Meteo air quality is unavailable.'} No fabricated AQI or CPCB station value is shown. <button type="button" className="text-button" onClick={refresh}>Retry environmental data</button></InlineNotice>}
      {airQuality && !air && <InlineNotice kind="warning" title="AQI values are missing">Pollutant model values may be present, but an AQI risk level cannot be assigned without either US AQI or European AQI.</InlineNotice>}
    </div>

    {airQuality && airQuality.hourly.length > 0 && <div id="monitor-air-trend">
      <SectionIntro
        eyebrow="Section 3 · Modelled hourly outlook"
        title="24-hour air-pollution model trend"
        summary="CAMS hourly forecast, shown separately from the current assessment above. This is not an observed CPCB station series."
        action={<TermHelp definition={GLOSSARY_TERMS.freshness} label="Model time vs Last updated?" />}
      />
      <Card className="aqi-trend-card">
        <CardHeader title="24-hour air-pollution model trend" subtitle={trend.change === null ? 'Insufficient hourly values for a trend' : `${trend.direction[0].toUpperCase() + trend.direction.slice(1)}: ${trend.change > 0 ? '+' : ''}${trend.change.toFixed(1)} US AQI between the first and last available hours`} />
        <AirQualityChart hours={airQuality.hourly} />
        <details className="aqi-trend-how">
          <summary>How the Rising / Falling / Steady label is calculated</summary>
          <p className="chart-note">Hourly CAMS model forecast. Rising/ Falling/ Steady uses ±10 US AQI between the first and last available values; it is not an observed pollution trend or CPCB station series.</p>
          <IllustrativeExample title="How Rising / Falling / Steady is decided">
            If the first available hour is US AQI 118 and the 24th hour is US AQI 124 (+6.0), the headline says <strong>Steady</strong> because changes within ±10 US AQI points are small across a single day’s computer forecast. A jump of +10 or more is labelled <strong>Rising</strong>; a drop of −10 or more is labelled <strong>Falling</strong>.
          </IllustrativeExample>
        </details>
      </Card>
    </div>}

    <div id="monitor-cpcb">
      <SectionIntro
        eyebrow="Section 4 · Official ground-station air quality"
        title="Physical CPCB monitoring stations"
        summary="When connected to a configured backend with a data.gov.in key, physical CPCB station readings and stored station trends appear here—separate from CAMS grid estimates."
      />
      <OfficialAirQualityPanel state={officialAirQuality} />
    </div>

    {(weather || airQuality) && <details className="card decoder-drawer monitor-provenance-drawer">
      <summary>Model provenance &amp; retrieval timestamps</summary>
      <div className="decoder-drawer-body">
        <div className="provenance-header">
          <span className="section-label">Model provenance &amp; retrieval timestamps</span>
          <TermHelp definition={GLOSSARY_TERMS.freshness} label="Model time vs Last updated?" />
        </div>
        {weather && <WeatherSourceNote weather={weather} freshness={freshness} />}
        {airQuality && <AirQualitySourceNote air={airQuality} freshness={airFreshness} />}
      </div>
    </details>}

    <details className="card decoder-drawer monitor-about-drawer">
      <summary>How this page is organised (3 points)</summary>
      <div className="decoder-drawer-body">
        <div className="page-overview-grid" aria-label="How Disaster Monitor is organised">
          <div className="overview-pill-card"><strong>Official warnings first</strong><p>Government CAP alerts from NDMA SACHET are checked separately so computer estimates never impersonate emergency orders.</p></div>
          <div className="overview-pill-card"><strong>Every input shown openly</strong><p>Inspect all 5 heat indicators and 8 CAMS air-pollution metrics with plain-language descriptions and threshold formulas.</p></div>
          <div className="overview-pill-card"><strong>Honest hazard boundaries</strong><p>Floods, cyclones, lightning, and drought need river gauges, radar, or multi-year baselines—never guessed from today’s weather.</p></div>
        </div>
      </div>
    </details>

    <div id="monitor-coverage">
      <details className="card decoder-drawer monitor-coverage-drawer">
        <summary>Section 5 · Monitoring coverage &amp; limitations (floods, cyclones, lightning, drought)</summary>
        <div className="decoder-drawer-body">
      <Card className="monitoring-coverage-card">
        <CardHeader
          title="Monitoring coverage and limitations"
          subtitle="Unavailable hazard assessments are not converted into reassuring labels"
          icon={<BellRing size={22} aria-hidden="true" />}
          action={<Link to="/safety#safety-hazards" className="text-link">Preparedness guides <ArrowRight size={14} aria-hidden="true" /></Link>}
        />
        <p className="coverage-intro">Why doesn’t HeatShield show a Low/High badge for floods, cyclones, lightning, or drought? Standard weather forecasts alone cannot confirm those hazards safely—showing “Low flood risk” during river rise or poor drainage could be dangerous.</p>
        <div className="coverage-grid">
          <article><div className="coverage-card-top"><CloudRain size={21} aria-hidden="true" /><span className="coverage-pill">Not rated from rain alone</span></div><h3>Heavy rainfall & flooding</h3><strong>Weather inputs available · flood engine not enabled</strong><p>Current rain and five-day precipitation are retained, but no flood-risk level is assigned without validated accumulation rules and appropriate hydrological context. Rainfall is not confirmed flooding.</p></article>
          <article><div className="coverage-card-top"><Tornado size={21} aria-hidden="true" /><span className="coverage-pill">Official bulletin required</span></div><h3>Cyclones & severe storms</h3><strong>Official feed required</strong><p>No cyclone track, affected warning zone, or official severity is generated. Gust forecasts alone are not cyclone warnings.</p></article>
          <article><div className="coverage-card-top"><CloudLightning size={21} aria-hidden="true" /><span className="coverage-pill">Radar / official alert required</span></div><h3>Thunderstorms & lightning</h3><strong>Observation/official feed required</strong><p>No lightning-strike prediction is shown. Convective or weather-code indicators cannot prove a strike or replace IMD/Damini warnings.</p></article>
          <article><div className="coverage-card-top"><Droplets size={21} aria-hidden="true" /><span className="coverage-pill">Multi-month baseline required</span></div><h3>Drought</h3><strong>Historical baseline required</strong><p>A drought label requires long-term rainfall anomalies and suitable baselines. A dry forecast or hot day is not enough.</p></article>
        </div>
      </Card>

      <InlineNotice kind="info" title="Direct IMD district-warning and CWC river-gauge feeds are not connected">Optional NDMA SACHET CAP warnings and CPCB station observations appear separately above when a backend is configured. Direct IMD district-warning APIs and CWC gauge/basin feeds remain unconnected—check IMD, CWC, SACHET, and local disaster-management authorities directly. The absence of an official-alert card is never an all-clear.</InlineNotice>
        </div>
      </details>
    </div>
  </div>
}
