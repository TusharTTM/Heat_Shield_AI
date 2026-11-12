import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight, Database, Info, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { OPEN_METEO_ATTRIBUTION_URL, OPEN_METEO_LICENSE_URL } from '../api/openMeteo'
import type { AirQualityData, CurrentWeather, DataStatus, SimpleRiskLevel } from '../types'
import { GLOSSARY_TERMS, TermHelp } from './Comprehension'

export function StatusBadge({ status = 'unavailable', children }: { status?: DataStatus | 'offline' | 'official'; children?: ReactNode }) {
  const labels = { demonstration: 'Demo data', unavailable: 'Unavailable', offline: 'Offline', official: 'Official source', 'weather-model': 'Open-Meteo model', stale: 'Stale cached data', loading: 'Loading weather' }
  return <span className={`badge badge-${status}`}><span className="status-dot" aria-hidden="true" />{children ?? labels[status]}</span>
}

export function RiskBadge({ level, subtle = false }: { level: SimpleRiskLevel; subtle?: boolean }) {
  return <span className={`risk-badge risk-${level}${subtle ? ' risk-subtle' : ''}`}><ShieldCheck size={15} aria-hidden="true" />{level[0].toUpperCase() + level.slice(1)}</span>
}

export function DemoBanner() {
  return <aside className="demo-banner" aria-label="Environmental data status">
    <Info size={17} aria-hidden="true" />
    <span><strong>Open-Meteo weather + CAMS air-quality models.</strong> Model estimates; official warnings are shown separately.</span>
    <div className="demo-banner-actions">
      <details className="demo-banner-detail">
        <summary>Sources &amp; limits</summary>
        <p><strong>Every value on this site is a model estimate.</strong> Heat and AQI screening come from Open-Meteo weather and CAMS air-quality model grids — not physical IoT sensors in your neighbourhood, not CPCB monitoring-station observations, and not official government warnings. AI/ML predictions are not used by this public interface. Official warnings always take priority; check <a href="https://sachet.ndma.gov.in/" rel="external">NDMA SACHET</a>, <a href="https://mausam.imd.gov.in/" rel="external">IMD</a> and <a href="https://cpcb.nic.in/" rel="external">CPCB</a> directly.</p>
        <TermHelp definition={GLOSSARY_TERMS.cams} label="Model vs station?" />
        <a href={OPEN_METEO_ATTRIBUTION_URL} rel="external">Attribution <ArrowRight size={14} aria-hidden="true" /></a>
      </details>
    </div>
  </aside>
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div className="page-heading"><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>
}

export function Card({ children, className = '', as: Element = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div' }) {
  return <Element className={`card ${className}`}>{children}</Element>
}

export function CardHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="card-header"><div className="card-title-wrap">{icon && <span className="card-header-icon">{icon}</span>}<div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{action && <div className="card-action">{action}</div>}</div>
}

export function formatWeatherTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }).format(new Date(timestamp))
}

export function WeatherAttribution() {
  return <>Weather data by <a href={OPEN_METEO_ATTRIBUTION_URL} rel="external">Open-Meteo.com</a>, <a href={OPEN_METEO_LICENSE_URL} rel="external">CC BY 4.0</a>.</>
}

/**
 * Compact source + freshness strip. The decision-critical parts — that these are model
 * estimates, and when the values were modelled/retrieved — stay visible; the longer
 * provenance explanation folds into a disclosure so repeated disclaimers stop competing
 * with readings.
 */
export function WeatherSourceNote({ weather, freshness = 'current' }: { weather: CurrentWeather; freshness?: 'current' | 'stale' }) {
  return <div className="source-note">
    <p className="source-note-compact">
      <Database size={14} aria-hidden="true" />
      <span>
        <strong>{freshness === 'stale' ? 'Stale cached weather model data.' : 'Open-Meteo weather model'}</strong>
        {' · '}Model time: <time dateTime={weather.observedAt}>{formatWeatherTime(weather.observedAt)} IST</time>
        {' · '}Last updated: <time dateTime={weather.retrievedAt}>{formatWeatherTime(weather.retrievedAt)} IST</time>
      </span>
    </p>
    <details className="source-note-detail">
      <summary>What this source is and is not</summary>
      <p>Model estimates from the Open-Meteo weather model — not physical IoT sensor readings, not observations from a station in this neighbourhood, and not ML predictions. <WeatherAttribution /></p>
    </details>
  </div>
}

export function AirQualitySourceNote({ air, freshness = 'current' }: { air: AirQualityData; freshness?: 'current' | 'stale' }) {
  return <div className="source-note">
    <p className="source-note-compact">
      <Database size={14} aria-hidden="true" />
      <span>
        <strong>{freshness === 'stale' ? 'Stale cached CAMS air-quality model data.' : 'Open-Meteo/CAMS air-quality model'}</strong>
        {' · '}Model time: <time dateTime={air.modelTime}>{formatWeatherTime(air.modelTime)} IST</time>
        {' · '}Last updated: <time dateTime={air.retrievedAt}>{formatWeatherTime(air.retrievedAt)} IST</time>
      </span>
    </p>
    <details className="source-note-detail">
      <summary>What this source is and is not</summary>
      <p>Modelled US AQI, European AQI and pollutant concentrations from CAMS via Open-Meteo. These are <strong>not</strong> physical IoT sensor readings or ML predictions, not CPCB station observations, and not the Indian CPCB AQI. <WeatherAttribution /></p>
    </details>
  </div>
}

export function WeatherLoading({ name }: { name: string }) {
  return <section className="weather-state" role="status" aria-live="polite"><LoaderCircle className="weather-spinner" size={26} aria-hidden="true" /><h2>Loading weather for {name}</h2><p>Requesting current conditions and a five-day forecast from Open-Meteo…</p></section>
}

export function WeatherError({ name, error, onRetry }: { name: string; error: string | null; onRetry: () => void }) {
  return <section className="weather-state weather-error" role="alert"><AlertCircle size={28} aria-hidden="true" /><h2>Weather unavailable for {name}</h2><p>{error ?? 'Open-Meteo weather is unavailable.'}</p><p>No hardcoded readings are shown as live weather. Your other locations and safety guidance remain available.</p><button type="button" className="button button-secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" />Try again</button></section>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon ?? <AlertCircle size={24} />}</div><h1>{title}</h1><p>{description}</p>{action}</div>
}

export function InlineNotice({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'danger'; title: string; children: ReactNode }) {
  const Icon = kind === 'info' ? Info : kind === 'warning' ? ShieldAlert : AlertCircle
  return <div className={`inline-notice notice-${kind}`}><Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><p>{children}</p></div></div>
}
