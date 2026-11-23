import { useEffect, useRef, useState } from 'react'
import { Droplets, X } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { isWithinQuietHours } from '../data/quietHours'
import { useT } from '../i18n'

const LAST_REMINDER_KEY = 'hs-hydration-last'
const CHECK_EVERY_MS = 30_000

/**
 * In-app hydration nudge. While reminders are on and Heat Shield is open, a
 * dismissible toast appears once per interval; acknowledging it restarts the
 * countdown. Quiet hours hold the toast and any browser notification back,
 * and the schedule resumes when the window ends. Nothing leaves the device.
 */
export function HydrationReminder() {
  const t = useT()
  const { settings } = useSettings()
  const { enabled, intervalMinutes, browserNotifications } = settings.hydration
  const [due, setDue] = useState(false)
  const [, forceCheck] = useState(0)
  const notifiedFor = useRef<string | null>(null)

  const muted = isWithinQuietHours(new Date(), settings.heatAlerts.quietHours)
  const show = enabled && due && !muted

  useEffect(() => {
    if (!enabled) {
      setDue(false)
      return
    }
    const intervalMs = intervalMinutes * 60_000
    const readLast = () => {
      const stored = Number(window.localStorage.getItem(LAST_REMINDER_KEY))
      return Number.isFinite(stored) && stored > 0 ? stored : Date.now()
    }
    if (!window.localStorage.getItem(LAST_REMINDER_KEY)) {
      window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()))
    }
    const tick = () => {
      if (Date.now() - readLast() >= intervalMs) setDue(true)
      // Re-render on the same beat so quiet hours are re-evaluated.
      forceCheck((value) => value + 1)
    }
    tick()
    const id = window.setInterval(tick, CHECK_EVERY_MS)
    return () => window.clearInterval(id)
  }, [enabled, intervalMinutes])

  // One browser notification per due reminder, quiet hours permitting.
  useEffect(() => {
    if (!show || !browserNotifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const last = window.localStorage.getItem(LAST_REMINDER_KEY) ?? 'first'
    if (notifiedFor.current === last) return
    notifiedFor.current = last
    try {
      new Notification(t('toast.hydrationTitle'), { body: t('toast.hydrationBody') })
    } catch { /* Notifications can fail in restricted contexts; the toast still shows. */ }
  }, [show, browserNotifications, t])

  const acknowledge = () => {
    try {
      window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()))
    } catch { /* Storage can be unavailable in private contexts. */ }
    setDue(false)
  }

  if (!show) return null

  return <aside className="hydration-toast" role="status" aria-label={t('toast.hydrationTitle')}>
    <span className="hydration-toast-icon"><Droplets size={18} aria-hidden="true" /></span>
    <div className="hydration-toast-copy">
      <strong>{t('toast.hydrationTitle')}</strong>
      <small>{t('toast.hydrationBody')}</small>
    </div>
    <button type="button" className="hydration-toast-done" onClick={acknowledge}>{t('toast.done')}</button>
    <button type="button" className="hydration-toast-close" onClick={acknowledge} aria-label={t('toast.dismiss')}>
      <X size={16} aria-hidden="true" />
    </button>
  </aside>
}
