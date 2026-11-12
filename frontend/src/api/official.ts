import type { Region, SimpleRiskLevel } from '../types'

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? ''
export const OFFICIAL_API_CONFIGURED = baseUrl.length > 0
const REQUEST_TIMEOUT_MS = 20000

export class OfficialApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message)
    this.name = 'OfficialApiError'
  }
}

export interface OfficialAlertItem {
  identifier: string
  sender: string
  senderName: string | null
  sent: string | null
  status: string
  msgType: string
  scope: string
  language: string | null
  category: string | null
  event: string | null
  urgency: string | null
  severity: string | null
  certainty: string | null
  level: SimpleRiskLevel | null
  effective: string | null
  onset: string | null
  expires: string | null
  headline: string | null
  description: string | null
  instruction: string | null
  areas: string[]
  matchType: string
  matchedArea: string | null
  matchExplanation: string
  sourceUrl: string
  retrievedAt: string
  isOfficial: true
}

export interface OfficialAlertsData {
  region: string
  location: Region
  source: string
  evidenceType: 'official-warning'
  providerStatus: 'ok' | 'unavailable'
  freshness: 'current' | 'stale'
  retrievalComplete: boolean
  retrievedAt: string
  checkedAt: string
  activeMessagesEvaluated: number
  failedCount: number
  invalidCount: number
  unresolvedAreaCount: number
  validityIncompleteCount: number
  count: number
  alerts: OfficialAlertItem[]
  message: string | null
  limitations: string
  attribution: string
  portalUrl: string
  feedUrl: string
  integrationGuideUrl: string
}

export interface CPCBPollutant {
  pollutantId: string
  minimum: number | null
  maximum: number | null
  average: number | null
  unit: string | null
}

export interface CPCBObservation {
  station: string
  country: string
  state: string
  city: string
  observedAt: string
  retrievedAt: string
  aqi: number | null
  aqiCategory: string | null
  aqiStandard: 'Indian CPCB AQI' | null
  screeningLevel: SimpleRiskLevel | null
  pollutants: Record<string, CPCBPollutant>
  source: string
  evidenceType: 'station-observation'
}

export interface OfficialAirQualityData {
  region: string
  location: Region
  source: string
  evidenceType: 'station-observation'
  freshness: 'current' | 'stale'
  providerStatus: 'ok' | 'unavailable'
  retrievedAt: string
  latestObservationAt: string | null
  recordsRead: number
  invalidRecords: number
  count: number
  observations: CPCBObservation[]
  message: string | null
  attribution: string
  resourceUrl: string
  licenseUrl: string
  aqiMethod: string
}

export interface OfficialAirQualityBundle {
  current: OfficialAirQualityData
  history: CPCBObservation[]
  historyWarning: string | null
}

type JsonObject = Record<string, unknown>

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OfficialApiError(`${label} was not an object.`)
  return value as JsonObject
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new OfficialApiError(`${label} was missing or invalid.`)
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const parsed = text(value, 'Timestamp')
  if (!Number.isFinite(Date.parse(parsed))) throw new OfficialApiError('The backend returned an invalid timestamp.')
  return parsed
}

function date(value: unknown, label: string): string {
  return optionalDate(value) ?? (() => { throw new OfficialApiError(`${label} was missing.`) })()
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new OfficialApiError(`${label} was not numeric.`)
  return value
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value, 'Reading')
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new OfficialApiError(`${label} was not boolean.`)
  return value
}

function freshness(value: unknown): 'current' | 'stale' {
  if (value === 'current' || value === 'stale') return value
  throw new OfficialApiError('The backend returned an invalid freshness state.')
}

function providerStatus(value: unknown): 'ok' | 'unavailable' {
  if (value === 'ok' || value === 'unavailable') return value
  throw new OfficialApiError('The backend returned an invalid provider state.')
}

function evidenceType<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) throw new OfficialApiError(`The backend evidence type was not ${expected}.`)
  return expected
}

function httpsUrl(value: unknown, label: string): string {
  const parsed = text(value, label)
  try {
    const url = new URL(parsed)
    if (url.protocol !== 'https:') throw new Error('HTTPS required')
    return url.toString()
  } catch {
    throw new OfficialApiError(`${label} was not a valid HTTPS URL.`)
  }
}

