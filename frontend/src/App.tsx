import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Assistant from './pages/Assistant'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'

export default function App() {
  return <Routes>
    <Route element={<Layout />}>
      <Route index element={<Dashboard />} />
      <Route path="assistant" element={<Assistant />} />
      <Route path="menu" element={<Menu />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
