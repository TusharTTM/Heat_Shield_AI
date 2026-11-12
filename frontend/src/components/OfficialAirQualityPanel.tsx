import { ArrowUpRight, Building2, Database, ExternalLink, Wind } from 'lucide-react'
import type { CPCBObservation, OfficialAirQualityBundle } from '../api/official'
import { aqiRecommendations } from '../data/hazards'
import type { OfficialSourceState } from '../hooks/useOfficialData'
import { GLOSSARY_TERMS, TermHelp } from './Comprehension'
import { Card, CardHeader, formatWeatherTime, InlineNotice, RiskBadge } from './ui'

const categoryGuidance: Record<string, string> = {
  Good: aqiRecommendations.Good,
  Satisfactory: aqiRecommendations.Moderate,
  Moderate: aqiRecommendations['Unhealthy for Sensitive Groups'],
  Poor: aqiRecommendations.Unhealthy,
  'Very Poor': aqiRecommendations['Very Unhealthy'],
  Severe: aqiRecommendations.Hazardous,
}

function reading(value: number | null): string {
  return value === null ? 'Not supplied' : String(value)
}

function StationObservation({ observation }: { observation: CPCBObservation }) {
  const guidance = observation.aqiCategory ? categoryGuidance[observation.aqiCategory] : null
  return <article className="official-station-card">
    <div className="official-station-heading"><div><span className="section-label">Official station observation · not CAMS</span><h3>{observation.station}</h3><p>{observation.city}, {observation.state} · Observed <time dateTime={observation.observedAt}>{formatWeatherTime(observation.observedAt)} IST</time></p></div>{observation.screeningLevel && <RiskBadge level={observation.screeningLevel} />}</div>
    <div className="official-aqi-summary"><Building2 size={19} aria-hidden="true" /><div>{observation.aqi !== null ? <><strong>Indian CPCB AQI {observation.aqi} · {observation.aqiCategory}</strong><p>AQI record supplied by the official resource. Four-level display mapping is deterministic and separate from CPCB’s detailed category.</p></> : <><strong>Indian AQI not supplied for this station/time</strong><p>Pollutant averages are not relabelled or converted into AQI.</p></>}</div></div>
    {Object.keys(observation.pollutants).length > 0 ? <div className="table-scroll"><table className="station-pollutant-table"><caption>Station-supplied pollutant fields; units are preserved without conversion</caption><thead><tr><th scope="col">Pollutant</th><th scope="col">Average</th><th scope="col">Minimum</th><th scope="col">Maximum</th><th scope="col">Unit</th></tr></thead><tbody>{Object.entries(observation.pollutants).map(([key, pollutant]) => <tr key={key}><th scope="row">{key}</th><td>{reading(pollutant.average)}</td><td>{reading(pollutant.minimum)}</td><td>{reading(pollutant.maximum)}</td><td>{pollutant.unit ?? 'Not supplied'}</td></tr>)}</tbody></table></div> : <p>No pollutant readings were supplied with this AQI record.</p>}
    {guidance && <p className="official-station-action"><strong>General action:</strong> {guidance} This is general guidance, not an instruction issued by the station.</p>}
    <small>Retrieved <time dateTime={observation.retrievedAt}>{formatWeatherTime(observation.retrievedAt)} IST</time> · {observation.source}</small>
  </article>
}

function StationTrends({ history }: { history: CPCBObservation[] }) {
  const groups = new Map<string, CPCBObservation[]>()
  history.forEach((observation) => groups.set(observation.station, [...(groups.get(observation.station) ?? []), observation]))
  const trends = Array.from(groups.entries()).flatMap(([station, observations]) => {
    const unique = Array.from(new Map(observations.map((item) => [item.observedAt, item])).values()).sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    const aqiSeries = unique.filter((item) => item.aqi !== null)
    const pmSeries = unique.filter((item) => item.pollutants['PM2.5']?.average !== null && item.pollutants['PM2.5']?.average !== undefined)
    const useAqi = aqiSeries.length >= 2
    const series = useAqi ? aqiSeries : pmSeries
    if (series.length < 2) return []
    if (!useAqi && new Set(series.map((item) => item.pollutants['PM2.5']?.unit ?? null)).size > 1) return []
    const first = series[0]
    const last = series[series.length - 1]
    const firstValue = useAqi ? first.aqi : first.pollutants['PM2.5'].average
    const lastValue = useAqi ? last.aqi : last.pollutants['PM2.5'].average
    if (firstValue === null || firstValue === undefined || lastValue === null || lastValue === undefined) return []
    const change = Math.round((lastValue - firstValue) * 10) / 10
    return [{ station, metric: useAqi ? 'Indian CPCB AQI' : 'PM2.5 average', firstValue, lastValue, change, unit: useAqi ? '' : first.pollutants['PM2.5']?.unit ?? '', count: series.length }]
  })
  if (!trends.length) return <p className="station-history-empty">At least two different stored observation times with AQI or PM2.5 values in the same unit are needed for a station trend. No trend is inferred yet.</p>
  return <div className="station-trend-list">{trends.map((trend) => <article key={trend.station}><strong>{trend.station}</strong><p>{trend.metric}: {trend.firstValue} → {trend.lastValue} {trend.unit} ({trend.change > 0 ? '+' : ''}{trend.change}; {trend.change > 0 ? 'rising' : trend.change < 0 ? 'falling' : 'unchanged'}) across {trend.count} stored observation times.</p><small>Stored official station history, not a forecast or long-term climate trend.</small></article>)}</div>
}

