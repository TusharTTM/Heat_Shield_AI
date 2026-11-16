/**
 * Quiet hours from the Profile → Heat alerts settings.
 *
 * The window may cross midnight ("22:00" to "07:00"). During the window, in-app
 * reminder toasts and browser notifications are held back; the dashboard's
 * readings and alerts stay visible (critical safety information is never hidden).
 */
export interface QuietHours {
  enabled: boolean
  /** "HH:MM" local time. */
  start: string
  /** "HH:MM" local time. */
  end: string
}

function minutesOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function isWithinQuietHours(now: Date, quietHours: QuietHours): boolean {
  if (!quietHours.enabled) return false
  const start = minutesOfDay(quietHours.start)
  const end = minutesOfDay(quietHours.end)
  if (start === null || end === null || start === end) return false
  const current = now.getHours() * 60 + now.getMinutes()
  // An overnight window wraps past midnight; a daytime window does not.
  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}
