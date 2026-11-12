import type { AirQualityData, SimpleRiskLevel, WeatherData } from '../types'
import { assessAirQuality, assessHeat, OFFICIAL_ALERT_WORDING, SCREENING_LABELS, upcomingHazards } from './hazards'

export interface AssessmentAlert {
  id: string
  fingerprint: string
  hazard: 'heat' | 'air-quality'
  location: string
  level: SimpleRiskLevel
  title: string
  reason: string
  action: string
  source: string
  createdAt: string
  modelTime: string
  validUntil: string
  timing: 'current' | 'upcoming'
  official: false
}

// Reuse the one screening vocabulary rather than redeclaring it.
const statusLabels = SCREENING_LABELS
const ranks: Record<SimpleRiskLevel, number> = { low: 0, moderate: 1, high: 2, extreme: 3 }

function currentAlert(
  assessment: ReturnType<typeof assessHeat> | NonNullable<ReturnType<typeof assessAirQuality>>, location: string,
): AssessmentAlert | null {
  if (assessment.level === 'low') return null
  const createdAt = assessment.retrievedAt
  const validUntil = new Date(Date.parse(createdAt) + 60 * 60 * 1000).toISOString()
  return {
    id: `current:${location}:${assessment.id}`, fingerprint: `${location}:${assessment.id}:current:${assessment.level}:${assessment.explanation}`,
    hazard: assessment.id, location, level: assessment.level,
    // The band leads; the notice word rides along in the body, never as a substitute.
    title: `${assessment.id === 'heat' ? 'Heat' : 'Air quality'} ${statusLabels[assessment.level]} screening${OFFICIAL_ALERT_WORDING[assessment.level] ? ` · ${OFFICIAL_ALERT_WORDING[assessment.level]}` : ''}`,
    reason: assessment.explanation, action: assessment.recommendation, source: assessment.source,
    createdAt, modelTime: assessment.modelTime, validUntil, timing: 'current', official: false,
  }
}

/** Generated from real model inputs. These are not government alerts or a server-side alert history. */
export function buildAssessmentAlerts(weather: WeatherData | null, air: AirQualityData | null, location: string): AssessmentAlert[] {
  const airAssessment = air ? assessAirQuality(air) : null
  const current = [
    weather ? currentAlert(assessHeat(weather), location) : null,
    airAssessment ? currentAlert(airAssessment, location) : null,
  ].filter((item): item is AssessmentAlert => item !== null)
  const upcoming = upcomingHazards(weather, air).map((hazard): AssessmentAlert => ({
    id: `upcoming:${location}:${hazard.id}`, fingerprint: `${location}:${hazard.id}:upcoming:${hazard.level}:${hazard.detail}`,
    hazard: hazard.id, location, level: hazard.level,
    title: `Upcoming ${hazard.id === 'heat' ? 'heat' : 'air-quality'} ${statusLabels[hazard.level].toLowerCase()} signal`,
    reason: hazard.detail, action: hazard.recommendation, source: hazard.source,
    createdAt: weather && hazard.id === 'heat' ? weather.retrievedAt : air?.retrievedAt ?? weather?.retrievedAt ?? hazard.modelTime,
    modelTime: hazard.modelTime, validUntil: hazard.validUntil, timing: 'upcoming', official: false,
  }))
  return [...current, ...upcoming].sort((a, b) => ranks[b.level] - ranks[a.level] || Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function alertIsExpired(alert: AssessmentAlert, now = Date.now()): boolean {
  const expiry = Date.parse(alert.validUntil)
  return !Number.isFinite(expiry) || expiry <= now
}
