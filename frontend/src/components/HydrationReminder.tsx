import { useEffect, useState } from 'react'
import { Droplets, X } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'

const LAST_REMINDER_KEY = 'hs-hydration-last'
const CHECK_EVERY_MS = 30_000

/**
 * In-app hydration nudge. While reminders are on and Heat Shield is open, a
 * dismissible toast appears once per interval; acknowledging it restarts the
 * countdown. No notifications leave the device.
 */
export function HydrationReminder() {
  const { settings } = useSettings()
  const { enabled, intervalMinutes } = settings.hydration
  const [due, setDue] = useState(false)

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
    }
    tick()
    const id = window.setInterval(tick, CHECK_EVERY_MS)
    return () => window.clearInterval(id)
  }, [enabled, intervalMinutes])

  const acknowledge = () => {
    try {
      window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()))
    } catch { /* Storage can be unavailable in private contexts. */ }
    setDue(false)
  }

  if (!enabled || !due) return null

  return <aside className="hydration-toast" role="status" aria-label="Hydration reminder">
    <span className="hydration-toast-icon"><Droplets size={18} aria-hidden="true" /></span>
    <div className="hydration-toast-copy">
      <strong>Hydration reminder</strong>
      <small>Time to drink a glass of water.</small>
    </div>
    <button type="button" className="hydration-toast-done" onClick={acknowledge}>Done</button>
    <button type="button" className="hydration-toast-close" onClick={acknowledge} aria-label="Dismiss hydration reminder">
      <X size={15} aria-hidden="true" />
    </button>
  </aside>
}