function level(value: unknown): SimpleRiskLevel | null {
  if (value === null || value === undefined) return null
  if (value === 'low' || value === 'moderate' || value === 'high' || value === 'extreme') return value
  throw new OfficialApiError('The backend returned an invalid screening level.')
}

function region(value: unknown): Region {
  const item = object(value, 'Location')
  return {
    slug: text(item.slug, 'Location slug'), name: text(item.name, 'Location name'), state: text(item.state, 'Location state'),
    latitude: number(item.latitude, 'Latitude'), longitude: number(item.longitude, 'Longitude'),
  }
}

async function request(path: string): Promise<unknown> {
  if (!OFFICIAL_API_CONFIGURED) throw new OfficialApiError('Python backend URL is not configured.', 'OFFICIAL_API_NOT_CONFIGURED')
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } })
    const payload = await response.json().catch(() => null) as unknown
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? payload as JsonObject : {}
      throw new OfficialApiError(nullableText(error.detail) ?? `The Python backend returned HTTP ${response.status}.`, nullableText(error.code) ?? undefined, response.status)
    }
    return payload
  } catch (error) {
    if (error instanceof OfficialApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new OfficialApiError('The Python backend took too long to respond.')
    throw new OfficialApiError('The Python backend could not be reached. No official-data substitute is shown.')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function alertItem(value: unknown): OfficialAlertItem {
  const item = object(value, 'Official alert')
  if (item.is_official !== true) throw new OfficialApiError('An alert was not marked as official by the backend.')
  return {
    identifier: text(item.identifier, 'CAP identifier'), sender: text(item.sender, 'CAP sender'), senderName: nullableText(item.sender_name),
    sent: optionalDate(item.sent), status: text(item.status, 'CAP status'), msgType: text(item.msg_type, 'CAP message type'), scope: text(item.scope, 'CAP scope'),
    language: nullableText(item.language), category: nullableText(item.category), event: nullableText(item.event), urgency: nullableText(item.urgency),
    severity: nullableText(item.severity), certainty: nullableText(item.certainty), level: level(item.level),
    effective: optionalDate(item.effective), onset: optionalDate(item.onset), expires: optionalDate(item.expires),
    headline: nullableText(item.headline), description: nullableText(item.description), instruction: nullableText(item.instruction),
    areas: Array.isArray(item.areas) ? item.areas.map((area) => text(area, 'CAP area')) : (() => { throw new OfficialApiError('CAP areas were invalid.') })(),
    matchType: text(item.match_type, 'Area match type'), matchedArea: nullableText(item.matched_area), matchExplanation: text(item.match_explanation, 'Area match explanation'),
    sourceUrl: httpsUrl(item.source_url, 'CAP source URL'), retrievedAt: date(item.retrieved_at, 'CAP retrieval time'), isOfficial: true,
  }
}

function observation(value: unknown): CPCBObservation {
  const item = object(value, 'CPCB station observation')
  const rawPollutants = object(item.pollutants, 'Station pollutants')
  if (item.aqi_standard !== null && item.aqi_standard !== undefined && item.aqi_standard !== 'Indian CPCB AQI') {
    throw new OfficialApiError('The backend returned an unknown station AQI standard.')
  }
  const pollutants = Object.fromEntries(Object.entries(rawPollutants).map(([key, value]) => {
    const pollutant = object(value, `Pollutant ${key}`)
    return [key, {
      pollutantId: text(pollutant.pollutant_id, 'Pollutant identifier'), minimum: nullableNumber(pollutant.minimum),
      maximum: nullableNumber(pollutant.maximum), average: nullableNumber(pollutant.average), unit: nullableText(pollutant.unit),
    }]
  }))
  return {
    station: text(item.station, 'Station name'), country: text(item.country, 'Station country'), state: text(item.state, 'Station state'), city: text(item.city, 'Station city'),
    observedAt: date(item.observed_at, 'Station observation time'), retrievedAt: date(item.retrieved_at, 'Station retrieval time'),
    aqi: nullableNumber(item.aqi), aqiCategory: nullableText(item.aqi_category),
    aqiStandard: item.aqi_standard === 'Indian CPCB AQI' ? 'Indian CPCB AQI' : null,
    screeningLevel: level(item.screening_level), pollutants, source: text(item.source, 'Station source'), evidenceType: evidenceType(item.evidence_type, 'station-observation'),
  }
}

function airQuality(value: unknown): OfficialAirQualityData {
  const item = object(value, 'CPCB response')
  return {
    region: text(item.region, 'CPCB region'), location: region(item.location), source: text(item.source, 'CPCB source'), evidenceType: evidenceType(item.evidence_type, 'station-observation'),
    freshness: freshness(item.freshness), providerStatus: providerStatus(item.provider_status),
    retrievedAt: date(item.retrieved_at, 'CPCB retrieval time'), latestObservationAt: optionalDate(item.latest_observation_at),
    recordsRead: number(item.records_read, 'Records read'), invalidRecords: number(item.invalid_records, 'Invalid records'),
    count: number(item.count, 'Station count'), observations: Array.isArray(item.observations) ? item.observations.map(observation) : (() => { throw new OfficialApiError('Station observations were invalid.') })(),
    message: nullableText(item.message), attribution: text(item.attribution, 'CPCB attribution'), resourceUrl: httpsUrl(item.resource_url, 'CPCB resource URL'),
    licenseUrl: httpsUrl(item.license_url, 'CPCB license URL'), aqiMethod: text(item.aqi_method, 'CPCB AQI method'),
  }
}

export async function getOfficialAlerts(slug: string): Promise<OfficialAlertsData> {
  const item = object(await request(`/api/v1/official/alerts/${encodeURIComponent(slug)}`), 'Official-alert response')
  return {
    region: text(item.region, 'Alert region'), location: region(item.location), source: text(item.source, 'Alert source'), evidenceType: evidenceType(item.evidence_type, 'official-warning'),
    providerStatus: providerStatus(item.provider_status), freshness: freshness(item.freshness),
    retrievalComplete: bool(item.retrieval_complete, 'Retrieval completeness'), retrievedAt: date(item.retrieved_at, 'Feed retrieval time'), checkedAt: date(item.checked_at, 'Feed check time'),
    activeMessagesEvaluated: number(item.active_messages_evaluated, 'Active message count'), failedCount: number(item.failed_count, 'Failed CAP count'), invalidCount: number(item.invalid_count, 'Invalid CAP count'),
    unresolvedAreaCount: number(item.unresolved_area_count, 'Unresolved area count'), validityIncompleteCount: number(item.validity_incomplete_count, 'Incomplete validity count'),
    count: number(item.count, 'Alert count'), alerts: Array.isArray(item.alerts) ? item.alerts.map(alertItem) : (() => { throw new OfficialApiError('Official alerts were invalid.') })(),
    message: nullableText(item.message), limitations: text(item.limitations, 'Alert limitations'), attribution: text(item.attribution, 'Alert attribution'),
    portalUrl: httpsUrl(item.portal_url, 'SACHET portal URL'), feedUrl: httpsUrl(item.feed_url, 'SACHET feed URL'), integrationGuideUrl: httpsUrl(item.integration_guide_url, 'SACHET guide URL'),
  }
}

export async function getOfficialAirQuality(slug: string): Promise<OfficialAirQualityData> {
  return airQuality(await request(`/api/v1/official/air-quality/current/${encodeURIComponent(slug)}`))
}

export async function getOfficialAirQualityBundle(slug: string): Promise<OfficialAirQualityBundle> {
  const [currentResult, historyResult] = await Promise.allSettled([
    getOfficialAirQuality(slug),
    request(`/api/v1/official/air-quality/history/${encodeURIComponent(slug)}?limit=500`),
  ])
  if (currentResult.status === 'rejected') throw currentResult.reason
  let history: CPCBObservation[] = []
  let historyWarning: string | null = null
  if (historyResult.status === 'fulfilled') {
    const payload = object(historyResult.value, 'CPCB history')
    if (!Array.isArray(payload.items)) throw new OfficialApiError('CPCB history items were invalid.')
    history = payload.items.map(observation)
  } else {
    historyWarning = 'Stored station history is unavailable; current station observations are still shown.'
  }
  return { current: currentResult.value, history, historyWarning }
}
