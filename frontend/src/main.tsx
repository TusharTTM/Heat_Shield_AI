import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/oswald/700.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo-narrow/500.css'
import 'leaflet/dist/leaflet.css'
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
