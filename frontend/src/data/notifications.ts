import { alertIsExpired, type AssessmentAlert } from './alerts'

const STORAGE_KEY = 'hs-assessment-notifications-v1'
interface NotificationRecord { signature: string; notifiedAt: string; validUntil: string }
type NotificationHistory = Record<string, NotificationRecord>

function readHistory(): NotificationHistory {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as NotificationHistory
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Sends only active, changed assessments and records successful browser notifications locally. */
export function sendAssessmentNotifications(alerts: AssessmentAlert[]): { sent: number; unchanged: number; expired: number; failed: number } {
  if (notificationPermission() !== 'granted') return { sent: 0, unchanged: 0, expired: 0, failed: 0 }
  const history = readHistory()
  const now = Date.now()
  let sent = 0, unchanged = 0, expired = 0, failed = 0
  for (const alert of alerts) {
    if (alertIsExpired(alert, now)) { expired += 1; continue }
    const previous = history[alert.id]
    if (previous?.signature === alert.fingerprint && Date.parse(previous.validUntil) > now) { unchanged += 1; continue }
    try {
      const notification = new Notification(alert.title, {
        body: `${alert.location}: ${alert.reason}\nRecommended action: ${alert.action}`,
        tag: alert.id,
      })
      void notification
      history[alert.id] = { signature: alert.fingerprint, notifiedAt: new Date(now).toISOString(), validUntil: alert.validUntil }
      sent += 1
    } catch {
      failed += 1
    }
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)) } catch { /* Browser delivery still works without storage. */ }
  return { sent, unchanged, expired, failed }
}
