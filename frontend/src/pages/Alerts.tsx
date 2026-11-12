import { BellOff, BellRing, Clock3, MailWarning, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useWeather } from '../context/WeatherContext'
import { getRegion } from '../data/regions'
import { alertIsExpired, buildAssessmentAlerts, type AssessmentAlert } from '../data/alerts'
import { notificationPermission, sendAssessmentNotifications } from '../data/notifications'
import { GLOSSARY_TERMS, IllustrativeExample, SectionIntro, TermHelp } from '../components/Comprehension'
import { Card, CardHeader, PageHeader, RiskBadge, StatusBadge, formatWeatherTime } from '../components/ui'
import { OfficialAlertsPanel } from '../components/OfficialAlertsPanel'
import { useOfficialAlerts } from '../hooks/useOfficialData'

function AlertCard({ alert, expired = false }: { alert: AssessmentAlert; expired?: boolean }) {
  return <article className={`card alert-card risk-${alert.level}`}>
    <div className="alert-card-header"><div><span className="section-label">{alert.timing === 'current' ? 'Current assessment' : 'Upcoming model signal'} · Not an official alert</span><h2>{alert.title}</h2><p>{alert.location} · {alert.hazard === 'heat' ? 'Heat' : 'Air pollution'}</p></div><RiskBadge level={alert.level} /></div>
    {expired && <span className="alert-expired">Expired assessment</span>}
    <div className="alert-reason"><h3>Why this notice exists</h3><p>{alert.reason}</p></div>
    <div className="alert-action"><h3>Recommended action</h3><p>{alert.action}</p></div>
    <dl className="alert-metadata"><div><dt>Source</dt><dd>{alert.source}</dd></div><div><dt>Assessment generated</dt><dd><time dateTime={alert.createdAt}>{formatWeatherTime(alert.createdAt)} IST</time></dd></div><div><dt>Model time</dt><dd><time dateTime={alert.modelTime}>{formatWeatherTime(alert.modelTime)} IST</time></dd></div><div><dt>Valid until</dt><dd><time dateTime={alert.validUntil}>{formatWeatherTime(alert.validUntil)} IST</time></dd></div></dl>
  </article>
}

