import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Info, X } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { useDeviceLocationSync } from '../hooks/useDeviceLocation'
import { HydrationReminder } from './HydrationReminder'
import { getDocumentTitle } from '../navigation'
import { useT } from '../i18n'

/**
 * Sections that used to exist and were folded into the dashboard. The router
 * sends every one of them home, so without this notice a bookmarked or shared
 * old URL silently changes what the reader is looking at.
 */
const RETIRED_SECTIONS = new Set([
  '/monitor',
  '/disaster-monitor',
  '/forecast',
  '/maps',
  '/alerts',
  '/safety',
  '/about',
])

export function Layout() {
  const location = useLocation()
  const { settings } = useSettings()
  const mainContent = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)
  const t = useT()
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null)
  // Read from the first location only: a later alert dismissal must not re-arm it.
  const retiredPath = useRef(
    RETIRED_SECTIONS.has(location.pathname.replace(/\/+$/, '')) ? location.pathname : null,
  ).current
  const showRetiredNotice = retiredPath !== null && dismissedNotice !== retiredPath

  useDeviceLocationSync()

  useEffect(() => {
    document.title = getDocumentTitle(location.pathname, settings.display.language, location.search)
    window.scrollTo(0, 0)
    if (previousPath.current !== location.pathname) {
      mainContent.current?.focus({ preventScroll: true })
      previousPath.current = location.pathname
    }
  }, [location.pathname, location.search, settings.display.language])

  return <div className="site-shell dashboard-shell uploaded-site-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <main ref={mainContent} id="main-content" className="page-content uploaded-page-content" tabIndex={-1}>
      {showRetiredNotice && <div className="retired-section-notice" role="status">
        <Info size={17} aria-hidden="true" />
        <p>
          <strong>{t('retired.title')}</strong>{' '}
          {t('retired.body', { path: retiredPath })}
        </p>
        <button
          type="button"
          className="retired-section-dismiss"
          aria-label={t('retired.dismiss')}
          onClick={() => setDismissedNotice(retiredPath)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>}
      <Outlet />
    </main>
    <HydrationReminder />
  </div>
}
