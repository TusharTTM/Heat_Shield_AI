import { useState } from 'react'
import { ArrowRight, BellRing, BookOpen, BrainCircuit, CheckCircle2, CloudSun, Cpu, Database, HeartHandshake, Lock, Scale, ShieldAlert, Wind } from 'lucide-react'
import { Link } from 'react-router-dom'
import { OFFICIAL_API_CONFIGURED } from '../api/official'
import { GLOSSARY_TERMS, PageJumpNav } from '../components/Comprehension'
import { Card, PageHeader, StatusBadge } from '../components/ui'

const glossaryEntries = Object.entries(GLOSSARY_TERMS)

export default function About() {
  const [openTerms, setOpenTerms] = useState<Record<string, boolean>>({})
  const allTermsOpen = glossaryEntries.every(([key]) => Boolean(openTerms[key]))

  const toggleAllTerms = () => {
    const next = !allTermsOpen
    setOpenTerms(Object.fromEntries(glossaryEntries.map(([key]) => [key, next])))
  }

  return <div className="page about-page">
    <PageHeader title="About HeatShield AI" description="A source-aware environmental monitoring and multi-hazard preparedness platform, starting with heat and air quality in India." />

    <PageJumpNav items={[
      { id: 'about-overview', label: '1. At a glance' },
      { id: 'about-status', label: '2. Which sources are active' },
      { id: 'about-story', label: '3. How it works & limits' },
      { id: 'about-glossary', label: '4. Plain-language glossary' },
    ]} />

    <section id="about-overview" className="about-overview-section" aria-label="Platform summary at a glance">
      <span className="section-label">Part 1 · At a glance</span>
      <div className="about-highlights-grid">
      <div className="overview-pill-card"><CheckCircle2 size={20} aria-hidden="true" /><strong>15 Indian locations</strong><p>Shared city selection across Dashboard, Disaster Monitor, 5-Day Forecast, Risk Map, Alerts, and Safety Guide.</p></div>
      <div className="overview-pill-card"><Scale size={20} aria-hidden="true" /><strong>Explainable rules</strong><p>Uses published NOAA/NWS heat-index and US/European AQI formulas—never black-box AI claims on the public site.</p></div>
      <div className="overview-pill-card"><ShieldAlert size={20} aria-hidden="true" /><strong>No fake “Safe” labels</strong><p>Missing feeds or unassessed hazards (flood, cyclone, lightning, drought) are shown openly rather than marked safe.</p></div>
      <div className="overview-pill-card"><Lock size={20} aria-hidden="true" /><strong>Private by design</strong><p>Your chosen city and 10-minute weather cache stay in your browser; no GPS tracking or personal data collection.</p></div>
      </div>
    </section>

    <section id="about-status" className="about-status-section" aria-label="Which sources are active">
      <Card className="status-card">
        <span className="section-label">Part 2 · Data sources</span>
          <h2>Which sources are active right now</h2>
          <p className="status-card-lead">This is the deployed public web build. Open-Meteo weather and CAMS air quality are live; the rest are listed as they actually are.</p>
          <div className="about-status"><div><span><CloudSun size={19} aria-hidden="true" />Weather</span><small className="about-status-sub">Current, hourly &amp; 5-day forecast · 5 heat-index indicators</small></div><StatusBadge status="weather-model">Open-Meteo integration</StatusBadge></div>
          <div className="about-status"><div><span><Wind size={19} aria-hidden="true" />Air quality</span><small className="about-status-sub">US AQI, European AQI &amp; 6 pollutants</small></div><StatusBadge status="weather-model">CAMS model · not CPCB</StatusBadge></div>
          <div className="about-status"><div><span><BellRing size={19} aria-hidden="true" />SACHET CAP warnings</span><small className="about-status-sub">Needs optional FastAPI server</small></div><StatusBadge status="offline">{OFFICIAL_API_CONFIGURED ? 'Backend configured · verify live panel' : 'Backend not configured'}</StatusBadge></div>
          <div className="about-status"><div><span><Database size={19} aria-hidden="true" />CPCB observations</span><small className="about-status-sub">Needs FastAPI + data.gov.in key</small></div><StatusBadge status="offline">{OFFICIAL_API_CONFIGURED ? 'Backend configured · CPCB status checked in live panel' : 'Backend not configured'}</StatusBadge></div>
          <div className="about-status"><div><span><BrainCircuit size={19} aria-hidden="true" />Public AI/ML predictions</span><small className="about-status-sub">Offline repo candidates only</small></div><StatusBadge status="offline">Not used</StatusBadge></div>
          <div className="about-status"><div><span><Cpu size={19} aria-hidden="true" />Physical IoT sensors</span><small className="about-status-sub">ESP32 firmware not deployed here</small></div><StatusBadge status="offline">Not connected</StatusBadge></div>
          <p className="status-explanation">A successful weather or CAMS response does not mean an ML disaster model, official warning feed, hosted backend, or physical sensor is working. Model coverage and freshness are shown beside the data.</p>
          <p className="status-explanation">Your selected city, cached model responses, and notification-deduplication history are stored only in this browser when storage is available. No precise device location is collected.</p>
        </Card>
    </section>

    <div className="about-grid">
      <div className="about-main-column">
        <Card className="about-story" as="div">
          <div id="about-story" className="about-story-lead">
            <span className="section-label">Part 3 · How it works &amp; what it cannot do</span>
            <h2>What HeatShield AI does</h2>
            <p className="about-plain-takeaway"><strong>In plain language:</strong> It reads computer weather and air-pollution forecasts for one Indian city you choose, applies published heat-index and AQI rules, and turns them into a screening badge plus practical next steps. It is not a government warning system and it does not predict earthquakes, floods, cyclones, lightning, or drought.</p>
            <p>Official warnings and ground-station readings appear only when the optional backend is configured. Everything else on this site is clearly labelled model-based screening.</p>
          </div>
          <details className="decoder-drawer about-story-drawer">
            <summary>Technical detail · capabilities, rating bands, model limits &amp; licensing (5 sections)</summary>
            <div className="decoder-drawer-body">
          <div className="about-topic-block">
            <span className="section-label">1 · Core capabilities</span>
            <h2>What works today</h2>
            <p className="about-plain-takeaway"><strong>In plain language:</strong> Pick any of 15 Indian cities once, and every page updates with live computer weather forecasts, air-pollution estimates, and practical safety steps.</p>
            <p>HeatShield AI combines Open-Meteo current weather, hourly values and five-day forecasts with CAMS air-quality model estimates across fifteen configured Indian locations. The Dashboard, Disaster Monitor, Forecast, two-layer Risk Map, Alerts (official SACHET CAP coverage when configured plus separate generated assessment notices), Safety Guide and location picker share the same selected city. Heat and US/European-AQI screening use documented deterministic rules with reasons, sources, model/retrieval times, freshness and recommended actions.</p>
          </div>

          <div className="about-topic-block">
            <span className="section-label">2 · Rating bands</span>
            <h2>What the risk labels mean</h2>
            <p className="about-plain-takeaway"><strong>In plain language:</strong> Low, Moderate, High, and Extreme only rate heat and air-quality model numbers—they never mean you are safe from floods, storms, or other disasters.</p>
            <p>Low, Moderate, High and Extreme are HeatShield&rsquo;s four screening bands. Each band is decided from the heat-index and AQI thresholds published on the Dashboard, and the same four words are used on the Dashboard, Risk Map, Alerts and Safety Guide, so a band means the same thing everywhere. Alert language is kept separate: moderate conditions produce a Watch, high a Warning and extreme a Severe, and those words describe HeatShield notices only. Screening bands are not probabilities, official disaster warnings or a claim that every hazard is monitored. Missing inputs create a partial or unavailable assessment, not fabricated readings. Heavy-rain/flood, cyclone, lightning and drought engines remain explicitly incomplete.</p>
          </div>

          <div className="about-topic-block">
            <span className="section-label">3 · Models vs. ground truth</span>
            <h2>Model estimates are not official observations</h2>
            <p className="about-plain-takeaway"><strong>In plain language:</strong> Numbers on this public site come from atmospheric computer grids, not physical street-corner sensors or government warning agencies.</p>
            <p>Air-quality values are modelled US AQI, European AQI and pollutant concentrations from the Open-Meteo Air Quality API using CAMS. They are not CPCB station observations or Indian CPCB AQI. Weather forecasts are not AI/ML predictions. The optional browser notifier deduplicates generated heat/AQI notices. An optional FastAPI deployment can separately retrieve NDMA SACHET CAP warnings and CPCB station observations; direct IMD district-warning/CWC city-gauge feeds, email/SMS and background push remain unconnected.</p>
          </div>

          <div className="about-topic-block">
            <span className="section-label">4 · Why some hazards aren’t rated</span>
            <h2>Responsible prediction limits</h2>
            <p className="about-plain-takeaway"><strong>In plain language:</strong> Rain forecasts alone cannot tell if rivers or drains will overflow, and gust forecasts are not cyclone tracks—so HeatShield directs you to official agencies instead of guessing.</p>
            <p>Weather-based rainfall indicators do not confirm flooding without hydrological context. Cyclone tracks and lightning warnings require authoritative sources. Drought needs long-term baselines. Earthquakes cannot be predicted reliably by this platform; only official event information and preparedness would be appropriate.</p>
          </div>

          <div className="about-topic-block">
            <span className="section-label">5 · Open data &amp; licensing</span>
            <h2>Data and attribution</h2>
            <p className="about-plain-takeaway"><strong>In plain language:</strong> Weather and air forecasts come from Open-Meteo (CC BY 4.0) and refresh at most once every 10 minutes per city.</p>
            <p>Weather and air-quality model data are provided by <a href="https://open-meteo.com/" rel="external">Open-Meteo</a> under <a href="https://creativecommons.org/licenses/by/4.0/" rel="external">CC BY 4.0</a>. The <a href="https://open-meteo.com/en/docs/air-quality-api" rel="external">air-quality documentation</a> describes the available indices and pollutants. Responses are cached for ten minutes to limit repeated requests. Historical/reanalysis data and real chronological model training exist in repository workflows, but no trained production model is used by this public interface.</p>
          </div>
            </div>
          </details>
        </Card>

        <Card className="about-glossary-card">
          <div id="about-glossary" className="about-glossary-header">
            <div>
              <span className="section-label"><BookOpen size={13} aria-hidden="true" /> Part 4 · Reference dictionary</span>
              <h2>Plain-language &amp; technical glossary</h2>
              <p>Every technical term and acronym used across HeatShield AI ({glossaryEntries.length} terms), explained in everyday words alongside the exact technical definition.</p>
            </div>
            <button type="button" className="icon-text-button" onClick={toggleAllTerms} aria-expanded={allTermsOpen}>
              {allTermsOpen ? 'Collapse all terms' : 'Expand all terms'}
            </button>
          </div>
          <details className="glossary-drawer">
            <summary>Open the glossary ({glossaryEntries.length} terms)</summary>
          <div className="glossary-list">
            {glossaryEntries.map(([key, item]) => (
              <details
                key={key}
                className="glossary-item"
                open={Boolean(openTerms[key])}
                onToggle={(event) => {
                  const isOpen = (event.currentTarget as HTMLDetailsElement).open
                  setOpenTerms((prev) => (prev[key] === isOpen ? prev : { ...prev, [key]: isOpen }))
                }}
              >
                <summary>{item.term}</summary>
                <div className="glossary-item-body">
                  <p><strong>Plain language:</strong> {item.plain}</p>
                  <p><strong>Technical detail:</strong> {item.technical}</p>
                </div>
              </details>
            ))}
          </div>
          </details>
        </Card>
      </div>

      <aside className="about-side" aria-label="Get started">
        <Card className="community-card"><HeartHandshake size={28} aria-hidden="true" /><h2>Start with safety</h2><p>Preparedness guidance remains useful without AI, and official local instructions always take priority.</p><Link className="button button-primary" to="/safety">Read the Safety Guide <ArrowRight size={16} aria-hidden="true" /></Link></Card>
      </aside>
    </div>
  </div>
}
