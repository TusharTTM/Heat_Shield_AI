export const officialLocation = { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777, elevation_m: 14, coastal: true }

export const stationObservation = {
  station: 'Bandra, Mumbai - MPCB', country: 'India', state: 'Maharashtra', city: 'Mumbai',
  observed_at: '2026-11-08T08:30:00Z', retrieved_at: '2026-11-08T09:00:00Z',
  aqi: 175 as number | null, aqi_category: 'Moderate' as string | null, aqi_standard: 'Indian CPCB AQI' as string | null, screening_level: 'moderate' as string | null,
  pollutants: { 'PM2.5': { pollutant_id: 'PM2.5', minimum: 40.1, maximum: 50.2, average: 45.2, unit: 'µg/m³' } },
  source: 'Central Pollution Control Board via Open Government Data Platform India', evidence_type: 'station-observation',
}

export function officialAlertsPayload() {
  return {
    region: 'mumbai', location: officialLocation, source: 'NDMA SACHET Common Alerting Protocol', evidence_type: 'official-warning',
    provider_status: 'ok', freshness: 'current', retrieval_complete: true,
    retrieved_at: '2026-11-08T09:00:00Z', checked_at: '2026-11-08T09:01:00Z', active_messages_evaluated: 1,
    failed_count: 0, invalid_count: 0, unresolved_area_count: 0, validity_incomplete_count: 0, count: 1,
    alerts: [{
      identifier: 'cap-test-1', sender: 'imd@example.gov.in', sender_name: 'India Meteorological Department', sent: '2026-11-08T08:45:00Z',
      status: 'Actual', msg_type: 'Alert', scope: 'Public', language: 'en-IN', category: 'Met', event: 'Heavy Rainfall',
      urgency: 'Expected', severity: 'Severe', certainty: 'Likely', level: 'high', effective: '2026-11-08T08:45:00Z', onset: '2026-11-08T10:00:00Z', expires: '2026-11-09T10:00:00Z',
      headline: 'Heavy rainfall warning for Mumbai', description: 'Official CAP description.', instruction: 'Follow local authority instructions.', areas: ['Mumbai, Maharashtra'],
      match_type: 'area-text', matched_area: 'Mumbai, Maharashtra', match_explanation: 'The official CAP area explicitly names Mumbai and Maharashtra.',
      source_url: 'https://sachet.ndma.gov.in/FetchXMLFile?identifier=cap-test-1', retrieved_at: '2026-11-08T09:00:00Z', is_official: true,
    }],
    message: null, limitations: 'No match is not an all-clear.', attribution: 'NDMA SACHET and the issuing agency.',
    portal_url: 'https://sachet.ndma.gov.in/', feed_url: 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml', integration_guide_url: 'https://sachet.ndma.gov.in/docs/Integration_Guide_For_Agencies.pdf',
  }
}

export function currentOfficialAirPayload() {
  return {
    region: 'mumbai', location: officialLocation, source: stationObservation.source, evidence_type: 'station-observation', freshness: 'current', provider_status: 'ok',
    retrieved_at: '2026-11-08T09:00:00Z', latest_observation_at: '2026-11-08T08:30:00Z', records_read: 2, invalid_records: 0, count: 1,
    observations: [stationObservation], message: null, attribution: 'CPCB and OGD attribution.',
    resource_url: 'https://www.data.gov.in/catalog/real-time-air-quality-index', license_url: 'https://data.gov.in/godl', aqi_method: 'No AQI is calculated from pollutant averages.',
  }
}

export function officialJsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
