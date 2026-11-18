import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { SettingsProvider } from './context/SettingsContext'
import Assistant from './pages/Assistant'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'
import MetricDetail from './pages/MetricDetail'
import Profile from './pages/Profile'

export default function App() {
  return <SettingsProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="metric/:metricId" element={<MetricDetail />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="menu" element={<Menu />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </SettingsProvider>
}