export function OfficialAirQualityPanel({ state }: { state: OfficialSourceState<OfficialAirQualityBundle> }) {
  const bundle = state.data
  const current = bundle?.current
  return <Card className="official-air-quality-panel">
    <CardHeader title="CPCB station observations" subtitle="Official Indian station data, separate from Open-Meteo/CAMS estimates" icon={<Wind size={22} aria-hidden="true" />} action={<TermHelp definition={GLOSSARY_TERMS.cpcbAqi} label="What is CPCB AQI?" />} />
    {state.status === 'unconfigured' && <div className="official-warning-empty">
      <strong>CPCB backend not configured</strong>
      <div className="plain-language-callout"><strong>For visitors:</strong> Physical air-monitoring station readings from India’s Central Pollution Control Board (CPCB) are not connected on this static site. The AQI numbers shown in the cards above come from the CAMS computer model, and are never relabelled as official CPCB station data.</div>
      <details className="official-why-drawer"><summary>Technical setup details</summary><p className="operator-detail-note"><span className="operator-detail-tag">For site operators:</span> The frontend has no <code>VITE_API_BASE_URL</code>. Configure it to a reachable FastAPI backend to check CPCB availability. Enabling CPCB also requires a data.gov.in account and a server-only <code>DATA_GOV_IN_API_KEY</code>; credential state is reported by that backend, not inferred by this static site. No CAMS value is relabelled as CPCB AQI.</p></details>
      <a className="button button-secondary" href="https://www.data.gov.in/catalog/real-time-air-quality-index" rel="external">Official CPCB/OGD resource <ExternalLink size={15} aria-hidden="true" /></a>
    </div>}
    {state.status === 'loading' && <p className="official-loading" role="status">Retrieving CPCB station records and stored history…</p>}
    {state.status === 'error' && <div className="official-warning-empty" role="alert"><strong>CPCB station observations unavailable</strong><p>{state.error}</p><p>No station reading or Indian AQI substitute is shown. CAMS estimates remain separately labelled.</p><button type="button" className="button button-secondary" onClick={state.refresh}>Retry CPCB source</button></div>}
    {state.status === 'ready' && bundle && current && <>
      {current.freshness === 'stale' && <InlineNotice kind="warning" title="Stored CPCB observations">Live refresh is unavailable. Station values retain their original observation timestamps and are not called current live readings.</InlineNotice>}
      {current.message && <InlineNotice kind="info" title="CPCB response status">{current.message}</InlineNotice>}
      {bundle.historyWarning && <InlineNotice kind="warning" title="Station history unavailable">{bundle.historyWarning}</InlineNotice>}
      <div className="official-alert-summary"><span><strong>{current.count}</strong> station observations</span><span>{current.recordsRead} records read · {current.invalidRecords} invalid records omitted</span></div>
      <div className="official-station-list">{current.observations.map((observation) => <StationObservation key={`${observation.station}:${observation.observedAt}`} observation={observation} />)}</div>
      <details className="official-limitations" open={bundle.history.length > 0}><summary><Database size={15} aria-hidden="true" /> Stored station trends and method</summary><StationTrends history={bundle.history} /><p>{current.aqiMethod}</p><p>{current.attribution}</p><div className="official-card-links"><a href={current.resourceUrl} rel="external">CPCB/OGD catalogue <ArrowUpRight size={14} aria-hidden="true" /></a><a href={current.licenseUrl} rel="external">Government Open Data License <ArrowUpRight size={14} aria-hidden="true" /></a></div></details>
    </>}
  </Card>
}
