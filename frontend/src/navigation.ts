import { translate, type MessageKey } from './i18n'
import type { LanguageCode } from './context/SettingsContext'
import { DAY_TITLE_KEYS, METRIC_TITLE_KEYS, isDayId, isMetricId } from './data/metricDetails'
import { LayoutDashboard, MessageCircle, Menu as MenuIcon, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

export const navigation: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'AI Assistant', path: '/assistant', icon: MessageCircle },
  { label: 'Menu', path: '/menu', icon: MenuIcon },
]

const titleKeys: Record<string, MessageKey> = {
  '/': 'nav.dashboard',
  '/assistant': 'nav.assistant',
  '/menu': 'nav.menu',
  '/profile': 'nav.profile',
}

/**
 * Document title for any app view. Metric detail views name their metric and
 * selected day so multiple planner tabs stay distinguishable; unknown paths
 * fall back to the dashboard title (the router redirects them home).
 */
export function getDocumentTitle(pathname: string, language: LanguageCode = 'en', search = ''): string {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
  const metricMatch = /^\/metric\/([a-z-]+)$/.exec(normalized)
  if (metricMatch && isMetricId(metricMatch[1])) {
    const metricTitle = translate(language, METRIC_TITLE_KEYS[metricMatch[1]])
    const day = new URLSearchParams(search).get('day')
    const dayTitle = isDayId(day) ? translate(language, DAY_TITLE_KEYS[day]) : null
    return `${metricTitle}${dayTitle ? ` · ${dayTitle}` : ''} · Heat Shield AI`
  }
  return `${translate(language, titleKeys[normalized] ?? 'nav.dashboard')} · Heat Shield AI`
}
