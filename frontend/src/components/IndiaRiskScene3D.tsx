import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Compass, Layers, LoaderCircle, Maximize2, Minus, Plus, RefreshCw, RotateCcw, RotateCw, ThermometerSun, Wind } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { assessAirQuality } from '../data/hazards'
import { getSimpleRisk } from '../data/heat'
import indiaOutline from '../data/india-outline.json'
import { getRegion, regions } from '../data/regions'
import { useWeatherMap } from '../hooks/useWeatherMap'
import type { AirQualityData, CurrentWeather, SimpleRiskLevel } from '../types'
import { formatWeatherTime, RiskBadge, StatusBadge } from './ui'

export type RiskSceneLayer = 'heat' | 'air-quality'

interface SceneCityPoint {
  slug: string
  name: string
  state: string
  latitude: number
  longitude: number
  wx: number
  wz: number
  level: SimpleRiskLevel | null
  height: number
  metricPrimary: string
  metricSecondary: string
  freshness: 'current' | 'stale' | 'unavailable'
  modelTime: string | null
  weather: CurrentWeather | null
  air: AirQualityData | null
}

interface ProjectedPoint {
  x: number
  y: number
  z: number
  scale: number
}

interface HitTarget {
  slug: string
  topX: number
  topY: number
  baseX: number
  baseY: number
  radius: number
}

const CENTER_LON = 79.5
const CENTER_LAT = 21.6
const COS_LAT = Math.cos((CENTER_LAT * Math.PI) / 180)
const GEO_SCALE = 0.068
const DEFAULT_YAW = -16
const DEFAULT_PITCH = 48
const DEFAULT_ZOOM = 1.06

const outlineCoords: [number, number][] = indiaOutline.geometry.coordinates[0].map(
  (pair) => [pair[0] ?? 0, pair[1] ?? 0],
)

const riskFill: Record<SimpleRiskLevel, { top: string; side: string; glow: string }> = {
  low: { top: '#2f8a62', side: '#1f6445', glow: 'rgba(47, 138, 98, 0.24)' },
  moderate: { top: '#d99a2b', side: '#a36f14', glow: 'rgba(217, 154, 43, 0.26)' },
  high: { top: '#cf5d28', side: '#983e16', glow: 'rgba(207, 93, 40, 0.28)' },
  extreme: { top: '#c93f45', side: '#8f262b', glow: 'rgba(201, 63, 69, 0.30)' },
}

const unassessedFill = { top: '#8d9aa3', side: '#65727b', glow: 'rgba(101, 114, 123, 0.20)' }

function lonLatToWorld(lon: number, lat: number): [number, number] {
  return [(lon - CENTER_LON) * COS_LAT * GEO_SCALE, -(lat - CENTER_LAT) * GEO_SCALE]
}

const worldOutline = outlineCoords.map(([lon, lat]) => lonLatToWorld(lon, lat))
const worldCities = regions.map((item) => lonLatToWorld(item.longitude, item.latitude))

/** Tallest possible risk column (same ceilings used by `points`). */
const MAX_COLUMN_HEIGHT = 0.52
const CAMERA_DIST = 3.8
const STAGE_PADDING_X = 26
const STAGE_PADDING_TOP = 34
const STAGE_PADDING_BOTTOM = 46

/**
 * Projects a world point into stage pixels. `unit` is derived per stage size from the
 * projected outline bounds so the stylized country always fills the available canvas
 * instead of shrinking into a small island on wide screens.
 */
function project3D(
  wx: number,
  wy: number,
  wz: number,
  yawDeg: number,
  pitchDeg: number,
  zoom: number,
  width: number,
  height: number,
  unit: number,
  centerY: number,
): ProjectedPoint {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)

  const x1 = wx * cosY - wz * sinY
  const z1 = wx * sinY + wz * cosY
  const y2 = wy * cosP - z1 * sinP
  const z2 = wy * sinP + z1 * cosP

  const persp = (CAMERA_DIST / Math.max(1.2, CAMERA_DIST + z2)) * zoom

  return {
    x: width * 0.5 + x1 * unit * persp,
    y: height * centerY - y2 * unit * persp,
    z: z2,
    scale: persp,
  }
}

interface StageFit {
  unit: number
  centerY: number
}

/**
 * Fits the projected stylized country (plus its tallest columns) into the stage with
 * consistent breathing room at every pitch and zoom, so the map never clips at the top
 * or leaves the lower third of the canvas empty.
 */
