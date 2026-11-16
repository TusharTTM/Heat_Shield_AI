import { translate, type MessageKey } from './i18n'
import type { LanguageCode } from './context/SettingsContext'
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

export function getDocumentTitle(pathname: string, language: LanguageCode = 'en'): string {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
  return `${translate(language, titleKeys[normalized] ?? 'nav.dashboard')} · Heat Shield AI`
}
