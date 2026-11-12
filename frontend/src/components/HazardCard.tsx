import { ArrowUpRight, CloudSun, ShieldCheck, ThermometerSun, Wind } from 'lucide-react'
import type { HazardAssessment } from '../data/hazards'
import { GLOSSARY_TERMS, TermHelp } from './Comprehension'
import { formatWeatherTime, RiskBadge } from './ui'

const indicatorPlainDescriptions: Record<string, string> = {
  'Current temperature': 'Air temperature 2 metres above ground',
  'Feels like': 'Apparent temperature factoring in wind and humidity',
  'Calculated heat index': 'How hot shade air + humidity feels to the body',
  'Consecutive high-heat days': 'Back-to-back forecast days reaching 33°C+ heat index',
  'Five-day maximum temperature': 'Highest daytime temperature across the next 5 days',
  'US AQI': 'US EPA 0–500 air-quality index scale (50+ = Moderate)',
  'European AQI': 'European 0–100+ air-quality index scale (41+ = Moderate)',
  'PM2.5': 'Fine inhalable smoke & exhaust particles (≤2.5 µm)',
  'PM10': 'Coarser airborne dust & smoke particles (≤10 µm)',
  'Nitrogen dioxide (NO₂)': 'Gas mainly from road traffic and fuel combustion',
  'Ozone (O₃)': 'Ground-level smog gas formed when sunlight reacts with fumes',
  'Sulphur dioxide (SO₂)': 'Gas mainly from industrial and coal/oil burning',
  'Carbon monoxide (CO)': 'Odourless gas from incomplete fuel combustion',
}

export function HazardCard({ assessment, compact = false }: { assessment: HazardAssessment; compact?: boolean }) {
  const Icon = assessment.id === 'heat' ? ThermometerSun : Wind
  const visibleCount = compact ? 4 : 3
  const indicators = assessment.indicators.slice(0, visibleCount)
  const additionalIndicators = assessment.indicators.slice(visibleCount)
  const summary = assessment.id === 'air-quality'
    ? 'The level follows the higher caution band across the two modelled AQI scales.'
    : assessment.summary
  return <article className={`card hazard-card risk-${assessment.level}`}>
    <div className="hazard-card-header">
      <div className="hazard-card-title"><span className="card-header-icon"><Icon size={22} aria-hidden="true" /></span><div><span className="section-label">{assessment.id === 'heat' ? 'Current + five-day model' : 'Current + 24-hour model'}</span><h2>{assessment.title}</h2></div></div>
      <div className="hazard-card-badges">
        <RiskBadge level={assessment.level} />
        <TermHelp definition={assessment.id === 'heat' ? GLOSSARY_TERMS.heatIndex : GLOSSARY_TERMS.usVsEuAqi} label={assessment.id === 'heat' ? 'Heat index?' : 'Two AQI scales?'} />
      </div>
    </div>
    <p className="hazard-summary">{summary}</p>
    <div className="hazard-action-preview"><ShieldCheck size={17} aria-hidden="true" /><div><strong>What to do now:</strong> <span>{assessment.recommendation}</span></div></div>
    <div className="hazard-indicator-grid">{indicators.map((indicator) => <div className="hazard-indicator" key={indicator.label}><span>{indicator.label}</span><strong>{indicator.value}</strong>{indicatorPlainDescriptions[indicator.label] && <em className="hazard-indicator-plain">{indicatorPlainDescriptions[indicator.label]}</em>}<small>{indicator.source}</small></div>)}</div>
    {additionalIndicators.length > 0 && <details className="hazard-more-indicators"><summary>More readings ({additionalIndicators.length})</summary><div className="hazard-indicator-grid">{additionalIndicators.map((indicator) => <div className="hazard-indicator" key={indicator.label}><span>{indicator.label}</span><strong>{indicator.value}</strong>{indicatorPlainDescriptions[indicator.label] && <em className="hazard-indicator-plain">{indicatorPlainDescriptions[indicator.label]}</em>}<small>{indicator.source}</small></div>)}</div></details>}
    <p className="hazard-forecast"><CloudSun size={16} aria-hidden="true" />{assessment.forecastSummary}</p>
    <details className="hazard-details">
      <summary>Why this risk level?</summary>
      <div className="hazard-details-content">
        <h3>Assessment explanation</h3><p>{assessment.explanation}</p>
        <h3>Recommended action</h3><p>{assessment.recommendation}</p>
        <h3>Method and reliability</h3><p>{assessment.method}</p>
        <p><a href={assessment.methodUrl} rel="external">Read the assessment reference <ArrowUpRight size={14} aria-hidden="true" /></a></p>
        <p className="hazard-provenance">Source: {assessment.source}. Model time: <time dateTime={assessment.modelTime}>{formatWeatherTime(assessment.modelTime)} IST</time>. Retrieved: <time dateTime={assessment.retrievedAt}>{formatWeatherTime(assessment.retrievedAt)} IST</time>.</p>
      </div>
    </details>
  </article>
}
