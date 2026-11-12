import { Check, Info, LoaderCircle, MapPin, RefreshCw, ThermometerSun, Wind } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useWeather } from '../context/WeatherContext'
import { getSimpleRisk } from '../data/heat'
import { getRegion, regions } from '../data/regions'
import { riskRecommendations } from '../data/guidance'
import { assessAirQuality } from '../data/hazards'
import { weatherRiskExplanation } from '../api/openMeteo'
import { useWeatherMap } from '../hooks/useWeatherMap'
import { GLOSSARY_TERMS, TermHelp } from '../components/Comprehension'
import { RegionMap } from '../components/RegionMap'
import { AirQualitySourceNote, Card, InlineNotice, PageHeader, RiskBadge, StatusBadge, WeatherAttribution, WeatherSourceNote } from '../components/ui'

export default function Maps() {
  const { region, setRegion } = useApp()
  const selected = getRegion(region)
  const {
    status, data: weather, error, freshness, refresh,
    airStatus, airQuality, airError, airFreshness,
  } = useWeather()
  const map = useWeatherMap()
  const [layer, setLayer] = useState<'heat' | 'air-quality'>('heat')
  const locations = regions.flatMap((item) => {
    const entry = map.entries[item.slug]
    return entry ? [entry] : []
  })
  const airLocations = regions.flatMap((item) => {
    const entry = map.airEntries[item.slug]
    return entry ? [entry] : []
  })
  const activeStatus = layer === 'heat' ? map.status : map.airStatus
  const activeUnavailable = layer === 'heat' ? map.unavailable : map.airUnavailable
  const hasStaleMarkers = (layer === 'heat' ? locations : airLocations).some((entry) => entry.freshness === 'stale')
  const mapBadgeStatus = activeStatus === 'ready' ? (hasStaleMarkers ? 'stale' : 'weather-model') : activeStatus === 'loading' ? 'loading' : 'unavailable'
  const risk = weather ? getSimpleRisk(weather.risk) : null
  const airAssessment = airQuality ? assessAirQuality(airQuality) : null

  return <div className="page map-page">
    <PageHeader
      title="Heat and air-quality risk map"
      description="Compare modelled heat and air-quality risk across 15 Indian locations."
      actions={<StatusBadge status={mapBadgeStatus} />}
    />

    <div className="map-controls-bar">
      <div className="map-layer-control" role="group" aria-label="Hazard map layer">
        <button type="button" aria-pressed={layer === 'heat'} className={layer === 'heat' ? 'active' : ''} onClick={() => setLayer('heat')}><ThermometerSun size={18} aria-hidden="true" />Heat risk</button>
        <button type="button" aria-pressed={layer === 'air-quality'} className={layer === 'air-quality' ? 'active' : ''} onClick={() => setLayer('air-quality')}><Wind size={18} aria-hidden="true" />Air pollution</button>
      </div>
      <div className="map-controls-help">
        <span><Info size={15} aria-hidden="true" />Click any city circle or button to inspect details and update your active city across all pages.</span>
        <TermHelp definition={layer === 'heat' ? GLOSSARY_TERMS.heatIndex : GLOSSARY_TERMS.usVsEuAqi} label={layer === 'heat' ? 'How heat dots are coloured' : 'How AQI dots are coloured'} />
      </div>
    </div>

    <div className="risk-map-layout">
      <Card className="map-card">
        <div className="map-card-header"><h2>{layer === 'heat' ? 'Heat risk by location' : 'Modelled US + European AQI by location'}</h2><div className="map-card-actions"><div className="map-legend" aria-label="Map colour legend"><span><i className="legend-dot low" />Low</span><span><i className="legend-dot moderate" />Moderate</span><span><i className="legend-dot high" />High</span><span><i className="legend-dot extreme" />Extreme</span></div><button type="button" className="icon-text-button" onClick={map.refresh} disabled={map.status === 'loading' || map.airStatus === 'loading'}><RefreshCw size={15} aria-hidden="true" />Refresh map</button></div></div>
        <details className="map-layer-notes">
          <summary>What the circles actually show (coverage &amp; limits)</summary>
          <p className="map-layer-explainer">
            {layer === 'heat'
              ? 'Showing current shade heat-index screening for 15 city coordinates. Circles show point model estimates—HeatShield does not draw district boundaries because conditions vary neighbourhood by neighbourhood.'
              : 'Showing the higher caution level between modelled US AQI and European AQI for 15 city coordinates (CAMS model estimates, not physical CPCB stations).'} Flood, cyclone, lightning and drought are not assessed here. See the Disaster Monitor for the data those hazards need.
          </p>
        </details>
        {activeStatus === 'loading' && <p className="map-loading" role="status"><LoaderCircle className="weather-spinner" size={18} aria-hidden="true" />Loading {layer === 'heat' ? 'weather-model heat' : 'CAMS air-quality'} markers…</p>}
        {activeUnavailable.length > 0 && <InlineNotice kind="warning" title="Some locations are unavailable">{activeUnavailable.join(', ')}. No substitute readings are shown.</InlineNotice>}
        {activeStatus === 'error' && <InlineNotice kind="danger" title={layer === 'heat' ? 'Weather map unavailable' : 'Air-quality map unavailable'}>The selected provider could not provide any location data for this layer. Use Refresh map to try again or switch layers.</InlineNotice>}
        <RegionMap locations={locations} airLocations={airLocations} layer={layer} />
        <div className="map-source">{layer === 'heat' ? weather ? <WeatherSourceNote weather={weather} freshness={freshness} /> : <span>Open-Meteo weather model · <WeatherAttribution /></span> : airQuality ? <AirQualitySourceNote air={airQuality} freshness={airFreshness} /> : <span>Open-Meteo/CAMS air-quality model · <WeatherAttribution /></span>}<span>Map outline: Natural Earth · no map tiles or invented warning zones</span></div>
      </Card>
      <aside className="card location-panel" aria-label="Selected location">
        <span className="section-label">Selected location</span>
        <h2>{selected.name}</h2>
        <p className="location-state">{selected.state}</p>
        {layer === 'heat' ? <>
          {status === 'loading' && <p role="status"><LoaderCircle className="weather-spinner" size={18} aria-hidden="true" />Loading {selected.name} weather…</p>}
          {status === 'error' && <div role="alert"><p>{error ?? 'Weather unavailable.'}</p><button type="button" className="button button-secondary" onClick={refresh}>Try again</button></div>}
          {weather && risk && <>
            <RiskBadge level={risk} />
            <div className="selected-weather"><div><span>Temperature</span><strong>{weather.temperature.toFixed(1)}°C</strong></div><div><span>Feels like</span><strong>{weather.apparentTemperature.toFixed(1)}°C</strong></div><div><span>Humidity</span><strong>{weather.humidity}%</strong></div></div>
            <p className="risk-calculation">{weatherRiskExplanation(weather)}</p>
            <p className="selected-safety">{riskRecommendations[risk]}</p>
          </>}
        </> : <>
          {airStatus === 'loading' && <p role="status"><LoaderCircle className="weather-spinner" size={18} aria-hidden="true" />Loading {selected.name} air quality…</p>}
          {airStatus === 'error' && <div role="alert"><p>{airError ?? 'Air quality unavailable.'}</p><button type="button" className="button button-secondary" onClick={refresh}>Try again</button></div>}
          {airQuality && airAssessment && <>
            <RiskBadge level={airAssessment.level} />
            <div className="selected-weather"><div><span>Modelled US AQI</span><strong>{airQuality.usAqi?.toFixed(0) ?? '—'}</strong></div><div><span>Modelled European AQI</span><strong>{airQuality.europeanAqi?.toFixed(0) ?? '—'}</strong></div><div><span>PM2.5</span><strong>{airQuality.pm2_5 === null ? '—' : `${airQuality.pm2_5.toFixed(1)} µg/m³`}</strong></div><div><span>PM10</span><strong>{airQuality.pm10 === null ? '—' : `${airQuality.pm10.toFixed(1)} µg/m³`}</strong></div></div>
            <p className="risk-calculation">{airAssessment.explanation}</p>
            <p className="selected-safety">{airAssessment.recommendation}</p>
          </>}
        </>}
        <details className="map-city-drawer">
          <summary><span>Choose a location</span><small>{selected.name} selected · {regions.length} cities</small></summary>
          <div className="location-list"><h3>All 15 configured locations</h3><div className="city-buttons">{regions.map((item) => <button type="button" key={item.slug} className={item.slug === region ? 'city-button selected' : 'city-button'} aria-label={`Select ${item.name}`} aria-pressed={item.slug === region} onClick={() => setRegion(item.slug)}><MapPin size={18} className="location-pin" aria-hidden="true" /><span>{item.name}</span>{item.slug === region && <Check size={18} className="location-check" aria-hidden="true" />}</button>)}</div></div>
        </details>
      </aside>
    </div>

    <details className="card decoder-drawer map-comparison-drawer">
      <summary>Compare all 15 configured locations in an accessible table ({layer === 'heat' ? 'Heat risk layer' : 'Air pollution layer'})</summary>
      <div className="decoder-drawer-body">
        <div className="table-scroll">
          <table className="map-comparison-table">
            <caption>{layer === 'heat' ? 'Current Open-Meteo weather-model heat screening across 15 Indian locations' : 'Current Open-Meteo/CAMS air-quality model screening across 15 Indian locations'}</caption>
            <thead>
              {layer === 'heat' ? (
                <tr><th scope="col">Location</th><th scope="col">Screening level</th><th scope="col">Temperature</th><th scope="col">Feels like</th><th scope="col">Heat index</th><th scope="col">Humidity</th><th scope="col">Action</th></tr>
              ) : (
                <tr><th scope="col">Location</th><th scope="col">Screening level</th><th scope="col">US AQI</th><th scope="col">European AQI</th><th scope="col">PM2.5</th><th scope="col">PM10</th><th scope="col">Action</th></tr>
              )}
            </thead>
            <tbody>
              {regions.map((item) => {
                if (layer === 'heat') {
                  const entry = map.entries[item.slug]
                  const data = entry?.data
                  const itemRisk = data ? getSimpleRisk(data.risk) : null
                  return (
                    <tr key={item.slug} className={item.slug === region ? 'active-table-row' : ''}>
                      <th scope="row">{item.name}, {item.state}</th>
                      <td>{itemRisk ? <RiskBadge level={itemRisk} subtle /> : 'No data'}</td>
                      <td>{data ? `${data.temperature.toFixed(1)}°C` : '—'}</td>
                      <td>{data ? `${data.apparentTemperature.toFixed(1)}°C` : '—'}</td>
                      <td>{data ? `${data.heatIndex.toFixed(1)}°C` : '—'}</td>
                      <td>{data ? `${data.humidity}%` : '—'}</td>
                      <td><button type="button" className="icon-text-button" aria-label={`Inspect ${item.name} from table`} onClick={() => setRegion(item.slug)}>{item.slug === region ? 'Active' : 'Inspect'}</button></td>
                    </tr>
                  )
                }
                const entry = map.airEntries[item.slug]
                const data = entry?.data
                const assessed = data ? assessAirQuality(data) : null
                return (
                  <tr key={item.slug} className={item.slug === region ? 'active-table-row' : ''}>
                    <th scope="row">{item.name}, {item.state}</th>
                    <td>{assessed ? <RiskBadge level={assessed.level} subtle /> : 'No data'}</td>
                    <td>{data?.usAqi != null ? data.usAqi.toFixed(0) : '—'}</td>
                    <td>{data?.europeanAqi != null ? data.europeanAqi.toFixed(0) : '—'}</td>
                    <td>{data?.pm2_5 != null ? `${data.pm2_5.toFixed(1)} µg/m³` : '—'}</td>
                    <td>{data?.pm10 != null ? `${data.pm10.toFixed(1)} µg/m³` : '—'}</td>
                    <td><button type="button" className="icon-text-button" aria-label={`Inspect ${item.name} from table`} onClick={() => setRegion(item.slug)}>{item.slug === region ? 'Active' : 'Inspect'}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  </div>
}
