import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import DisasterMonitor from './pages/DisasterMonitor'
import Alerts from './pages/Alerts'
import Forecast from './pages/Forecast'
import Maps from './pages/Maps'
import Safety from './pages/Safety'
import About from './pages/About'
import NotFound from './pages/NotFound'

const legacyRedirects = [
  ['weather', '/'],
  ['heatwave', '/monitor'],
  ['risk', '/maps'],
  ['hotspots', '/maps'],
  ['recommendations', '/safety'],
  ['health', '/safety'],
  ['energy', '/safety'],
  ['water', '/safety'],
  ['cooling-centers', '/safety'],
  ['assistant', '/safety'],
  ['history', '/about'],
  ['sensors', '/about'],
  ['community', '/about'],
  ['admin', '/about'],
  ['contact', '/about'],
  ['profile', '/about'],
  ['settings', '/about'],
]

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<Dashboard />} />
    <Route path="monitor" element={<DisasterMonitor />} />
    <Route path="alerts" element={<Alerts />} />
    <Route path="forecast" element={<Forecast />} />
    <Route path="maps" element={<Maps />} />
    <Route path="safety" element={<Safety />} />
    <Route path="about" element={<About />} />
    {legacyRedirects.map(([from, to]) => <Route key={from} path={from} element={<Navigate to={to} replace />} />)}
    <Route path="*" element={<NotFound />} />
  </Route></Routes>
}
