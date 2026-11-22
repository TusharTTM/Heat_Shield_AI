import type { ReactNode } from 'react'
import { AlertCircle, Info, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { DataStatus, SimpleRiskLevel } from '../types'

export function StatusBadge({ status = 'unavailable', children }: { status?: DataStatus | 'offline' | 'official'; children?: ReactNode }) {
  const labels = { demonstration: 'Demo data', unavailable: 'Unavailable', offline: 'Offline', official: 'Official source', 'weather-model': 'Open-Meteo model', stale: 'Stale cached data', loading: 'Loading weather' }
  return <span className={`badge badge-${status}`}><span className="status-dot" aria-hidden="true" />{children ?? labels[status]}</span>
}

export function RiskBadge({ level, subtle = false }: { level: SimpleRiskLevel; subtle?: boolean }) {
  return <span className={`risk-badge risk-${level}${subtle ? ' risk-subtle' : ''}`}><ShieldCheck size={15} aria-hidden="true" />{level[0].toUpperCase() + level.slice(1)}</span>
}

export function Card({ children, className = '', as: Element = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div' }) {
  return <Element className={`card ${className}`}>{children}</Element>
}

export function CardHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="card-header"><div className="card-title-wrap">{icon && <span className="card-header-icon">{icon}</span>}<div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{action && <div className="card-action">{action}</div>}</div>
}

export function formatWeatherTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }).format(new Date(timestamp))
}

export function InlineNotice({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'danger'; title: string; children: ReactNode }) {
  const Icon = kind === 'info' ? Info : kind === 'warning' ? ShieldAlert : AlertCircle
  return <div className={`inline-notice notice-${kind}`}><Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><p>{children}</p></div></div>
}
