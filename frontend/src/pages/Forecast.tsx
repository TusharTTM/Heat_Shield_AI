import { CalendarDays, CloudRain, CloudSun, Droplets, Sun, Thermometer } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useWeather } from '../context/WeatherContext'
import { getRegion } from '../data/regions'
import { GLOSSARY_TERMS, IllustrativeExample, TermHelp } from '../components/Comprehension'
import { ForecastChart } from '../components/ForecastChart'
import { Card, CardHeader, InlineNotice, PageHeader, RiskBadge, StatusBadge, WeatherError, WeatherLoading, WeatherSourceNote } from '../components/ui'
import { getSimpleRisk, riskFromHeatIndex } from '../data/heat'

export default function Forecast() {
  const { region } = useApp()
  const selected = getRegion(region)
  const { status, data: weather, error, freshness, warning, refresh } = useWeather()
  const badge = status === 'ready' ? <StatusBadge status={freshness === 'stale' ? 'stale' : 'weather-model'} /> : <StatusBadge status={status === 'loading' ? 'loading' : 'unavailable'} />

  if (status === 'loading' || !weather) {
    return <div className="page forecast-page"><PageHeader title="5-day weather forecast" description={`Open-Meteo weather model for ${selected.name}.`} actions={badge} />
      {status === 'error' ? <WeatherError name={selected.name} error={error} onRetry={refresh} /> : <WeatherLoading name={selected.name} />}
    </div>
  }

  const days = weather.forecast
  const hottest = days.reduce((peak, day) => day.max > peak.max ? day : peak)
  const coolestNight = days.reduce((coolest, day) => day.min < coolest.min ? day : coolest)
  const heatIndexDays = days.filter((day) => day.heatIndexMax != null)
  const peakHeatIndexDay = heatIndexDays.length > 0 ? heatIndexDays.reduce((peak, day) => (day.heatIndexMax ?? -Infinity) > (peak.heatIndexMax ?? -Infinity) ? day : peak) : null
  const wettestDay = days.reduce((wettest, day) => (day.precipitationSum ?? 0) > (wettest.precipitationSum ?? 0) ? day : wettest)
  const meanHigh = days.reduce((total, day) => total + day.max, 0) / days.length
  const hottestGap = hottest.max - meanHigh
  const hottestRisk = hottest.heatIndexMax != null ? getSimpleRisk(riskFromHeatIndex(hottest.heatIndexMax)) : null
  const rainDays = days.filter((day) => (day.precipitationProbabilityMax ?? 0) >= 40)
  const uvPeakDay = days.reduce((peak, day) => (day.uvIndexMax ?? -1) > (peak.uvIndexMax ?? -1) ? day : peak)

  return <div className="page forecast-page">
    <PageHeader title="5-day weather forecast" description={`Open-Meteo weather model for ${weather.name}: ${days[0].fullLabel} to ${days[days.length - 1].fullLabel}. Not an AI/ML prediction or official alert.`} actions={badge} />
    {warning && <InlineNotice kind="warning" title="Showing cached forecast">{warning}</InlineNotice>}
    <InlineNotice kind="warning" title={`Hottest forecast day: ${hottest.label}`}>The weather model reaches <strong>{hottest.max.toFixed(1)}°C</strong>. Avoid afternoon sun and keep water with you. This is not an official heat alert.</InlineNotice>

    <Card className="forecast-notable-card">
      <CardHeader
        title="What changes this week"
        subtitle={hottestGap >= 1.5 ? `${hottest.label} is the clear peak, about ${hottestGap.toFixed(1)}°C above the week’s average daytime high.` : 'No single day stands far above the rest of this week’s highs.'}
        icon={<CalendarDays size={22} aria-hidden="true" />}
      />
      <ul className="forecast-notable-list" aria-label="Notable forecast days">
        <li>
          <Thermometer size={18} aria-hidden="true" className="forecast-notable-icon hot" />
          <div><span>Peak heat stress</span><strong>{hottestRisk ? `Heat index up to ${hottest.heatIndexMax?.toFixed(1)}°C` : 'Hourly humidity incomplete'}</strong><small>{hottestRisk ? `On ${hottest.label}, the ${hottest.max.toFixed(1)}°C day` : 'Heat index unusable for these days'}{peakHeatIndexDay && peakHeatIndexDay.date !== hottest.date ? ` · humid peak on ${peakHeatIndexDay.label}` : ''}</small></div>
          {hottestRisk && <RiskBadge level={hottestRisk} subtle />}
        </li>
        <li>
          <Droplets size={18} aria-hidden="true" className="forecast-notable-icon night" />
          <div><span>Best night recovery</span><strong>{coolestNight.label} · low {coolestNight.min.toFixed(1)}°C</strong><small>{coolestNight.min >= 27 ? 'Every night stays warm — little overnight cooling' : 'Coolest overnight low of the five days'}</small></div>
        </li>
        <li>
          <CloudRain size={18} aria-hidden="true" className="forecast-notable-icon rain" />
          <div><span>{rainDays.length > 0 ? 'Rain to plan around' : 'Rain outlook'}</span><strong>{wettestDay.precipitationSum != null && wettestDay.precipitationSum > 0 ? `${wettestDay.label} · ${wettestDay.precipitationSum.toFixed(1)} mm` : 'No accumulated rain modelled'}</strong><small>{wettestDay.precipitationProbabilityMax != null ? `Highest chance ${wettestDay.precipitationProbabilityMax.toFixed(0)}% on ${wettestDay.label}` : 'Rain probability unavailable for these days'}</small></div>
        </li>
        <li>
          <Sun size={18} aria-hidden="true" className="forecast-notable-icon sun" />
          <div><span>Strongest sun</span><strong>{uvPeakDay.uvIndexMax != null ? `${uvPeakDay.label} · UV ${uvPeakDay.uvIndexMax.toFixed(1)}` : 'UV index unavailable'}</strong><small>Takes effect at midday, even in humid shade.</small></div>
        </li>
      </ul>
    </Card>

    <Card className="forecast-chart-card">
      <CardHeader
        title="Daily high & low temperature"
        subtitle="Open-Meteo model-estimated daily maximum (solid terracotta line) and overnight minimum (dashed teal line)."
        icon={<CloudSun size={22} aria-hidden="true" />}
        action={<TermHelp definition={GLOSSARY_TERMS.deterministic} label="Model vs AI?" />}
      />
      <ForecastChart days={days} source="open-meteo" />
      <WeatherSourceNote weather={weather} freshness={freshness} />
    </Card>

    <section className="forecast-days" aria-label="Five-day Open-Meteo forecast details">{days.map((day) => <article className={`forecast-day${day.date === hottest.date ? ' hottest' : ''}`} key={day.date} aria-label={`${day.fullLabel}. High ${day.max.toFixed(1)} degrees Celsius. Low ${day.min.toFixed(1)} degrees Celsius.${day.date === hottest.date ? ' Hottest forecast day.' : ''}`}>
      {/* The chip marks which of five rows holds the peak. It is a locator next to
          the data, not a third announcement of it — the banner still states the
          figure once, and the notable-days row no longer repeats it. */}
      {day.date === hottest.date && <span className="hottest-label">Hottest</span>}
      <h2>{day.label}</h2>
      <span className="forecast-high-label">High</span>
      <strong>{day.max.toFixed(1)}°C</strong>
      <span>Low {day.min.toFixed(1)}°C</span>
      {(day.precipitationProbabilityMax ?? 0) >= 40 && <span className="forecast-day-rain"><CloudRain size={13} aria-hidden="true" />{day.precipitationProbabilityMax?.toFixed(0)}% chance</span>}
      <CalendarDays size={18} aria-hidden="true" />
    </article>)}</section>

    <details className="card decoder-drawer forecast-detail-drawer">
      <summary>Day-by-day rain, heat index &amp; UV detail (all five days)</summary>
      <div className="decoder-drawer-body">
        <div className="table-scroll">
          <table className="forecast-detail-table">
            <caption>Open-Meteo weather-model values for {weather.name}. Precipitation is the 24-hour total; Chance is the highest hourly probability of measurable rain; Max heat index combines hourly temperature and humidity in shade; Max UV is the midday sun intensity.</caption>
            <thead><tr><th scope="col">Day</th><th scope="col">Precipitation</th><th scope="col">Chance</th><th scope="col">Max heat index</th><th scope="col">Max UV</th></tr></thead>
            <tbody>{days.map((day) => <tr key={day.date}>
              <th scope="row">{day.label}<span className="forecast-detail-date"> · {day.fullLabel}</span></th>
              <td>{day.precipitationSum == null ? '—' : `${day.precipitationSum.toFixed(1)} mm`}</td>
              <td>{day.precipitationProbabilityMax == null ? '—' : `${day.precipitationProbabilityMax.toFixed(0)}%`}</td>
              <td>{day.heatIndexMax == null ? '—' : `${day.heatIndexMax.toFixed(1)}°C`}</td>
              <td>{day.uvIndexMax == null ? '—' : day.uvIndexMax.toFixed(1)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="forecast-detail-source">Model time and last-updated timestamps for these values appear in the “Daily high &amp; low temperature” card above.</p>
      </div>
    </details>

    <details className="card decoder-drawer forecast-guide-drawer">
      <summary>How to read each daily card (Precipitation mm vs Chance %, Max heat index &amp; UV)</summary>
      <div className="decoder-drawer-body">
        <div className="decoder-pillars">
          <div><strong>High vs Low (°C):</strong> High is the warmest afternoon air temperature; warm overnight Lows (especially above ~27°C) reduce how much buildings and bodies cool down overnight.</div>
          <div><strong>Precipitation (mm) vs Chance (%):</strong> <em>Chance</em> is the highest hourly probability of measurable rain that day; <em>Precipitation (mm)</em> is the total depth of rain/showers accumulated over 24 hours.</div>
          <div><strong>Max heat index &amp; Max UV:</strong> <em>Max heat index</em> combines hourly temperature and humidity in shade. <em>Max UV</em> measures midday sunburn/eye intensity (0–2 Low, 3–5 Moderate, 6–7 High, 8–10 Very High, 11+ Extreme).</div>
        </div>
        <IllustrativeExample title="Reading rain chance vs rain amount">
          A card showing <strong>Chance 60%</strong> and <strong>Precipitation 1.5 mm</strong> points to a likely brief light shower rather than a heavy downpour—whereas <strong>50.0 mm</strong> indicates substantial rainfall even if it falls in a few hours.
        </IllustrativeExample>
      </div>
    </details>
  </div>
}
