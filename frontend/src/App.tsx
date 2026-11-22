import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { SettingsProvider } from './context/SettingsContext'
import Dashboard from './pages/Dashboard'

/**
 * Only the dashboard is in the entry chunk. Every other screen is a separate
 * chunk, so visiting the dashboard never downloads Chart.js (148 kB) just to
 * open a metric chart later. Dashboard stays eager because it is the landing
 * view and splitting it would add a round trip before any content appears.
 *
 * `pages/` are default exports, so the import specifier is unwrapped for
 * `lazy()`, which requires a module with a `default` export.
 */
const MetricDetail = lazy(() => import('./pages/MetricDetail'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Menu = lazy(() => import('./pages/Menu'))
const Profile = lazy(() => import('./pages/Profile'))

function RouteFallback() {
  // Matches the app's own vocabulary: a titled placeholder, not a spinner alone
  // (a bare spinner gives a screen reader nothing to announce).
  return <p className="route-loading" role="status">Loading this screen…</p>
}

export default function App() {
  return <SettingsProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="metric/:metricId" element={<Suspense fallback={<RouteFallback />}><MetricDetail /></Suspense>} />
        <Route path="assistant" element={<Suspense fallback={<RouteFallback />}><Assistant /></Suspense>} />
        <Route path="menu" element={<Suspense fallback={<RouteFallback />}><Menu /></Suspense>} />
        <Route path="profile" element={<Suspense fallback={<RouteFallback />}><Profile /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </SettingsProvider>
}