function computeStageFit(width: number, height: number, yaw: number, pitch: number, zoom: number): StageFit {
  const sample = (unit: number, centerY: number, includeColumns: boolean) => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const visit = (wx: number, wz: number) => {
      if (includeColumns) {
        const base = project3D(wx, 0, wz, yaw, pitch, zoom, width, height, unit, centerY)
        const top = project3D(wx, MAX_COLUMN_HEIGHT, wz, yaw, pitch, zoom, width, height, unit, centerY)
        minY = Math.min(minY, base.y, top.y)
        maxY = Math.max(maxY, base.y, top.y)
        minX = Math.min(minX, base.x, top.x)
        maxX = Math.max(maxX, base.x, top.x)
      } else {
        const point = project3D(wx, 0, wz, yaw, pitch, zoom, width, height, unit, centerY)
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y)
      }
    }
    for (const [wx, wz] of worldOutline) visit(wx, wz)
    if (includeColumns) for (const [wx, wz] of worldCities) visit(wx, wz)
    return { minX, maxX, minY, maxY }
  }

  // First pass: scale the country to the usable stage width.
  const baseUnit = 1
  const baseBounds = sample(baseUnit, 0.5, false)
  const availableWidth = Math.max(160, width - STAGE_PADDING_X * 2)
  const unit = clamp((baseUnit * availableWidth) / Math.max(1, baseBounds.maxX - baseBounds.minX), 120, 1600)

  // Second pass: pick the vertical centring that keeps columns inside the padding.
  const availableHeight = Math.max(120, height - STAGE_PADDING_TOP - STAGE_PADDING_BOTTOM)
  const boundsAtHalf = sample(unit, 0.5, true)
  const spanY = Math.max(1, boundsAtHalf.maxY - boundsAtHalf.minY)
  const scaleY = Math.min(1, availableHeight / spanY)
  const fittedUnit = unit * scaleY
  const fittedBounds = sample(fittedUnit, 0.5, true)
  const usableTop = STAGE_PADDING_TOP
  const usableBottom = height - STAGE_PADDING_BOTTOM
  const desiredShift = (usableTop + usableBottom) / 2 - (fittedBounds.minY + fittedBounds.maxY) / 2

  return {
    unit: fittedUnit,
    centerY: 0.5 + desiredShift / Math.max(1, height),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isCanvas2DSupported(): boolean {
  if (typeof document === 'undefined') return false
  if (
    typeof navigator !== 'undefined' &&
    /jsdom/i.test(navigator.userAgent) &&
    typeof HTMLCanvasElement !== 'undefined' &&
    !('mock' in HTMLCanvasElement.prototype.getContext)
  ) {
    return false
  }
  try {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext && probe.getContext('2d'))
  } catch {
    return false
  }
}

