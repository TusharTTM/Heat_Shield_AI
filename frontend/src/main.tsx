import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/oswald/700.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo-narrow/500.css'
// Leaflet's stylesheet is deliberately NOT imported here. No routed screen
// renders a map (RegionMap is only used by the unrouted Maps page), so
// importing it shipped 243 Leaflet selectors to every visitor. Import it from
// RegionMap.tsx if that screen is ever routed again.
import './styles/index.css'
import App from './App'
import { AppProvider } from './context/AppContext'
import { WeatherProvider } from './context/WeatherContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppProvider>
        <WeatherProvider>
          <App />
        </WeatherProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
