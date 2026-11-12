import type { OfficialAlertsData } from '../api/official'
import type { OfficialSourceState } from '../hooks/useOfficialData'
import type { AirQualityData, SimpleRiskLevel, WeatherData } from '../types'
import { riskRecommendations, safetyTips } from './guidance'
import {
  aqiRecommendations,
  assessAirQuality,
  assessHeat,
  buildEnvironmentalScreening,
  europeanAqiCategory,
  europeanAqiRecommendations,
  usAqiCategory,
} from './hazards'

export interface PrimaryRiskSummary {
  level: SimpleRiskLevel | null
  bannerLabel: string
  hazardLabel: string
  shortReason: string
  missingNotice: string | null
  updatedAt: string | null
  officialSummary: {
    status: 'active-warning' | 'checked-none' | 'unconfigured' | 'unavailable' | 'loading'
    headline: string
    detail: string
  }
}

export interface DashboardTask {
  id: string
  category: 'heat' | 'air' | 'prevention'
  badgeLabel: string
  /** `null` means the driving environmental input was not assessed — never downgraded to Low. */
  level: SimpleRiskLevel | null
  title: string
  detail: string
}

export interface PreparednessBadge {
  id: 'first-step' | 'daily-plan' | 'multi-hazard'
  label: string
  rule: string
  earned: boolean
}

export interface PreparednessProgress {
  completedCount: number
  totalCount: number
  percent: number
  badges: PreparednessBadge[]
}

const riskOrder: Record<SimpleRiskLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  extreme: 3,
}

