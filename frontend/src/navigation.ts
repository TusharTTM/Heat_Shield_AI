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

export function getDocumentTitle(pathname: string): string {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/assistant': 'AI Assistant',
    '/menu': 'Menu',
  }
  return `${titles[normalized] ?? 'Dashboard'} · Heat Shield AI`
}