export default function Alerts() {
  const { region } = useApp()
  const selected = getRegion(region)
  const { data: weather, airQuality, status, airStatus } = useWeather()
  const officialAlerts = useOfficialAlerts(region)
  const alerts = useMemo(() => buildAssessmentAlerts(weather, airQuality, selected.name), [weather, airQuality, selected.name])
  const active = alerts.filter((alert) => !alertIsExpired(alert))
  const expired = alerts.filter((alert) => alertIsExpired(alert))
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => notificationPermission())
  const [delivery, setDelivery] = useState('')

  useEffect(() => {
    if (permission !== 'granted') return
    const result = sendAssessmentNotifications(active)
    if (result.sent || result.failed) setDelivery(`${result.sent} new browser ${result.sent === 1 ? 'notification' : 'notifications'} sent. ${result.unchanged} unchanged ${result.unchanged === 1 ? 'notice' : 'notices'} skipped.${result.failed ? ` ${result.failed} delivery attempts failed.` : ''}`)
  }, [permission, active])

  const enableNotifications = async () => {
    if (notificationPermission() === 'unsupported') return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'denied') setDelivery('Browser notification permission was denied. Assessment notices remain available on this page.')
  }

  return <div className="page alerts-page">
    <PageHeader title="Alerts" description={`Official-warning coverage and generated environmental screening notices for ${selected.name}.`} actions={<StatusBadge status={officialAlerts.data?.freshness === 'stale' ? 'stale' : officialAlerts.data?.providerStatus === 'ok' ? 'official' : officialAlerts.status === 'loading' ? 'loading' : officialAlerts.status === 'error' ? 'unavailable' : 'offline'}>{officialAlerts.data?.providerStatus === 'ok' ? officialAlerts.data.freshness === 'stale' ? 'Stored official CAP' : 'SACHET CAP · official source' : officialAlerts.status === 'loading' ? 'Checking official CAP' : officialAlerts.status === 'error' ? 'Official CAP unavailable' : 'Official backend not configured'}</StatusBadge>} />

    <div className="two-track-explainer" aria-label="How the two alert sections differ">
      <div className="two-track-card official-track">
        <span className="section-label"><ShieldAlert size={14} aria-hidden="true" /> Track 1 · Official disaster alerts</span>
        <strong>Government CAP warnings (NDMA SACHET)</strong>
        <p>Issued by IMD, NDMA, and state authorities. Requires a connected backend server—or open <code>sachet.ndma.gov.in</code> directly below.</p>
      </div>
      <div className="two-track-card generated-track">
        <span className="section-label"><BellRing size={14} aria-hidden="true" /> Track 2 · Generated screening notices</span>
        <strong>Browser-calculated heat &amp; AQI reminders</strong>
        <p>Created automatically in your browser when Open-Meteo/CAMS reaches Watch, Warning, or Severe. Helpful for planning, never an official emergency alert.</p>
      </div>
    </div>

    <SectionIntro
      eyebrow="Track 1 · Authoritative bulletins"
      title="Authoritative disaster alert feed"
      summary="Always check official government warnings first during severe weather or emergencies."
      action={<TermHelp definition={GLOSSARY_TERMS.cap} label="What is SACHET CAP?" />}
    />
    <OfficialAlertsPanel state={officialAlerts} />

    <section className="assessment-alerts" aria-labelledby="assessment-alerts-title">
      <div className="section-heading"><div><span className="section-label">Track 2 · Deterministic, source-aware</span><h2 id="assessment-alerts-title">Generated assessment notices</h2><p>Watch, Warning, and Severe heat/AQI assessments. These are not official government alerts.</p></div><span className="alert-count">{active.length} active</span></div>
      {(status === 'loading' || airStatus === 'loading') && <p role="status">Environmental data is still loading; the notice set may be incomplete.</p>}
      {active.length > 0 ? <div className="alert-list">{active.map((alert) => <AlertCard key={alert.id} alert={alert} />)}</div> : <div className="empty-alert-state"><Clock3 size={24} aria-hidden="true" /><h3>No active generated notices</h3><p>No unexpired Watch/Warning/Severe heat or modelled-AQI notice is currently available. This is not an all-clear: missing data, official warnings, and unassessed hazards remain separate.</p></div>}
      {expired.length > 0 && <details className="expired-alerts"><summary>Show {expired.length} expired assessment {expired.length === 1 ? 'notice' : 'notices'}</summary><div className="alert-list">{expired.map((alert) => <AlertCard key={alert.id} alert={alert} expired />)}</div></details>}
    </section>

    <details className="card decoder-drawer alerts-delivery-drawer">
      <summary>Optional delivery: browser notifications, email &amp; SMS (not configured)</summary>
      <div className="decoder-drawer-body">
        <SectionIntro
          eyebrow="Optional delivery settings"
          title="How notices can reach you"
          summary="Choose optional local browser popups while this tab is open. HeatShield does not claim background push, SMS, or email delivery."
        />
        <div className="alert-tools-grid">
          <Card>
            <CardHeader title="Browser notifications" subtitle="For changed heat/AQI screening notices while using this app" icon={<BellRing size={22} aria-hidden="true" />} />
            {permission === 'unsupported' ? <p>This browser does not support the Notification API. On-page notices remain available.</p> : <>
              <p>Permission: <strong>{permission}</strong> ({permission === 'default' ? 'not yet requested' : permission === 'granted' ? 'enabled for this browser' : 'blocked in browser settings'}). Notifications are optional, local to this browser, and are not an emergency-alert service.</p>
              {permission === 'denied' ? <p>Enable notifications in your browser site settings if you want this optional delivery.</p> : <button type="button" className="button button-secondary" onClick={enableNotifications}>{permission === 'granted' ? 'Check notification permission' : 'Enable assessment notifications'}</button>}
            </>}
            {delivery && <p className="notification-result" role="status">{delivery}</p>}
            <small>No background push service is deployed. Unchanged conditions are deduplicated by location, hazard, timing, level, and reason.</small>
          </Card>
          <Card>
            <CardHeader title="Email and other delivery" subtitle="Not configured" icon={<MailWarning size={22} aria-hidden="true" />} />
            <p>No email/SMS credentials or delivery backend are configured. No subscription form is shown and no delivery success is claimed.</p>
            <p><BellOff size={16} aria-hidden="true" /> Official government alerting channels remain separate.</p>
          </Card>
        </div>
      </div>
    </details>

    <details className="card decoder-drawer alerts-how-drawer">
      <summary>How notice validity, expiry, and anti-spam deduplication work</summary>
      <div className="decoder-drawer-body">
        <div className="decoder-pillars">
          <div><strong>When notices appear:</strong> Only Moderate (<em>Watch</em>), High (<em>Warning</em>), and Extreme (<em>Severe</em>) heat or AQI assessments create a notice; Low (<em>Safe</em>) conditions stay quiet.</div>
          <div><strong>No duplicate popups:</strong> Each notice stores a local fingerprint (city + hazard + timing + level + reason) in your browser so reloading the page does not re-send identical notifications.</div>
          <div><strong>Automatic expiry:</strong> A current notice is valid for 60 minutes from the moment its model data was retrieved; an upcoming notice carries the expiry of its own model signal or forecast day. Expired notices move into the collapsed list above instead of disappearing.</div>
          <div><strong>What is stored:</strong> Only a fingerprint per notice (city, hazard, timing, level, reason) plus its expiry, in this browser. There is no server-side alert log, delivery receipt, or incident history.</div>
        </div>
        <IllustrativeExample title="Deduplication when refreshing the page">
          If Mumbai has a <strong>Heat Warning screening</strong> at 14:00 IST and you revisit Alerts at 14:15 IST with the same cached model values, HeatShield skips sending a duplicate popup and only notifies you again if the severity, city, or explanation changes.
        </IllustrativeExample>
      </div>
    </details>

  </div>
}