export function getIstDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function selectPrimaryRiskSummary({
  weather,
  air,
  weatherStatus,
  airStatus,
  officialAlerts,
}: {
  weather: WeatherData | null
  air: AirQualityData | null
  weatherStatus: 'loading' | 'ready' | 'error'
  airStatus: 'loading' | 'ready' | 'error'
  officialAlerts: OfficialSourceState<OfficialAlertsData>
}): PrimaryRiskSummary {
  const screening = buildEnvironmentalScreening(weather, air)
  const heat = weather ? assessHeat(weather) : null
  const airAssessment = air ? assessAirQuality(air) : null

  const timestamps = [weather?.retrievedAt, air?.retrievedAt]
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  const updatedAt = timestamps[0] ?? null

  const officialData = officialAlerts.data
  const activeCap = officialAlerts.status === 'ready' && officialData && officialData.alerts.length > 0
    ? officialData.alerts[0]
    : null

  const officialSummary: PrimaryRiskSummary['officialSummary'] = activeCap && officialData
    ? {
      status: 'active-warning',
      headline: `${officialData.count} official SACHET CAP ${officialData.count === 1 ? 'warning' : 'warnings'} matched`,
      detail: `${activeCap.headline ?? activeCap.event} (${activeCap.senderName ?? activeCap.sender})`,
    }
    : officialAlerts.status === 'ready' && officialData
      ? {
        status: 'checked-none',
        headline: !officialData.retrievalComplete || officialData.unresolvedAreaCount > 0
          ? 'Official SACHET checked (partial area coverage)'
          : '0 matched official SACHET warnings right now',
        detail: !officialData.retrievalComplete || officialData.unresolvedAreaCount > 0
          ? 'Some CAP messages lacked full area polygons; absence here is not an all-clear.'
          : 'Official CAP feed checked; continue monitoring local authorities.',
      }
      : officialAlerts.status === 'loading'
        ? {
          status: 'loading',
          headline: 'Checking official NDMA SACHET feed…',
          detail: 'Official government warnings are checked separately from model screening.',
        }
        : officialAlerts.status === 'error'
          ? {
            status: 'unavailable',
            headline: 'Official SACHET feed unavailable',
            detail: 'Could not reach the official CAP feed—check sachet.ndma.gov.in directly.',
          }
          : {
            status: 'unconfigured',
            headline: 'Official government feed not connected on static site',
            detail: 'This view shows Open-Meteo/CAMS model screening only—check NDMA SACHET directly for official alerts.',
          }

  let missingNotice: string | null = null
  if (!heat && !airAssessment) {
    missingNotice = weatherStatus === 'loading' || airStatus === 'loading'
      ? 'Loading Open-Meteo weather and CAMS air-quality models—conditions are not yet assessed.'
      : 'Weather and air-quality model inputs are unavailable. Unassessed conditions are never marked Safe.'
  } else if (!heat) {
    missingNotice = 'Weather model unavailable—heat stress has not been assessed and is not assumed Safe.'
  } else if (!airAssessment) {
    missingNotice = 'CAMS air-quality model unavailable—air pollution has not been assessed and is not assumed Safe.'
  }

  if (!heat && !airAssessment) {
    return {
      level: null,
      bannerLabel: weatherStatus === 'loading' || airStatus === 'loading' ? 'Checking models…' : 'Unavailable',
      hazardLabel: 'Environmental screening unassessed',
      shortReason: missingNotice ?? 'Waiting for weather and air-quality model inputs.',
      missingNotice,
      updatedAt,
      officialSummary,
    }
  }

  if (heat && airAssessment) {
    const heatRank = riskOrder[heat.level]
    const airRank = riskOrder[airAssessment.level]
    if (heatRank === 0 && airRank === 0) {
      return {
        level: 'low',
        bannerLabel: screening.label,
        hazardLabel: 'Heat & air pollution · both Low',
        shortReason: `${weather!.heatIndex.toFixed(1)}°C shade heat index (${weather!.temperature.toFixed(1)}°C, ${weather!.humidity}% humidity) and ${airAssessment.summary}.`,
        missingNotice: null,
        updatedAt,
        officialSummary,
      }
    }
    if (heatRank > airRank) {
      return {
        level: heat.level,
        bannerLabel: screening.label,
        hazardLabel: 'Primary hazard: Heat stress',
        shortReason: `${weather!.temperature.toFixed(1)}°C model air temperature with ${weather!.humidity}% humidity creates a ${weather!.heatIndex.toFixed(1)}°C shade heat index (${heat.category} band).`,
        missingNotice: null,
        updatedAt,
        officialSummary,
      }
    }
    if (airRank > heatRank) {
      return {
        level: airAssessment.level,
        bannerLabel: screening.label,
        hazardLabel: 'Primary hazard: Air pollution',
        shortReason: `Modelled ${airAssessment.summary} (CAMS estimate; higher of US & European AQI bands).`,
        missingNotice: null,
        updatedAt,
        officialSummary,
      }
    }
    return {
      level: heat.level,
      bannerLabel: screening.label,
      hazardLabel: 'Combined hazard: Heat & air pollution',
      shortReason: `${weather!.heatIndex.toFixed(1)}°C shade heat index and modelled ${airAssessment.summary} both reach the ${heat.category} band.`,
      missingNotice: null,
      updatedAt,
      officialSummary,
    }
  }

  if (heat && weather) {
    return {
      level: heat.level,
      bannerLabel: screening.label,
      hazardLabel: heat.level === 'low' ? 'Heat Low · Air unassessed' : 'Assessed hazard: Heat stress',
      shortReason: `${weather.temperature.toFixed(1)}°C model temperature and ${weather.humidity}% humidity produce a ${weather.heatIndex.toFixed(1)}°C shade heat index.`,
      missingNotice,
      updatedAt,
      officialSummary,
    }
  }

  return {
    level: airAssessment!.level,
    bannerLabel: screening.label,
    hazardLabel: airAssessment!.level === 'low' ? 'Air Low · Heat unassessed' : 'Assessed hazard: Air pollution',
    shortReason: `Modelled ${airAssessment!.summary} from the Open-Meteo/CAMS air-quality model.`,
    missingNotice,
    updatedAt,
    officialSummary,
  }
}

