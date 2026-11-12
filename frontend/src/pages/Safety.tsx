import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CloudLightning, CloudRain, Droplets, HeartHandshake, LoaderCircle, PhoneCall, ShieldAlert, ShieldCheck, Sun, ThermometerSun, Tornado, Users, Wind } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useWeather } from '../context/WeatherContext'
import { guidanceSources, riskRecommendations, safetyTips } from '../data/guidance'
import { displayHeatRiskBands, getSimpleRisk, HEAT_INDEX_METHOD_URL } from '../data/heat'
import { aqiRecommendations, assessAirQuality, EUROPEAN_AQI_METHOD_URL, europeanAqiRecommendations, US_AQI_METHOD_URL } from '../data/hazards'
import { hazardSafetyGuides } from '../data/safetyGuides'
import { getRegion } from '../data/regions'
import { weatherRiskExplanation } from '../api/openMeteo'
import { GLOSSARY_TERMS, IllustrativeExample, PageJumpNav, SectionIntro, TermHelp } from '../components/Comprehension'
import { AirQualitySourceNote, Card, PageHeader, RiskBadge, StatusBadge, WeatherSourceNote } from '../components/ui'

const tipIcons = { hydration: Droplets, shade: Sun, clothing: Wind, community: Users, 'medical-help': HeartHandshake }
const guideIcons = { 'air-quality': Wind, flood: CloudRain, cyclone: Tornado, thunderstorm: CloudLightning, drought: Droplets }
const aqiBands = [
  { range: '0–50', category: 'Good', level: 'low' },
  { range: '51–100', category: 'Moderate', level: 'moderate' },
  { range: '101–150', category: 'Unhealthy for Sensitive Groups', level: 'moderate' },
  { range: '151–200', category: 'Unhealthy', level: 'high' },
  { range: '201–300', category: 'Very Unhealthy', level: 'extreme' },
  { range: '301–500+', category: 'Hazardous', level: 'extreme' },
] as const
const europeanAqiBands = [
  { range: '0–20', category: 'Good', level: 'low' },
  { range: '21–40', category: 'Fair', level: 'low' },
  { range: '41–60', category: 'Moderate', level: 'moderate' },
  { range: '61–80', category: 'Poor', level: 'high' },
  { range: '81–100', category: 'Very Poor', level: 'extreme' },
  { range: 'Above 100', category: 'Extremely Poor', level: 'extreme' },
] as const

