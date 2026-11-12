import { BellRing, BookOpenCheck, Info, LayoutDashboard, LineChart, Map, Siren, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

export const navigation: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Disaster Monitor', path: '/monitor', icon: Siren },
  { label: 'Forecast', path: '/forecast', icon: LineChart },
  { label: 'Risk Map', path: '/maps', icon: Map },
  { label: 'Alerts', path: '/alerts', icon: BellRing },
  { label: 'Safety Guide', path: '/safety', icon: BookOpenCheck },
  { label: 'About', path: '/about', icon: Info },
]

export function getDocumentTitle(pathname: string, regionName: string): string {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
  const titles: Record<string, string> = {
    '/': `Environmental dashboard for ${regionName}`,
    '/monitor': `Disaster Monitor for ${regionName}`,
    '/forecast': `5-day forecast for ${regionName}`,
    '/maps': `Heat and air-quality risk map for ${regionName}`,
    '/alerts': `Alerts for ${regionName}`,
    '/safety': `Safety Guide for ${regionName}`,
    '/about': 'About',
  }
  return `${titles[normalized] ?? 'Page not found'} · HeatShield AI`
}