export function buildDashboardSuggestions(
  weather: WeatherData | null,
  air: AirQualityData | null,
): DashboardTask[] {
  const heat = weather ? assessHeat(weather) : null
  const airAssessment = air ? assessAirQuality(air) : null

  const hydrationTip = safetyTips.find((tip) => tip.id === 'hydration')!
  const shadeTip = safetyTips.find((tip) => tip.id === 'shade')!
  const clothingTip = safetyTips.find((tip) => tip.id === 'clothing')!
  const communityTip = safetyTips.find((tip) => tip.id === 'community')!

  // When both models are Low ('Safe'), offer 3 practical everyday prevention steps
  if (heat?.level === 'low' && airAssessment?.level === 'low') {
    return [
      {
        id: 'prevent-water',
        category: 'heat',
        badgeLabel: 'Heat prevention',
        level: 'low',
        title: 'Pack drinking water before heading out',
        detail: `${hydrationTip.text} (${riskRecommendations.low})`,
      },
      {
        id: 'prevent-sun',
        category: 'prevention',
        badgeLabel: 'Midday sun prep',
        level: 'low',
        title: 'Keep light clothing, a hat, or an umbrella ready for 12–4 PM',
        detail: clothingTip.text,
      },
      {
        id: 'prevent-air-official',
        category: 'air',
        badgeLabel: 'Air & alert check',
        level: 'low',
        title: 'Check local official advisories if sensitive to pollution or storms',
        detail: aqiRecommendations.Good,
      },
    ]
  }

  const tasks: DashboardTask[] = []

  if (heat && heat.level !== 'low') {
    tasks.push({
      id: `heat-primary-${heat.level}`,
      category: 'heat',
      badgeLabel: `Heat · ${heat.category}`,
      level: heat.level,
      title: heat.level === 'moderate'
        ? 'Schedule shade and water breaks during outdoor time'
        : heat.level === 'high'
          ? 'Avoid direct afternoon sun (12 PM–4 PM) and drink water regularly'
          : 'Stay in a cool indoor space and avoid outdoor exertion',
      detail: riskRecommendations[heat.level],
    })
  }

  if (airAssessment && airAssessment.level !== 'low' && air) {
    const airDetail = air.usAqi !== null && (!air.europeanAqi || riskOrder[airAssessment.level] <= riskOrder[heat?.level ?? 'low'])
      ? aqiRecommendations[usAqiCategory(air.usAqi)]
      : air.europeanAqi !== null
        ? europeanAqiRecommendations[europeanAqiCategory(air.europeanAqi)]
        : airAssessment.recommendation
    tasks.push({
      id: `air-primary-${airAssessment.level}`,
      category: 'air',
      badgeLabel: `Air · ${airAssessment.level[0].toUpperCase() + airAssessment.level.slice(1)}`,
      level: airAssessment.level,
      title: airAssessment.level === 'moderate'
        ? 'Reduce prolonged strenuous outdoor exertion for sensitive groups'
        : airAssessment.level === 'high'
          ? 'Cut back outdoor exertion and limit time near heavy traffic or smoke'
          : 'Stay indoors in cleaner air where possible and avoid outdoor exercise',
      detail: airDetail,
    })
  }

  if (heat && (heat.level === 'high' || heat.level === 'extreme') && tasks.length < 3) {
    tasks.push({
      id: 'heat-check-others',
      category: 'prevention',
      badgeLabel: 'Community care',
      level: heat.level,
      title: 'Check on older adults, children, or outdoor workers today',
      detail: communityTip.text,
    })
  }

  if (tasks.length < 3) {
    tasks.push({
      id: 'hydration-habit',
      category: 'heat',
      badgeLabel: heat ? `Hydration · ${heat.category}` : 'Hydration habit',
      level: heat?.level ?? null,
      title: 'Keep drinking water with you and sip before feeling thirsty',
      detail: hydrationTip.text,
    })
  }

  if (tasks.length < 3) {
    tasks.push({
      id: 'shade-planning',
      category: 'prevention',
      badgeLabel: 'Afternoon shade',
      level: heat?.level ?? null,
      title: 'Plan errands outside peak afternoon sun (12 PM–4 PM)',
      detail: shadeTip.text,
    })
  }

  if (tasks.length < 3) {
    tasks.push({
      id: 'official-channels-check',
      category: 'air',
      badgeLabel: 'Official check',
      level: airAssessment?.level ?? null,
      title: 'Check NDMA SACHET or IMD for official local advisories',
      detail: 'Model screening covers heat and CAMS air only—always check official warnings before travel or outdoor work.',
    })
  }

  return tasks.slice(0, 3)
}

export function computePreparednessProgress(
  tasks: DashboardTask[],
  completedIds: string[],
): PreparednessProgress {
  const validSet = new Set(completedIds)
  const completedTasks = tasks.filter((task) => validSet.has(task.id))
  const completedCount = completedTasks.length
  const totalCount = tasks.length
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const hasHeatOrPrevention = completedTasks.some((task) => task.category === 'heat' || task.category === 'prevention')
  const hasSecondDomain = completedTasks.some((task) => task.category === 'air') || completedCount >= 2

  const badges: PreparednessBadge[] = [
    {
      id: 'first-step',
      label: 'First Step',
      rule: 'Complete 1 suggested precaution today',
      earned: completedCount >= 1,
    },
    {
      id: 'multi-hazard',
      label: 'Dual-Check Ready',
      rule: 'Complete 2+ precautions across today’s plan',
      earned: hasHeatOrPrevention && hasSecondDomain && completedCount >= 2,
    },
    {
      id: 'daily-plan',
      label: 'Today’s Plan Complete',
      rule: `Complete all ${totalCount} suggested precautions today`,
      earned: totalCount > 0 && completedCount === totalCount,
    },
  ]

  return { completedCount, totalCount, percent, badges }
}
