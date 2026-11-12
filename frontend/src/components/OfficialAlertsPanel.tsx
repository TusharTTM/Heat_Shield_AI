import { ArrowUpRight, BellRing, ExternalLink, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { OfficialAlertItem, OfficialAlertsData } from '../api/official'
import type { OfficialSourceState } from '../hooks/useOfficialData'
import { GLOSSARY_TERMS, TermHelp } from './Comprehension'
import { Card, CardHeader, formatWeatherTime, InlineNotice, RiskBadge, StatusBadge } from './ui'

function OfficialAlertCard({ alert }: { alert: OfficialAlertItem }) {
  return <article className={`card official-cap-alert risk-${alert.level ?? 'unavailable'}`}>
    <div className="official-cap-heading"><div><span className="section-label">Official CAP {alert.msgType} · {alert.status}/{alert.scope}</span><h3>{alert.headline ?? alert.event}</h3><p>{alert.event} · {alert.senderName ?? alert.sender}</p></div>
      {alert.level ? <RiskBadge level={alert.level} /> : <StatusBadge status="offline">{alert.severity ? `CAP ${alert.severity}` : 'Severity unavailable'}</StatusBadge>}
    </div>
    <dl className="official-cap-facts"><div><dt>CAP severity</dt><dd>{alert.severity ?? 'Not supplied'}</dd></div><div><dt>Urgency / certainty</dt><dd>{alert.urgency ?? 'Not supplied'} / {alert.certainty ?? 'Not supplied'}</dd></div><div><dt>Affected area</dt><dd>{alert.areas.join(' · ') || 'Area text not supplied'}</dd></div><div><dt>Issuing authority</dt><dd>{alert.sender}</dd></div></dl>
    {alert.description && <p className="official-cap-description">{alert.description}</p>}
    <div className="official-cap-instruction"><strong>Instructions in the CAP message</strong><p>{alert.instruction ?? 'No instruction was included in this CAP information block. Follow the issuing authority and local disaster-management guidance.'}</p></div>
    <dl className="official-cap-times"><div><dt>Issued</dt><dd>{alert.sent ? <time dateTime={alert.sent}>{formatWeatherTime(alert.sent)} IST</time> : 'Not supplied'}</dd></div><div><dt>Effective / onset</dt><dd>{alert.onset ?? alert.effective ? <time dateTime={alert.onset ?? alert.effective ?? undefined}>{formatWeatherTime(alert.onset ?? alert.effective ?? '')} IST</time> : 'Not supplied'}</dd></div><div><dt>Expires</dt><dd>{alert.expires ? <time dateTime={alert.expires}>{formatWeatherTime(alert.expires)} IST</time> : 'Not supplied'}</dd></div></dl>
    <p className="official-match-note"><strong>Location match:</strong> {alert.matchExplanation}{alert.matchedArea ? ` Matched area: ${alert.matchedArea}.` : ''}</p>
    <div className="official-card-links"><a href={alert.sourceUrl} rel="external">Original CAP XML <ArrowUpRight size={14} aria-hidden="true" /></a><span>CAP retrieved {formatWeatherTime(alert.retrievedAt)} IST</span></div>
  </article>
}

export function OfficialAlertsPanel({ state, compact = false }: { state: OfficialSourceState<OfficialAlertsData>; compact?: boolean }) {
  const data = state.data
  return <Card className="official-warning-card official-cap-panel">
    <CardHeader title="Official government warnings" subtitle="NDMA SACHET CAP, kept separate from model screening" icon={<ShieldAlert size={22} aria-hidden="true" />} action={<TermHelp definition={GLOSSARY_TERMS.cap} label="What is CAP?" />} />
    {state.status === 'unconfigured' && <div className="official-warning-empty">
      <strong>Official CAP backend not configured</strong>
      <p className="official-warning-lead"><strong>An empty panel here never means your area has no warnings.</strong> Check India’s official portal directly.</p>
      <a className="button button-secondary" href="https://sachet.ndma.gov.in/" rel="external">Open NDMA SACHET <ExternalLink size={15} aria-hidden="true" /></a>
      <details className="official-why-drawer">
        <summary>Why official warnings are unavailable here, and what would fix it</summary>
        <div className="plain-language-callout"><strong>For visitors:</strong> Live government disaster alerts require a backend server and cannot run directly inside this static website.</div>
        <p className="operator-detail-note"><span className="operator-detail-tag">Technical &amp; self-hosting detail:</span> GitHub Pages cannot run the Python CAP client. Configure <code>VITE_API_BASE_URL</code> to a deployed FastAPI backend to retrieve SACHET alerts. This does <strong>not</strong> mean there are no warnings.</p>
      </details>
    </div>}
    {state.status === 'loading' && <p className="official-loading" role="status"><BellRing size={19} aria-hidden="true" />Retrieving and validating official CAP messages…</p>}
    {state.status === 'error' && <div className="official-warning-empty" role="alert"><strong>Official CAP feed unavailable</strong><p>{state.error}</p><p>No generated assessment is relabelled as an official warning, and no substitute alert is shown. Check SACHET directly.</p><div className="official-card-links"><a className="button button-secondary" href="https://sachet.ndma.gov.in/" rel="external">Open NDMA SACHET</a><button type="button" className="button button-secondary" onClick={state.refresh}>Retry official feed</button></div></div>}
    {state.status === 'ready' && data && <>
      {data.freshness === 'stale' && <InlineNotice kind="warning" title="Stored official CAP data">Live refresh is unavailable or incomplete. Alerts remain visible only until their own CAP expiry.</InlineNotice>}
      {!data.retrievalComplete && <InlineNotice kind="warning" title="Official-alert retrieval is incomplete">{data.failedCount} failed/skipped and {data.invalidCount} invalid CAP documents; {data.validityIncompleteCount} alerts have incomplete validity fields. Missing matches are not an all-clear.</InlineNotice>}
      {data.unresolvedAreaCount > 0 && <InlineNotice kind="warning" title="Area matching is incomplete">{data.unresolvedAreaCount} active {data.unresolvedAreaCount === 1 ? 'message has' : 'messages have'} no area description or embedded polygon. They cannot support a precise location match; absence from the list is not an all-clear.</InlineNotice>}
      {data.message && <p className="official-warning-message">{data.message}</p>}
      <div className="official-alert-summary"><span><strong>{data.count}</strong> verified active area {data.count === 1 ? 'match' : 'matches'}</span><span>{data.activeMessagesEvaluated} active messages evaluated · {data.unresolvedAreaCount} without area/polygon · Feed checked <time dateTime={data.checkedAt}>{formatWeatherTime(data.checkedAt)} IST</time></span></div>
      {data.alerts.length > 0 && <div className="official-cap-list">{(compact ? data.alerts.slice(0, 3) : data.alerts).map((alert) => <OfficialAlertCard key={`${alert.sender}:${alert.identifier}`} alert={alert} />)}</div>}
      {compact && data.count > 3 && <Link to="/alerts" className="text-link">View all {data.count} official matches <ArrowUpRight size={14} aria-hidden="true" /></Link>}
      <details className="official-limitations"><summary>Matching, provenance and reliability</summary><p>{data.limitations}</p><p>{data.attribution}</p><p>Feed retrieved <time dateTime={data.retrievedAt}>{formatWeatherTime(data.retrievedAt)} IST</time>; checked <time dateTime={data.checkedAt}>{formatWeatherTime(data.checkedAt)} IST</time>.</p><div className="official-card-links"><a href={data.feedUrl} rel="external">Official RSS discovery feed</a><a href={data.integrationGuideUrl} rel="external">NDMA integration guide</a><a href={data.portalUrl} rel="external">SACHET portal</a></div></details>
    </>}
  </Card>
}
