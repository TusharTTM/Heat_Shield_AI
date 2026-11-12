import { useEffect } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Popup, useMap } from 'react-leaflet'
import { LatLngBounds, type LatLngExpression } from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import { getSimpleRisk } from '../data/heat'
import { assessAirQuality } from '../data/hazards'
import { regions } from '../data/regions'
import { useApp } from '../context/AppContext'
import { formatWeatherTime, RiskBadge } from './ui'
import indiaOutline from '../data/india-outline.json'
import type { AirQualityResult, CurrentWeatherResult, SimpleRiskLevel } from '../types'

const riskColors: Record<SimpleRiskLevel, string> = { low: '#2f8a62', moderate: '#d99a2b', high: '#df742b', extreme: '#c93f45' }
const center: LatLngExpression = [22.5, 79.5]
const configuredBounds = new LatLngBounds(regions.map((region) => [region.latitude, region.longitude] as LatLngExpression))
const outline = indiaOutline as unknown as GeoJsonObject

function MapView() {
  const map = useMap()
  const { reducedMotion } = useApp()
  useEffect(() => {
    map.fitBounds(configuredBounds, { padding: [24, 24], animate: !reducedMotion, duration: 0.2, maxZoom: 5 })
  }, [map, reducedMotion])
  return null
}

interface MapMarker {
  slug: string
  name: string
  latitude: number
  longitude: number
  risk: SimpleRiskLevel
  primary: string
  secondary: string
  source: string
  modelTime: string
  freshness: 'current' | 'stale'
}

export function RegionMap({ locations, airLocations = [], layer = 'heat' }: { locations: CurrentWeatherResult[]; airLocations?: AirQualityResult[]; layer?: 'heat' | 'air-quality' }) {
  const { region, setRegion } = useApp()
  const heatMarkers: MapMarker[] = locations.map((result) => {
    const item = result.data
    return {
      ...item, risk: getSimpleRisk(item.risk), primary: `${item.temperature.toFixed(1)}°C · Feels like ${item.apparentTemperature.toFixed(1)}°C`,
      secondary: `${item.heatIndex.toFixed(1)}°C calculated heat index`, source: 'Open-Meteo weather model · not a physical sensor',
      modelTime: item.observedAt, freshness: result.freshness,
    }
  })
  const airMarkers: MapMarker[] = airLocations.flatMap((result) => {
    const item = result.data
    const assessment = assessAirQuality(item)
    if (!assessment) return []
    return [{
      ...item, risk: assessment.level, primary: assessment.summary,
      secondary: `PM2.5 ${item.pm2_5 === null ? 'unavailable' : `${item.pm2_5.toFixed(1)} µg/m³`}`,
      source: 'Open-Meteo/CAMS US + European AQI model · not a CPCB station', modelTime: item.modelTime, freshness: result.freshness,
    }]
  })
  const markers = layer === 'heat' ? heatMarkers : airMarkers
  return <div className="map-shell" role="region" aria-label={`Interactive ${layer === 'heat' ? 'weather-model heat-risk' : 'CAMS modelled air-quality'} map`}>
    <MapContainer center={center} zoom={4} minZoom={3} maxZoom={9} scrollWheelZoom={false} doubleClickZoom={false} className="offline-map" attributionControl={false}>
      <MapView />
      <GeoJSON data={outline} interactive={false} style={{ color: '#9aa8b0', weight: 1.4, fillColor: '#edf1f2', fillOpacity: 1 }} />
      {markers.map((item) => <CircleMarker
        key={`${layer}:${item.slug}`} center={[item.latitude, item.longitude]} radius={item.slug === region ? 11 : 8}
        pathOptions={{ color: '#ffffff', weight: item.slug === region ? 3 : 2, fillColor: riskColors[item.risk], fillOpacity: 0.96 }}
        eventHandlers={{ click: () => setRegion(item.slug) }}
      >
        <Popup keepInView autoPan autoPanPadding={[24, 24]}><div className="map-popup"><strong>{item.name}</strong><span>{item.primary}</span><span>{item.secondary}</span><RiskBadge level={item.risk} /><small>{item.freshness === 'stale' ? 'Stale cached ' : ''}{item.source}</small><small>Model time: <time dateTime={item.modelTime}>{formatWeatherTime(item.modelTime)} IST</time></small></div></Popup>
      </CircleMarker>)}
    </MapContainer>
    <div className="map-offline-label"><span className="status-dot" aria-hidden="true" />Static outline · {layer === 'heat' ? 'Weather-model' : 'CAMS air-quality-model'} markers</div>
  </div>
}