export function IndiaRiskScene3D({
  selectedWeather,
  selectedAir,
  selectedWeatherFreshness,
  selectedAirFreshness,
}: {
  selectedWeather: CurrentWeather | null
  selectedAir: AirQualityData | null
  selectedWeatherFreshness: 'current' | 'stale'
  selectedAirFreshness: 'current' | 'stale'
}) {
  const { region, setRegion, reducedMotion } = useApp()
  const selectedRegion = getRegion(region)
  const map = useWeatherMap()

  const [layer, setLayer] = useState<RiskSceneLayer>('heat')
  const [yaw, setYaw] = useState(DEFAULT_YAW)
  const [pitch, setPitch] = useState(DEFAULT_PITCH)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  // Mirror the live camera in refs so button tweens start from wherever the user dragged to.
  const yawRef = useRef(yaw)
  const pitchRef = useRef(pitch)
  const zoomRef = useRef(zoom)
  yawRef.current = yaw
  pitchRef.current = pitch
  zoomRef.current = zoom
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const [canvasSupported] = useState(() => isCanvas2DSupported())
  const [autoFallbackReason, setAutoFallbackReason] = useState<string | null>(() =>
    isCanvas2DSupported() ? null : '3D canvas rendering is unavailable in this browser environment; showing the 2D stylized view.',
  )
  const [manual2D, setManual2D] = useState(false)

  const use2DFallback = !canvasSupported || Boolean(autoFallbackReason) || manual2D

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitTargetsRef = useRef<HitTarget[]>([])
  const dragState = useRef<{ active: boolean; startX: number; startY: number; startYaw: number; startPitch: number; moved: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    startYaw: DEFAULT_YAW,
    startPitch: DEFAULT_PITCH,
    moved: false,
  })
  const slowFramesRef = useRef(0)

  const points: SceneCityPoint[] = useMemo(() => {
    return regions.map((item) => {
      const [wx, wz] = lonLatToWorld(item.longitude, item.latitude)
      const heatEntry = map.entries[item.slug]
      const airEntry = map.airEntries[item.slug]

      const weather = item.slug === region ? selectedWeather : (heatEntry?.data ?? null)
      const air = item.slug === region ? selectedAir : (airEntry?.data ?? null)

      if (layer === 'heat') {
        if (!weather) {
          return {
            ...item, wx, wz,
            level: null,
            height: 0.045,
            metricPrimary: 'Heat unassessed',
            metricSecondary: 'No live reading',
            freshness: 'unavailable',
            modelTime: null,
            weather: null,
            air,
          }
        }
        const level = getSimpleRisk(weather.risk)
        const normalized = clamp((weather.heatIndex - 20) / 34, 0.14, 1)
        return {
          ...item, wx, wz,
          level,
          height: 0.08 + normalized * 0.44,
          metricPrimary: `${weather.heatIndex.toFixed(1)}°C heat index`,
          metricSecondary: `${weather.temperature.toFixed(1)}°C · ${weather.humidity}% RH`,
          freshness: item.slug === region ? selectedWeatherFreshness : (heatEntry?.freshness ?? 'unavailable'),
          modelTime: weather.observedAt,
          weather,
          air,
        }
      }

      const assessment = air ? assessAirQuality(air) : null
      if (!air || !assessment) {
        return {
          ...item, wx, wz,
          level: null,
          height: 0.045,
          metricPrimary: 'AQI unassessed',
          metricSecondary: 'No CAMS reading',
          freshness: 'unavailable',
          modelTime: null,
          weather,
          air: null,
        }
      }
      const aqiBasis = Math.max(air.usAqi ?? 0, (air.europeanAqi ?? 0) * 2.2)
      const normalized = clamp(aqiBasis / 240, 0.14, 1)
      return {
        ...item, wx, wz,
        level: assessment.level,
        height: 0.08 + normalized * 0.44,
        metricPrimary: air.usAqi !== null ? `US AQI ${air.usAqi.toFixed(0)}` : `EU AQI ${air.europeanAqi?.toFixed(0) ?? '—'}`,
        metricSecondary: air.pm2_5 !== null ? `PM2.5 ${air.pm2_5.toFixed(1)} µg/m³` : assessment.summary,
        freshness: airEntry?.freshness ?? selectedAirFreshness,
        modelTime: air.modelTime,
        weather,
        air,
      }
    })
  }, [layer, map.airEntries, map.entries, region, selectedAir, selectedAirFreshness, selectedWeather, selectedWeatherFreshness])

  const selectedPoint = points.find((point) => point.slug === region) ?? points[0]
  const activeMapStatus = layer === 'heat' ? map.status : map.airStatus

  // Animated camera: buttons ease to a target over ~260ms so the view does not jump.
  // Direct pointer dragging stays instant (see onPointerMove) and reduced motion skips the tween.
  const animationRef = useRef<number | null>(null)

  const animateCamera = useCallback(
    (target: { yaw?: number; pitch?: number; zoom?: number }) => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      if (reducedMotion) {
        if (target.yaw !== undefined) setYaw(target.yaw)
        if (target.pitch !== undefined) setPitch(target.pitch)
        if (target.zoom !== undefined) setZoom(target.zoom)
        return
      }
      const start = { yaw: yawRef.current, pitch: pitchRef.current, zoom: zoomRef.current }
      const end = {
        yaw: target.yaw ?? start.yaw,
        pitch: target.pitch ?? start.pitch,
        zoom: target.zoom ?? start.zoom,
      }
      // Shortest-path yaw so a rotation never spins the long way round.
      let yawDelta = end.yaw - start.yaw
      if (yawDelta > 180) yawDelta -= 360
      if (yawDelta < -180) yawDelta += 360
      const duration = 260
      const startedAt = performance.now()
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        setYaw(start.yaw + yawDelta * eased)
        setPitch(start.pitch + (end.pitch - start.pitch) * eased)
        setZoom(start.zoom + (end.zoom - start.zoom) * eased)
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(step)
        } else {
          animationRef.current = null
        }
      }
      animationRef.current = requestAnimationFrame(step)
    },
    [reducedMotion],
  )

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
  }, [])

  const rotateBy = useCallback((dYaw: number, dPitch = 0) => {
    let nextYaw = yawRef.current + dYaw
    if (nextYaw > 180) nextYaw -= 360
    if (nextYaw < -180) nextYaw += 360
    animateCamera({
      yaw: nextYaw,
      pitch: dPitch === 0 ? undefined : clamp(pitchRef.current + dPitch, 22, 76),
    })
  }, [animateCamera])

  const zoomBy = useCallback((delta: number) => {
    animateCamera({ zoom: clamp(Math.round((zoomRef.current + delta) * 100) / 100, 0.75, 2.4) })
  }, [animateCamera])

  const resetCamera = useCallback(() => {
    animateCamera({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, zoom: DEFAULT_ZOOM })
  }, [animateCamera])

  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      rotateBy(-12, 0)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      rotateBy(12, 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      rotateBy(0, 8)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      rotateBy(0, -8)
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(0.18)
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      zoomBy(-0.18)
    } else if (event.key === '0' || event.key === 'Home') {
      event.preventDefault()
      resetCamera()
    }
  }

  useEffect(() => {
    if (use2DFallback) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setAutoFallbackReason('3D canvas context is unavailable; showing the 2D stylized view.')
      return
    }

    const draw = () => {
      const frameStart = performance.now()
      const rect = canvas.getBoundingClientRect()
      const cssWidth = Math.max(280, Math.round(rect.width || 640))
      const cssHeight = Math.max(260, Math.round(rect.height || 400))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(cssWidth * dpr)
        canvas.height = Math.round(cssHeight * dpr)
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, cssWidth, cssHeight)

      // Auto-fit the stylized country + columns into the stage at the current camera angle
      const fit = computeStageFit(cssWidth, cssHeight, yaw, pitch, zoom)

      // Subtle atmospheric studio backdrop
      const bg = ctx.createRadialGradient(cssWidth * 0.5, cssHeight * 0.45, 24, cssWidth * 0.5, cssHeight * 0.5, cssWidth * 0.68)
      bg.addColorStop(0, '#f9fbfc')
      bg.addColorStop(1, '#e7eef2')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, cssWidth, cssHeight)

      // 3D Lat/Lon graticule lines on plateau base plane (wy = -0.085)
      ctx.strokeStyle = 'rgba(130, 150, 163, 0.24)'
      ctx.lineWidth = 1
      for (const lat of [10, 16, 22, 28, 34]) {
        ctx.beginPath()
        for (let lon = 68; lon <= 98; lon += 2) {
          const [gx, gz] = lonLatToWorld(lon, lat)
          const p = project3D(gx, -0.085, gz, yaw, pitch, zoom, cssWidth, cssHeight, fit.unit, fit.centerY)
          if (lon === 68) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
      }
      for (const lon of [70, 76, 82, 88, 94]) {
        ctx.beginPath()
        for (let lat = 8; lat <= 36; lat += 2) {
          const [gx, gz] = lonLatToWorld(lon, lat)
          const p = project3D(gx, -0.085, gz, yaw, pitch, zoom, cssWidth, cssHeight, fit.unit, fit.centerY)
          if (lat === 8) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
      }

      // Project India top plateau (wy = 0) and extruded lower base (wy = -0.08)
      const topRing = worldOutline.map(([wx, wz]) => project3D(wx, 0, wz, yaw, pitch, zoom, cssWidth, cssHeight, fit.unit, fit.centerY))
      const baseRing = worldOutline.map(([wx, wz]) => project3D(wx, -0.08, wz, yaw, pitch, zoom, cssWidth, cssHeight, fit.unit, fit.centerY))

      // Drop shadow beneath extruded plateau
      ctx.beginPath()
      baseRing.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y + 7) : ctx.lineTo(p.x, p.y + 7)))
      ctx.closePath()
      ctx.fillStyle = 'rgba(32, 49, 61, 0.10)'
      ctx.fill()

      // Extruded 3D cliff side walls around India outline
      ctx.fillStyle = '#cfdbe1'
      ctx.strokeStyle = '#bccad2'
      ctx.lineWidth = 0.7
      for (let i = 0; i < topRing.length - 1; i += 1) {
        const t1 = topRing[i]
        const t2 = topRing[i + 1]
        const b2 = baseRing[i + 1]
        const b1 = baseRing[i]
        if (b1.y > t1.y - 0.5 || b2.y > t2.y - 0.5) {
          ctx.beginPath()
          ctx.moveTo(t1.x, t1.y)
          ctx.lineTo(t2.x, t2.y)
          ctx.lineTo(b2.x, b2.y)
          ctx.lineTo(b1.x, b1.y)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      }

      // Top India relief surface
      ctx.beginPath()
      topRing.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      const landGrad = ctx.createLinearGradient(0, cssHeight * 0.18, 0, cssHeight * 0.85)
      landGrad.addColorStop(0, '#ffffff')
      landGrad.addColorStop(1, '#f1f5f7')
      ctx.fillStyle = landGrad
      ctx.fill()
      ctx.strokeStyle = '#8da0ab'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Depth-sort 15 city pillars back-to-front by camera z
      const projectedCities = points
        .map((city) => {
          const base = project3D(city.wx, 0, city.wz, yaw, pitch, zoom, cssWidth, cssHeight, fit.unit, fit.centerY)
          const top = project3D(city.wx, city.height, city.wz, yaw, pitch, zoom, cssWidth, cssHeight, fit.unit, fit.centerY)
          return { city, base, top }
        })
        .sort((a, b) => b.base.z - a.base.z)

      const nextTargets: HitTarget[] = []
      const placedLabels: { x: number; y: number; width: number; height: number }[] = []

      for (const { city, base, top } of projectedCities) {
        const isSelected = city.slug === region
        const isHovered = city.slug === hoveredSlug
        const palette = city.level ? riskFill[city.level] : unassessedFill
        const colRadius = clamp((isSelected ? 8.5 : 6.2) * base.scale, 4.5, 16)
        const ellipseRy = Math.max(2.4, colRadius * Math.sin((pitch * Math.PI) / 180) * 0.72)

        // Selected or hovered halo on the plateau surface
        if (isSelected || isHovered) {
          ctx.beginPath()
          ctx.ellipse(base.x, base.y, colRadius * 2.2, ellipseRy * 2.2, 0, 0, Math.PI * 2)
          ctx.fillStyle = palette.glow
          ctx.fill()
          ctx.strokeStyle = isSelected ? palette.top : '#59656f'
          ctx.lineWidth = isSelected ? 1.8 : 1
          ctx.stroke()
        }

        // Ground contact shadow
        ctx.beginPath()
        ctx.ellipse(base.x + 2, base.y + 1.5, colRadius * 1.05, ellipseRy, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(26, 39, 48, 0.16)'
        ctx.fill()

        // 3D Extruded cylinder shaft
        const colGrad = ctx.createLinearGradient(base.x - colRadius, base.y, base.x + colRadius, top.y)
        colGrad.addColorStop(0, palette.side)
        colGrad.addColorStop(0.45, palette.top)
        colGrad.addColorStop(1, palette.side)

        ctx.beginPath()
        ctx.moveTo(top.x - colRadius, top.y)
        ctx.lineTo(base.x - colRadius, base.y)
        ctx.ellipse(base.x, base.y, colRadius, ellipseRy, 0, Math.PI, 0, true)
        ctx.lineTo(top.x + colRadius, top.y)
        ctx.closePath()
        ctx.fillStyle = colGrad
        ctx.fill()

        if (isSelected) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.6
          ctx.stroke()
        }

        // 3D Top cap disc
        ctx.beginPath()
        ctx.ellipse(top.x, top.y, colRadius, ellipseRy, 0, 0, Math.PI * 2)
        ctx.fillStyle = palette.top
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#202a33' : '#ffffff'
        ctx.lineWidth = isSelected ? 2 : 1.2
        ctx.stroke()

        // Label selected & hovered cities cleanly on stage
        if (isSelected || isHovered) {
          const label = city.name
          ctx.font = `${isSelected ? 700 : 600} 12px "Inter Variable", Inter, system-ui, sans-serif`
          const textWidth = ctx.measureText(label).width
          const pillW = textWidth + 14
          const pillH = 22
          // Stack collision-prone labels (e.g. Mumbai / Thane / Navi Mumbai) instead of overlapping
          const collision = placedLabels.some((box) => {
            const candidateX = clamp(top.x - pillW / 2, 8, cssWidth - pillW - 8)
            const candidateY = Math.max(8, top.y - ellipseRy - 28)
            return Math.abs(candidateX + pillW / 2 - (box.x + box.width / 2)) < (pillW + box.width) / 2 + 4
              && Math.abs(candidateY + pillH / 2 - (box.y + box.height / 2)) < (pillH + box.height) / 2 + 3
          })
          const px = clamp(top.x - pillW / 2, 8, cssWidth - pillW - 8)
          const py = collision
            ? Math.max(8, top.y - ellipseRy - 28 - 26)
            : Math.max(8, top.y - ellipseRy - 28)
          placedLabels.push({ x: px, y: py, width: pillW, height: pillH })

          ctx.fillStyle = isSelected ? '#202a33' : 'rgba(255, 255, 255, 0.94)'
          ctx.strokeStyle = isSelected ? '#202a33' : '#c6d0d6'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(px, py, pillW, pillH, 999)
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = isSelected ? '#ffffff' : '#202a33'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, px + pillW / 2, py + pillH / 2 + 0.5)
        }

        nextTargets.push({
          slug: city.slug,
          topX: top.x,
          topY: top.y,
          baseX: base.x,
          baseY: base.y,
          radius: Math.max(12, colRadius + 5),
        })
      }

      // 3D Rotating Compass Rose in top-left corner
      const cx = 42
      const cy = 42
      const compR = 22
      ctx.beginPath()
      ctx.arc(cx, cy, compR + 5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fill()
      ctx.strokeStyle = '#dce3e7'
      ctx.lineWidth = 1
      ctx.stroke()

      const yawRad = (yaw * Math.PI) / 180
      const pitchSquash = Math.max(0.42, Math.sin((pitch * Math.PI) / 180))
      const nx = cx - Math.sin(yawRad) * compR
      const ny = cy - Math.cos(yawRad) * compR * pitchSquash
      const sx = cx + Math.sin(yawRad) * compR
      const sy = cy + Math.cos(yawRad) * compR * pitchSquash

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(nx, ny)
      ctx.strokeStyle = '#9aa8b0'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(nx, ny, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = '#bd5224'
      ctx.fill()

      ctx.font = '700 10px "Inter Variable", Inter, sans-serif'
      ctx.fillStyle = '#9f3f1b'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', cx - Math.sin(yawRad) * (compR - 7), cy - Math.cos(yawRad) * (compR - 7) * pitchSquash)

      ctx.restore()
      hitTargetsRef.current = nextTargets

      const elapsed = performance.now() - frameStart
      if (elapsed > 65) {
        slowFramesRef.current += 1
        if (slowFramesRef.current >= 4) {
          setAutoFallbackReason('Switched automatically to the 2D view to keep interaction fast on this device.')
        }
      } else {
        slowFramesRef.current = 0
      }
    }

    draw()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [hoveredSlug, pitch, points, region, use2DFallback, yaw, zoom])

  const findHitSlug = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    // Check front-most targets first (reverse of back-to-front draw order)
    const targets = [...hitTargetsRef.current].reverse()
    for (const target of targets) {
      const distTop = Math.hypot(x - target.topX, y - target.topY)
      if (distTop <= target.radius) return target.slug
      const minY = Math.min(target.topY, target.baseY) - 4
      const maxY = Math.max(target.topY, target.baseY) + 4
      const midX = (target.topX + target.baseX) / 2
      if (y >= minY && y <= maxY && Math.abs(x - midX) <= target.radius * 0.85) {
        return target.slug
      }
    }
    return null
  }

  return (
    <section className="card risk-scene-card" aria-labelledby="risk-scene-heading">
      <div className="risk-scene-top">
        <div>
          <span className="section-label">Interactive 3D risk view · 15 configured locations</span>
          <h2 id="risk-scene-heading">{layer === 'heat' ? '3D heat-index screening view' : '3D modelled air-pollution view'}</h2>
        </div>
        <div className="risk-scene-layer-group" role="group" aria-label="3D risk view layer">
          <button
            type="button"
            className={layer === 'heat' ? 'active' : ''}
            aria-pressed={layer === 'heat'}
            onClick={() => setLayer('heat')}
          >
            <ThermometerSun size={16} aria-hidden="true" />
            <span>Heat risk</span>
          </button>
          <button
            type="button"
            className={layer === 'air-quality' ? 'active' : ''}
            aria-pressed={layer === 'air-quality'}
            onClick={() => setLayer('air-quality')}
          >
            <Wind size={16} aria-hidden="true" />
            <span>Air pollution</span>
          </button>
        </div>
      </div>

      <p className="risk-scene-scope">
        <Layers size={14} aria-hidden="true" />
        <span>
          {layer === 'heat' ? 'Heat layer: taller columns mean greater heat stress.' : 'Air layer: colour shows the higher AQI caution band.'}
        </span>
      </p>
      <details className="source-note-detail risk-scene-scope-more">
        <summary>What this {use2DFallback ? '2D' : '3D'} view shows</summary>
        <p>Stylized city-point view: column height and colour show each city’s {layer === 'heat' ? 'calculated shade heat index' : 'higher US/European CAMS AQI band'}—not terrain elevation or street-level sensor readings.</p>
      </details>

      <div className="risk-scene-toolbar" role="toolbar" aria-label="3D risk view camera and display controls">
        {!use2DFallback && (
          <>
            {/* Essentials stay visible: zoom, reset, and the labelled camera menu. */}
            <div className="scene-tool-group" role="group" aria-label="Zoom">
              <button type="button" className="scene-tool-btn" aria-label="Zoom 3D view in" onClick={() => zoomBy(0.2)}>
                <Plus size={15} aria-hidden="true" />
                <span>Zoom +</span>
              </button>
              <button type="button" className="scene-tool-btn" aria-label="Zoom 3D view out" onClick={() => zoomBy(-0.2)}>
                <Minus size={15} aria-hidden="true" />
                <span>Zoom −</span>
              </button>
            </div>

            <button type="button" className="scene-tool-btn" aria-label="Reset 3D camera" onClick={resetCamera}>
              <Maximize2 size={15} aria-hidden="true" />
              <span>Reset</span>
            </button>

            <details className="scene-camera-menu">
              <summary>
                <Compass size={15} aria-hidden="true" />
                <span>Camera angle</span>
              </summary>
              <div className="scene-camera-menu-body" role="group" aria-label="Rotate and tilt the 3D view">
                <button type="button" className="scene-tool-btn" aria-label="Rotate 3D view left" onClick={() => rotateBy(-15, 0)}>
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>Rotate left</span>
                </button>
                <button type="button" className="scene-tool-btn" aria-label="Rotate 3D view right" onClick={() => rotateBy(15, 0)}>
                  <RotateCw size={15} aria-hidden="true" />
                  <span>Rotate right</span>
                </button>
                <button type="button" className="scene-tool-btn" aria-label="Tilt 3D view higher" onClick={() => rotateBy(0, 8)}>
                  <Compass size={15} aria-hidden="true" />
                  <span>Tilt +</span>
                </button>
                <button type="button" className="scene-tool-btn" aria-label="Tilt 3D view lower" onClick={() => rotateBy(0, -8)}>
                  <Compass size={15} aria-hidden="true" />
                  <span>Tilt −</span>
                </button>
                <p className="scene-camera-hint">You can also drag the map, or focus it and use the arrow keys.</p>
              </div>
            </details>
          </>
        )}
        {canvasSupported && !autoFallbackReason && (
          <button
            type="button"
            className="scene-tool-btn scene-mode-btn"
            aria-pressed={manual2D}
            onClick={() => setManual2D((prev) => !prev)}
          >
            <Box size={15} aria-hidden="true" />
            <span>{manual2D ? 'Switch to 3D view' : '2D fallback view'}</span>
          </button>
        )}
        <button
          type="button"
          className="scene-tool-btn"
          onClick={map.refresh}
          disabled={map.status === 'loading' || map.airStatus === 'loading'}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {autoFallbackReason && <p className="scene-fallback-note">{autoFallbackReason}</p>}

      {!use2DFallback ? (
        <div
          className={`risk-scene-stage${reducedMotion ? ' reduced-motion' : ''}`}
          tabIndex={0}
          role="region"
          aria-label={`Interactive 3D stylized India ${layer === 'heat' ? 'heat-risk' : 'air-pollution'} stage. Selected location: ${selectedRegion.name}. Use arrow keys to rotate and tilt, plus or minus to zoom, 0 to reset, or use the text city list below.`}
          onKeyDown={handleStageKeyDown}
        >
          <canvas
            ref={canvasRef}
            className="risk-scene-canvas"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              dragState.current = {
                active: true,
                startX: event.clientX,
                startY: event.clientY,
                startYaw: yaw,
                startPitch: pitch,
                moved: false,
              }
            }}
            onPointerMove={(event) => {
              if (dragState.current.active) {
                const dx = event.clientX - dragState.current.startX
                const dy = event.clientY - dragState.current.startY
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.current.moved = true
                setYaw(() => {
                  const next = dragState.current.startYaw + dx * 0.45
                  return next > 180 ? next - 360 : next < -180 ? next + 360 : next
                })
                setPitch(clamp(dragState.current.startPitch + dy * 0.3, 22, 76))
                return
              }
              setHoveredSlug(findHitSlug(event.clientX, event.clientY))
            }}
            onPointerUp={(event) => {
              const wasClick = !dragState.current.moved
              dragState.current.active = false
              if (wasClick) {
                const hit = findHitSlug(event.clientX, event.clientY)
                if (hit) setRegion(hit)
              }
            }}
            onPointerLeave={() => {
              dragState.current.active = false
              setHoveredSlug(null)
            }}
          />
          <div className="risk-scene-legend" role="group" aria-label="Risk column colour legend">
            <span><i className="legend-dot low" />Low</span>
            <span><i className="legend-dot moderate" />Moderate</span>
            <span><i className="legend-dot high" />High</span>
            <span><i className="legend-dot extreme" />Extreme</span>
            <span><i className="legend-dot unassessed" />Unassessed</span>
          </div>
          <span className="risk-scene-hint">Drag or use Arrow keys to rotate · +/− to zoom · Click a column to select city</span>
        </div>
      ) : (
        <div className="risk-scene-fallback" role="region" aria-label={`2D stylized India ${layer === 'heat' ? 'heat-risk' : 'air-pollution'} fallback view`}>
          <svg viewBox="66 -37 33 31" className="risk-scene-fallback-svg" role="group" aria-label="Static stylized India outline with 15 selectable city markers">
            <polygon
              points={outlineCoords.map(([lon, lat]) => `${lon.toFixed(2)},${(-lat).toFixed(2)}`).join(' ')}
              fill="#f8fafb"
              stroke="#8da0ab"
              strokeWidth="0.22"
            />
            {points.map((city) => {
              const fill = city.level ? riskFill[city.level].top : unassessedFill.top
              const isSelected = city.slug === region
              return (
                <g
                  key={city.slug}
                  className="fallback-city-marker"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${city.name}, ${city.state}: ${city.metricPrimary} (${city.level ?? 'unassessed'})`}
                  aria-pressed={isSelected}
                  onClick={() => setRegion(city.slug)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setRegion(city.slug)
                    }
                  }}
                >
                  {isSelected && <circle cx={city.longitude} cy={-city.latitude} r="1.25" fill="none" stroke={fill} strokeWidth="0.22" />}
                  <circle
                    cx={city.longitude}
                    cy={-city.latitude}
                    r={isSelected ? '0.78' : '0.55'}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth="0.18"
                  >
                    <title>{`${city.name}: ${city.metricPrimary} (${city.level ?? 'unassessed'})`}</title>
                  </circle>
                </g>
              )
            })}
          </svg>
          <div className="risk-scene-legend" role="group" aria-label="Risk marker colour legend">
            <span><i className="legend-dot low" />Low</span>
            <span><i className="legend-dot moderate" />Moderate</span>
            <span><i className="legend-dot high" />High</span>
            <span><i className="legend-dot extreme" />Extreme</span>
            <span><i className="legend-dot unassessed" />Unassessed</span>
          </div>
        </div>
      )}

      {activeMapStatus === 'loading' && (
        <p className="scene-loading-line" aria-live="polite">
          <LoaderCircle className="weather-spinner" size={15} aria-hidden="true" />
          Loading 15-city {layer === 'heat' ? 'heat-index' : 'CAMS air-quality'} points…
        </p>
      )}

      {/* A reading strip beneath the stage rather than an overlay on it: an
          absolutely-positioned panel escaped the card on narrow screens and sat
          over the page header. In flow it cannot cover anything. */}
      <div className="risk-scene-inspector" aria-label={`Selected 3D location readings for ${selectedPoint.name}`}>
        <div className="risk-scene-inspector-head">
          <div>
            <span className="section-label">Selected on stage</span>
            <h3>{selectedPoint.name}, {selectedPoint.state}</h3>
          </div>
          {selectedPoint.level ? (
            <RiskBadge level={selectedPoint.level} />
          ) : activeMapStatus === 'loading' ? (
            <StatusBadge status="loading">Loading</StatusBadge>
          ) : (
            <StatusBadge status="unavailable">Unassessed</StatusBadge>
          )}
        </div>
        {/* One reading per value: the dashboard's key-reading cards already show heat index,
            temperature, feels-like, humidity and modelled AQI, so the stage only names the
            value that decides this column's colour instead of repeating all four. */}
        <p className="risk-scene-inspector-metric">
          <span>{layer === 'heat' ? 'Shade heat index' : 'Higher US/European AQI band'}</span>
          <strong>{selectedPoint.level || activeMapStatus !== 'loading'
            ? selectedPoint.metricPrimary
            : `Awaiting ${layer === 'heat' ? 'heat-index' : 'CAMS air-quality'} readings`}</strong>
          {layer === 'heat' && selectedPoint.level
            ? <small>Decides this column’s colour · full readings in the cards below</small>
            : null}
        </p>
        {selectedPoint.modelTime && (
          <small className="risk-scene-inspector-time">
            {selectedPoint.freshness === 'stale' ? 'Stale cached model · ' : 'Model time: '}
            <time dateTime={selectedPoint.modelTime}>{formatWeatherTime(selectedPoint.modelTime)} IST</time>
          </small>
        )}
      </div>

      <details className="risk-scene-text-access">
        <summary>Select or compare all 15 locations as accessible text ({layer === 'heat' ? 'Heat risk' : 'Air pollution'})</summary>
        <div className="risk-scene-city-pills" role="group" aria-label="Select a configured Indian location">
          {points.map((city) => (
            <button
              key={city.slug}
              type="button"
              className={`scene-city-pill${city.slug === region ? ' selected' : ''}`}
              aria-pressed={city.slug === region}
              onClick={() => setRegion(city.slug)}
            >
              <span className={`legend-dot ${city.level ?? 'unassessed'}`} aria-hidden="true" />
              <strong>{city.name}</strong>
              <small>{city.metricPrimary}</small>
            </button>
          ))}
        </div>
      </details>
    </section>
  )
}
