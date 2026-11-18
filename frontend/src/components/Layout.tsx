import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { useDeviceLocationSync } from '../hooks/useDeviceLocation'
import { HydrationReminder } from './HydrationReminder'
import { getDocumentTitle } from '../navigation'

export function Layout() {
  const location = useLocation()
  const { settings } = useSettings()
  const mainContent = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)

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
      <Outlet />
    </main>
    <HydrationReminder />
  </div>
}