export default function Safety() {
  const { region } = useApp()
  const selected = getRegion(region)
  const { status, data: weather, error, freshness, refresh, airStatus, airQuality, airError, airFreshness } = useWeather()
  const risk = weather ? getSimpleRisk(weather.risk) : null
  const airAssessment = airQuality ? assessAirQuality(airQuality) : null
  const anyReady = status === 'ready' || airStatus === 'ready'
  const stale = freshness === 'stale' || airFreshness === 'stale'
  const [openGuides, setOpenGuides] = useState<Record<string, boolean>>({})
  const allGuidesOpen = hazardSafetyGuides.every((guide) => Boolean(openGuides[guide.id]))

  const toggleAllGuides = () => {
    const next = !allGuidesOpen
    setOpenGuides(Object.fromEntries(hazardSafetyGuides.map((guide) => [guide.id, next])))
  }

  return <div className="page safety-page">
    <PageHeader title="Safety Guide" description="Practical, sourced preparedness guidance for heat, air pollution, floods, cyclones, thunderstorms, and drought." actions={<StatusBadge status={stale && anyReady ? 'stale' : anyReady ? 'weather-model' : status === 'loading' || airStatus === 'loading' ? 'loading' : 'unavailable'} />} />

    <PageJumpNav items={[
      { id: 'safety-emergency', label: '1. Emergency 112' },
      { id: 'safety-city', label: `2. ${selected.name} now` },
      { id: 'safety-heat-tips', label: '3. Everyday heat habits' },
      { id: 'safety-hazards', label: '4. Multi-hazard guides' },
      { id: 'safety-scales', label: '5. References: scales & sources' },
    ]} />

    <div className="safety-urgent-bar">
      <span><ShieldAlert size={17} aria-hidden="true" /><strong>Suspected heatstroke (confusion, fainting, seizures, very high body temperature)?</strong> Act immediately.</span>
      <a href="#safety-emergency" className="text-link">Jump to emergency 112 steps</a>
    </div>

    <div id="safety-emergency">
      <span className="section-label">Part 1 · Emergency response — start here if someone is overheating</span>
      <section className="emergency-panel" aria-labelledby="emergency-title">
        <div className="emergency-copy"><ShieldAlert size={30} aria-hidden="true" /><div><span>Possible heatstroke is an emergency</span><h2 id="emergency-title">Call for help. Start cooling now.</h2><p>Move the person to a cooler place, remove extra clothing and apply cool, wet cloths. Do not give fluids to someone who may have heatstroke, is confused, unconscious, vomiting or having seizures.</p></div></div>
        <a className="button emergency-call" href="tel:112"><PhoneCall size={19} aria-hidden="true" />Call 112 in India</a>
      </section>
      <p className="medical-note"><ThermometerSun size={17} aria-hidden="true" /><span>Follow emergency professionals and official local advice.<details className="inline-detail"><summary>Scope of this guidance</summary><p>This is general safety information, not a medical diagnosis.</p></details></span></p>
    </div>

    <div id="safety-city">
      <SectionIntro
        eyebrow="Part 2 · Right now in your selected city"
        title={`Current model-based precautions for ${selected.name}`}
        summary="Plain-language next steps matched to your city’s current heat-index and air-quality model estimates."
      />
      <section className={`card selected-guidance${risk ? ` risk-${risk}` : ''}`} aria-labelledby="selected-guidance-title">
        <div className="selected-guidance-summary">
          <div className="selected-guidance-heading"><div><span className="section-label">Selected weather-model location</span><h2 id="selected-guidance-title">Guidance for {selected.name}</h2></div>{risk && <RiskBadge level={risk} />}</div>
          {status === 'loading' && <p role="status"><LoaderCircle className="weather-spinner" size={18} aria-hidden="true" />Loading Open-Meteo weather for risk-specific guidance…</p>}
          {status === 'error' && <div role="alert"><p>Risk-specific guidance is unavailable: {error ?? 'weather unavailable'}</p><button type="button" className="button button-secondary" onClick={refresh}>Try again</button></div>}
          {weather && <><WeatherSourceNote weather={weather} freshness={freshness} /><p className="risk-explanation">{weatherRiskExplanation(weather)}</p></>}
        </div>
        {weather && risk && <div className="selected-guidance-next"><ShieldCheck className="guidance-action-icon" size={26} aria-hidden="true" /><p className="selected-guidance-action">{riskRecommendations[risk]}</p></div>}
        <p className="heat-index-note">Heat index estimates how hot it feels in shade with light wind; direct sunshine can increase heat stress.<details className="inline-detail"><summary>How this guidance is produced</summary><p>Deterministic published rules applied to Open-Meteo model values. This guidance is not AI-generated, a physical sensor assessment, or an official warning.</p></details></p>
      </section>

      <section className={`card selected-guidance${airAssessment ? ` risk-${airAssessment.level}` : ''}`} aria-labelledby="air-guidance-title">
        <div className="selected-guidance-summary">
          <div className="selected-guidance-heading"><div><span className="section-label">Modelled US + European AQI · not CPCB station AQI</span><h2 id="air-guidance-title">Air-quality guidance for {selected.name}</h2></div>{airAssessment && <RiskBadge level={airAssessment.level} />}</div>
          {airStatus === 'loading' && <p role="status"><LoaderCircle className="weather-spinner" size={18} aria-hidden="true" />Loading CAMS air-quality model guidance…</p>}
          {airStatus === 'error' && <p>Model-specific air guidance is unavailable: {airError ?? 'air quality unavailable'}. General guidance below remains available.</p>}
          {airQuality && <AirQualitySourceNote air={airQuality} freshness={airFreshness} />}
          {airAssessment && <p className="risk-explanation">{airAssessment.explanation}</p>}
        </div>
        {airAssessment && <div className="selected-guidance-next"><Wind className="guidance-action-icon" size={26} aria-hidden="true" /><p className="selected-guidance-action">{airAssessment.recommendation}</p></div>}
      </section>
    </div>

    <div id="safety-heat-tips">
      <SectionIntro
        eyebrow="Part 3 · Practical daily habits"
        title="Five core heat-safety habits"
        summary="Simple precautions that apply even when internet data or forecasts are unavailable."
      />
      <section className="safety-grid" aria-label="General heat safety tips">{safetyTips.map((tip) => {
        const Icon = tipIcons[tip.id]
        return <Card as="article" className="safety-tip" key={tip.id}><span className="safety-icon"><Icon size={24} aria-hidden="true" /></span><h2>{tip.title}</h2><p>{tip.text}</p></Card>
      })}</section>
    </div>

    <section id="safety-hazards" className="hazard-safety-guides" aria-labelledby="hazard-guides-title">
      <div className="section-heading">
        <div>
          <span className="section-label">Part 4 · Preparedness without prediction claims</span>
          <h2 id="hazard-guides-title">More hazard safety guides</h2>
          <p>Expand a guide for general steps, or open all five at once. These are preparedness steps—not hazard predictions. Flood, cyclone, lightning and drought limits are on the <Link to="/monitor#monitor-coverage" className="text-link">Disaster Monitor</Link>.</p>
        </div>
        <button type="button" className="icon-text-button" onClick={toggleAllGuides} aria-expanded={allGuidesOpen}>
          {allGuidesOpen ? 'Collapse all 5 guides' : 'Expand all 5 guides'}
        </button>
      </div>
      {hazardSafetyGuides.map((guide) => {
        const Icon = guideIcons[guide.id]
        return <details
          className="card hazard-safety-guide"
          key={guide.id}
          open={Boolean(openGuides[guide.id])}
          onToggle={(event) => {
            const isOpen = (event.currentTarget as HTMLDetailsElement).open
            setOpenGuides((prev) => (prev[guide.id] === isOpen ? prev : { ...prev, [guide.id]: isOpen }))
          }}
        ><summary><span className="safety-icon"><Icon size={23} aria-hidden="true" /></span><span><strong>{guide.title}</strong><small>{guide.coverage}</small></span></summary><div className="hazard-safety-guide-content"><ul>{guide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul><div className="guide-source-links">{guide.sources.map((source) => <a href={source.url} rel="external" key={source.url}>{source.label}<ArrowUpRight size={14} aria-hidden="true" /></a>)}</div></div></details>
      })}
    </section>

    <div id="safety-scales">
      <details className="card decoder-drawer safety-references-drawer">
        <summary>References · Heat Index, US &amp; European AQI scales, and official agency sources</summary>
        <div className="decoder-drawer-body">
      <SectionIntro
        eyebrow="Part 5 · How the numbers translate into badges"
        title="Reference tables: Heat Index, US AQI, and European AQI"
        summary="HeatShield maps three published scientific scales onto four consistent badges (Low, Moderate, High, Extreme) so you can compare them at a glance without losing the original numbers."
        action={<TermHelp definition={GLOSSARY_TERMS.usVsEuAqi} label="Why two AQI tables?" />}
      />
      <IllustrativeExample title="Why the same air can have two different AQI numbers">
        For the exact same CAMS pollutant forecast, <strong>US AQI</strong> (scaled 0–500) might read <strong>125</strong> (<em>Unhealthy for Sensitive Groups</em> → Moderate badge), while <strong>European AQI</strong> (scaled 0–100+) reads <strong>65</strong> (<em>Poor</em> → High badge). Both numbers describe the same air using different official formulas; HeatShield displays both and highlights the higher caution badge.
      </IllustrativeExample>

      <section className="card risk-level-guide" aria-labelledby="risk-level-guide-title">
        <div className="risk-level-guide-heading"><div><span className="section-label">Calculated heat index</span><h2 id="risk-level-guide-title">Heat-index screening levels</h2></div><a href={HEAT_INDEX_METHOD_URL} rel="external">NOAA/NWS method <ArrowUpRight size={15} aria-hidden="true" /></a></div>
        <p className="risk-method-copy">The calculator uses the NOAA/NWS heat-index regression and applicable humidity adjustments. These are rounded Celsius screening bands, not trained ML classes or official IMD warnings. Local authorities may use different thresholds.</p>
        <div className="risk-threshold-grid">{displayHeatRiskBands.map((band) => <article className={`risk-threshold risk-${band.level}`} key={band.level}><RiskBadge level={band.level} /><strong className="risk-range">{band.range}</strong><p className="risk-basis">{band.basis}</p><p className="risk-action">{riskRecommendations[band.level]}</p></article>)}</div>
      </section>

      <section className="card risk-level-guide" aria-labelledby="aqi-guide-title">
        <div className="risk-level-guide-heading"><div><span className="section-label">Modelled US AQI</span><h2 id="aqi-guide-title">US AQI categories and health guidance</h2></div><a href={US_AQI_METHOD_URL} rel="external">US EPA/AirNow method <ArrowUpRight size={15} aria-hidden="true" /></a></div>
        <p className="risk-method-copy">These are US AQI categories supplied by the CAMS model through Open-Meteo. They are not Indian CPCB AQI categories or station observations. Four-level screening maps 0–50 Low, 51–150 Moderate, 151–200 High, and above 200 Extreme.</p>
        <div className="aqi-band-grid">{aqiBands.map((band) => <article className={`risk-threshold risk-${band.level}`} key={band.range}><RiskBadge level={band.level} /><strong className="risk-range">US AQI {band.range}</strong><p className="risk-basis">{band.category}</p><p className="risk-action">{aqiRecommendations[band.category]}</p></article>)}</div>
      </section>

      <section className="card risk-level-guide" aria-labelledby="european-aqi-guide-title">
        <div className="risk-level-guide-heading"><div><span className="section-label">Modelled European AQI</span><h2 id="european-aqi-guide-title">European AQI categories and health guidance</h2></div><a href={EUROPEAN_AQI_METHOD_URL} rel="external">European Environment Agency method <ArrowUpRight size={15} aria-hidden="true" /></a></div>
        <p className="risk-method-copy">These are European AQI categories supplied by the CAMS model through Open-Meteo. They are not US AQI or Indian CPCB AQI. Four-level screening maps 0–40 Low, 41–60 Moderate, 61–80 High, and above 80 Extreme.</p>
        <div className="aqi-band-grid">{europeanAqiBands.map((band) => <article className={`risk-threshold risk-${band.level}`} key={band.range}><RiskBadge level={band.level} /><strong className="risk-range">European AQI {band.range}</strong><p className="risk-basis">{band.category}</p><p className="risk-action">{europeanAqiRecommendations[band.category]}</p></article>)}</div>
      </section>

      <div id="safety-sources">
      <section className="card official-sources-card" aria-labelledby="official-agencies-title">
        <span className="section-label">Official agencies &amp; guidance sources</span>
        <h2 id="official-agencies-title">Current official information</h2>
        <p>These agencies take priority over generated screening. Opening an external source does not imply that this application has a live connection to it.</p>
        <div className="source-list">
          <a href="https://sachet.ndma.gov.in/" rel="external"><div><strong>NDMA SACHET</strong><span>Official Common Alerting Protocol disaster warnings</span></div><ArrowUpRight size={18} aria-hidden="true" /></a>
          <a href="https://mausam.imd.gov.in/" rel="external"><div><strong>India Meteorological Department</strong><span>Weather, cyclone and district warnings</span></div><ArrowUpRight size={18} aria-hidden="true" /></a>
          <a href="https://www.cpcb.nic.in/" rel="external"><div><strong>Central Pollution Control Board</strong><span>Air-quality observations and public information</span></div><ArrowUpRight size={18} aria-hidden="true" /></a>
          <a href="https://ffs.india-water.gov.in/" rel="external"><div><strong>CWC Flood Forecasting</strong><span>Official gauge- and basin-based flood forecasts</span></div><ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </section>

      <section className="guidance-sources" aria-labelledby="guidance-sources-title">
        <h2 id="guidance-sources-title">Heat guidance sources</h2>
        <p>These public resources inform the general safety and heat-index explanations above.</p>
        <ul>{guidanceSources.map((source) => <li key={source.url}><a href={source.url} rel="external">{source.label}<ArrowUpRight size={15} aria-hidden="true" /></a><span>{source.description}</span></li>)}</ul>
      </section>
    </div>
        </div>
      </details>
    </div>

  </div>
}
