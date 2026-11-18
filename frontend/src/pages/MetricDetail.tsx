import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { getHistoricalWeather } from '../api/openMeteo'
import { MetricChart, formatPointValue } from '../components/MetricChart'
import { formatWeatherTime } from '../components/ui'
import { useApp } from '../context/AppContext'
import { useSettings } from '../context/SettingsContext'
import { useWeather } from '../context/WeatherContext'
import {
  DAY_ORDER, DAY_TITLE_KEYS as DAY_KEY, METRIC_DEFINITIONS, METRIC_TITLE_KEYS as METRIC_TITLE_KEY,
  buildMetricDay, isDayId, isMetricId, neighborMetrics, resolveDayDates,
  type DayId,
} from '../data/metricDetails'
import { getRegion } from '../data/regions'
import type { HistoricalData } from '../types'
import { useT } from '../i18n'

interface HistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: HistoricalData | null
  error: string | null
}

/**
 * Dedicated per-metric, per-day detail view opened from the dashboard cards.
 * Charts and tables show only what the connected models provide — missing
 * readings are gaps and unavailable states, never invented values.
 */
export default function MetricDetail() {
  const t = useT()
  const { region } = useApp()
  const { convertTemp, tempSymbol } = useSettings()
  const { data: weather, airQuality, status, airStatus, refresh } = useWeather()
  const params = useParams<{ metricId: string }>()
  const [searchParams] = useSearchParams()

  const metricId = params.metricId
  const dayParam = searchParams.get('day')
  const day: DayId = isDayId(dayParam) ? dayParam : 'today'

  const [history, setHistory] = useState<HistoryState>({ status: 'idle', data: null, error: null })
  const [historyTick, setHistoryTick] = useState(0)

  const settled = status !== 'loading' && airStatus !== 'loading'
  const dates = useMemo(
    () => resolveDayDates(settled ? weather : null, settled ? airQuality : null),
    [settled, weather, airQuality],
  )
  const needsHistory = settled && day === 'yesterday' && metricId !== 'air-quality' && isMetricId(metricId)

  useEffect(() => {
    if (!needsHistory) return
    let active = true
    setHistory((previous) => ({ ...previous, status: 'loading', error: null }))
    getHistoricalWeather(getRegion(region), dates.yesterday, dates.yesterday)
      .then((result) => {
        if (active) setHistory({ status: 'ready', data: result.data, error: null })
      })
      .catch((caught: unknown) => {
        if (active) setHistory({ status: 'error', data: null, error: caught instanceof Error ? caught.message : 'Historical data is unavailable.' })
      })
    return () => { active = false }
  }, [needsHistory, region, dates.yesterday, historyTick])

  const retryHistory = useCallback(() => setHistoryTick((value) => value + 1), [])

  const view = useMemo(() => {
    if (!isMetricId(metricId)) return null
    return buildMetricDay(metricId, day, { weather, air: airQuality, history: history.data }, { convert: convertTemp, temperatureSymbol: tempSymbol })
  }, [metricId, day, weather, airQuality, history.data, convertTemp, tempSymbol])

  if (!isMetricId(metricId)) return <Navigate to="/" replace />

  const definition = METRIC_DEFINITIONS[metricId]
  const { previous, next } = neighborMetrics(metricId)
  const title = t(METRIC_TITLE_KEY[metricId])
  const digits = definition.unit === 'aqi' || definition.unit === 'index' ? 0 : 1

  const historyLoading = needsHistory && history.status === 'loading'
  const historyFailed = needsHistory && history.status === 'error'
  const loading = !settled || historyLoading
  const weatherFailed = status === 'error' && !weather
  const airFailed = metricId === 'air-quality' && airStatus === 'error' && !airQuality

  const body = (() => {
    if (loading) {
      return <div className="metric-detail-loading" role="status">
        <span className="action-checklist-loading-line" aria-hidden="true" />
        <p>{t('detail.loading')}</p>
      </div>
    }
    if (weatherFailed || airFailed || historyFailed) {
      return <div className="day-planner-empty" role="status">
        <strong>{t('detail.errorTitle')}</strong>
        <p>{t('detail.errorNote')}</p>
        <button type="button" className="icon-text-button" onClick={() => { if (historyFailed) retryHistory(); else refresh() }}>
          <RefreshCw size={13} aria-hidden="true" />
          <span>{t('detail.retry')}</span>
        </button>
      </div>
    }
    if (!view || !view.hasData) {
      return <div className="day-planner-empty" role="status">
        <strong>{t('detail.unavailableTitle')}</strong>
        <p>{view?.unavailableReason ?? t('detail.unavailableNote')}</p>
      </div>
    }
    return <>
      <ul className="metric-summary-row" aria-label={t('detail.summary')}>
        {view.summary.current !== null && view.summary.currentLabel && (
          <li><span>{t('detail.current')}</span><strong>{formatPointValue(view.summary.current, view.unitLabel, digits)}</strong><small>{view.summary.currentLabel}</small></li>
        )}
        <li><span>{t('detail.minimum')}</span><strong>{formatPointValue(view.summary.min, view.unitLabel, digits)}</strong><small>{view.summary.rangeLabel}</small></li>
        <li><span>{t('detail.maximum')}</span><strong>{formatPointValue(view.summary.max, view.unitLabel, digits)}</strong><small>{view.summary.rangeLabel}</small></li>
      </ul>

      <MetricChart
        points={view.points}
        chartLabel={definition.chartLabel}
        unitLabel={view.unitLabel}
        summaryLabel={`${title} — ${t(DAY_KEY[day])}`}
        digits={digits}
      />

      {view.gapCount > 0 && (
        <p className="day-planner-note day-planner-note--warn">
          {t('detail.gapsNote', { count: view.gapCount, total: view.points.length })}
        </p>
      )}

      <details className="hourly-data-details">
        <summary>{t('detail.hourlyTable')}</summary>
        <div className="table-scroll">
          <table>
            <caption>{view.source} · modelled estimates — not official warnings or station observations</caption>
            <thead>
              <tr>
                <th scope="col">{t('detail.hour')}</th>
                <th scope="col">{definition.chartLabel} ({view.unitLabel})</th>
                <th scope="col">{t('detail.note')}</th>
              </tr>
            </thead>
            <tbody>
              {view.points.map((point) => <tr key={point.isoTime}>
                <td>{point.label}</td>
                <td>{formatPointValue(point.value, view.unitLabel, digits)}</td>
                <td>{point.note ?? '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>

      <section className="metric-explain" aria-label={t('detail.about')}>
        <h2>{t('detail.whatItMeans')}</h2>
        <p>{definition.whatItMeans}</p>
        <h2>{t('detail.safetyGuidance')}</h2>
        <p>{definition.safetyGuidance}</p>
      </section>
    </>
  })()

  return <section className="metric-detail" aria-labelledby="metric-detail-title">
    <div className="metric-detail-top">
      <Link to="/" className="icon-text-button metric-detail-back">
        <ArrowLeft size={14} aria-hidden="true" />
        <span>{t('detail.back')}</span>
      </Link>
      <nav className="metric-detail-metrics" aria-label={t('detail.metrics')}>
        <Link to={`/metric/${previous}?day=${day}`} className="icon-text-button" aria-label={t('detail.previousMetric', { metric: t(METRIC_TITLE_KEY[previous]) })}>
          <ChevronLeft size={14} aria-hidden="true" />
          <span>{t(METRIC_TITLE_KEY[previous])}</span>
        </Link>
        <Link to={`/metric/${next}?day=${day}`} className="icon-text-button" aria-label={t('detail.nextMetric', { metric: t(METRIC_TITLE_KEY[next]) })}>
          <span>{t(METRIC_TITLE_KEY[next])}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </nav>
    </div>

    <header className="metric-detail-head">
      <span className="uploaded-eyebrow">{t('detail.kicker')}</span>
      <h1 id="metric-detail-title">{title} · {t(DAY_KEY[day])}</h1>
    </header>

    <nav className="metric-detail-days" aria-label={t('detail.dates')}>
      {DAY_ORDER.map((value) => <Link
        key={value}
        to={`/metric/${metricId}?day=${value}`}
        aria-current={value === day ? 'page' : undefined}
        className={`metric-day-link${value === day ? ' is-active' : ''}`}
      >
        {t(DAY_KEY[value])}
        <small>{dates[value]}</small>
      </Link>)}
    </nav>

    {body}

    {view && (
      <footer className="metric-detail-source">
        <p>
          <strong>{t('detail.source')}:</strong> {view.source}
          {view.updatedAt && <> · <strong>{t('detail.updatedAt')}:</strong> {formatWeatherTime(view.updatedAt)}</>}
        </p>
        <p className="day-planner-caveat">Modelled values — not official warnings, not station observations, not medical advice.</p>
      </footer>
    )}

    <nav className="metric-detail-metrics" aria-label={t('detail.metrics')}>
      <Link to={`/metric/${previous}?day=${day}`} className="icon-text-button" aria-label={t('detail.previousMetric', { metric: t(METRIC_TITLE_KEY[previous]) })}>
        <ChevronLeft size={14} aria-hidden="true" />
        <span>{t(METRIC_TITLE_KEY[previous])}</span>
      </Link>
      <Link to={`/metric/${next}?day=${day}`} className="icon-text-button" aria-label={t('detail.nextMetric', { metric: t(METRIC_TITLE_KEY[next]) })}>
        <span>{t(METRIC_TITLE_KEY[next])}</span>
        <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </nav>
  </section>
}
