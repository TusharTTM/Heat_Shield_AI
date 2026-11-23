import { useMemo } from 'react'
import { Flame, RefreshCw, Sunrise } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useSettings } from '../context/SettingsContext'
import { useWeather } from '../context/WeatherContext'
import { buildDayPlan, type CompareBlock } from '../data/dayPlanner'
import { getRegion } from '../data/regions'
import { useT } from '../i18n'
import { RiskBadge, formatWeatherTime } from './ui'

const BLOCK_KIND_LABEL: Record<CompareBlock['kind'], 'plan.blockPeak' | 'plan.blockLower' | 'plan.blockMixed' | 'plan.blockUnscreened'> = {
  peak: 'plan.blockPeak',
  lower: 'plan.blockLower',
  mixed: 'plan.blockMixed',
  unscreened: 'plan.blockUnscreened',
}

/**
 * Non-AI heat-risk day planner over the modelled hourly forecast the
 * dashboard already loads. Screening uses the same heat-index approximation
 * and risk thresholds as the rest of the app; every value is labelled as a
 * model estimate, and unscreened hours are shown as unknown — never as an
 * all-clear. No precise location or health data is used or transmitted.
 */
export function DayPlanner() {
  const t = useT()
  const { region } = useApp()
  const { formatTemp, tempSymbol } = useSettings()
  const { data: weather, status, freshness, warning, refresh } = useWeather()
  const selected = getRegion(region)

  const plan = useMemo(
    () => (weather ? buildDayPlan(weather.next24Hours, formatTemp, tempSymbol) : null),
    [weather, formatTemp, tempSymbol],
  )

  const updatedAt = weather ? formatWeatherTime(weather.retrievedAt) : ''

  const body = (() => {
    if (!weather && status === 'loading') {
      return <div className="day-planner-loading" role="status">
        <span className="action-checklist-loading-line" aria-hidden="true" />
        <p>{t('plan.loading')}</p>
      </div>
    }
    if (!weather) {
      return <div className="day-planner-empty" role="status">
        <strong>{t('plan.errorTitle')}</strong>
        <p>{t('plan.errorNote')}</p>
        <button type="button" className="icon-text-button" onClick={refresh}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>{t('plan.retry')}</span>
        </button>
      </div>
    }
    if (!plan || !plan.sufficient) {
      return <div className="day-planner-empty" role="status">
        <strong>{t('plan.emptyTitle')}</strong>
        <p>{t('plan.emptyNote')}</p>
      </div>
    }
    return <>
      <p id="day-planner-summary" className="day-planner-summary">{plan.summary}</p>

      <div
        className="day-planner-strip"
        role="group"
        tabIndex={0}
        aria-label={t('plan.timeline')}
        aria-describedby="day-planner-summary"
      >
        <ol className="day-planner-hours" aria-label={t('plan.timeline')}>
          {plan.hours.map((hour) => <li
            key={hour.isoTime}
            className={`day-planner-hour${hour.isPeak ? ' is-peak' : ''}${hour.inLowerWindow ? ' is-lower' : ''}`}
          >
            <span className="day-planner-hour-time">{hour.label}</span>
            <strong className="day-planner-hour-index">
              {hour.heatIndex === null ? '—' : `${formatTemp(hour.heatIndex)}${tempSymbol}`}
            </strong>
            {hour.displayRisk
              ? <RiskBadge level={hour.displayRisk} subtle />
              : <span className="day-planner-hour-unknown">{t('plan.blockUnscreened')}</span>}
            {hour.isPeak && <span className="day-planner-hour-tag"><Flame size={16} aria-hidden="true" />{t('plan.peakTag')}</span>}
            {hour.inLowerWindow && !hour.isPeak && <span className="day-planner-hour-tag day-planner-hour-tag--lower"><Sunrise size={16} aria-hidden="true" />{t('plan.lowerTag')}</span>}
            <span className="sr-only">{`${formatTemp(hour.temperature)}${tempSymbol} air temperature${hour.humidity === null ? '' : `, ${Math.round(hour.humidity)}% humidity`}`}</span>
          </li>)}
        </ol>
      </div>

      <ul className="day-planner-legend">
        <li><Flame size={16} aria-hidden="true" />{t('plan.legendPeak')}</li>
        <li><Sunrise size={16} aria-hidden="true" />{t('plan.legendLower')}</li>
      </ul>

      {plan.hasGaps && (
        <p className="day-planner-note day-planner-note--warn">
          {t('plan.unscreenedNote', { count: plan.unscreenedCount, total: plan.hours.length })}
        </p>
      )}

      <div className="day-planner-windows">
        <h4>{t('plan.lowerHeading')}</h4>
        {plan.lowerWindows.length > 0
          ? <ul className="day-planner-window-list">
            {plan.lowerWindows.map((window) => <li key={`${window.startLabel}-${window.endLabel}`}>
              <Sunrise size={16} aria-hidden="true" />
              <strong>{window.startLabel} – {window.endLabel}</strong>
              <span>{t('plan.peakHeatIndex', { value: `${formatTemp(window.peakHeatIndex)}${tempSymbol}` })}</span>
              <RiskBadge level={window.band} subtle />
            </li>)}
          </ul>
          : <p className="day-planner-note">{t('plan.lowerNone')}</p>}
        {plan.lowerWindows.length > 0 && (
          <p className="day-planner-caveat">{t('plan.lowerCaveat')}</p>
        )}
      </div>

      <div className="day-planner-compare">
        <h4>{t('plan.compareHeading')}</h4>
        <ul className="day-planner-blocks">
          {plan.blocks.map((block) => <li key={block.rangeLabel} className={`day-planner-block is-${block.kind}`}>
            <strong>{block.rangeLabel}</strong>
            <span>{block.peakHeatIndex === null ? '—' : t('plan.peakHeatIndex', { value: `${formatTemp(block.peakHeatIndex)}${tempSymbol}` })}</span>
            {block.band ? <RiskBadge level={block.band} subtle /> : <span className="day-planner-hour-unknown">{t('plan.blockUnscreened')}</span>}
            <small>{t(BLOCK_KIND_LABEL[block.kind])}</small>
          </li>)}
        </ul>
      </div>
    </>
  })()

  return <div className="early-warnings day-planner" role="group" aria-labelledby="day-planner-title">
    <div className="early-warnings-heading">
      <div>
        <h3 id="day-planner-title">{t('plan.title', { city: selected.name })}</h3>
      </div>
    </div>

    {(freshness === 'stale' || warning) && weather && (
      <p className="day-planner-note day-planner-note--warn" role="status">
        {warning ?? t('plan.stale', { time: updatedAt })}
      </p>
    )}

    {body}

    {weather && (
      <p className="early-warnings-note">
        {t('plan.sourceNote', { time: updatedAt })}{' · '}
        <span className="day-planner-caveat">Modelled values, not official warnings, station readings, or medical advice.</span>
      </p>
    )}
  </div>
}
