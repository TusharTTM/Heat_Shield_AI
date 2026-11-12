import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getAirQuality, getWeather } from '../api/openMeteo'
import { getRegion } from '../data/regions'
import { useApp } from './AppContext'
import type { AirQualityData, WeatherData } from '../types'

interface WeatherState {
  status: 'loading' | 'ready' | 'error'
  data: WeatherData | null
  error: string | null
  freshness: 'current' | 'stale'
  fromCache: boolean
  warning: string | null
  airStatus: 'loading' | 'ready' | 'error'
  airQuality: AirQualityData | null
  airError: string | null
  airFreshness: 'current' | 'stale'
  airFromCache: boolean
  airWarning: string | null
  refresh: () => void
}

type ProviderState = Omit<WeatherState, 'refresh'> & { region: string }
const WeatherContext = createContext<WeatherState | null>(null)

function initialState(region: string): ProviderState {
  return {
    region, status: 'loading', data: null, error: null, freshness: 'current', fromCache: false, warning: null,
    airStatus: 'loading', airQuality: null, airError: null, airFreshness: 'current', airFromCache: false, airWarning: null,
  }
}

export function WeatherProvider({ children }: { children: ReactNode }) {
  const { region } = useApp()
  const [version, setVersion] = useState(0)
  const forceNext = useRef(false)
  const [state, setState] = useState<ProviderState>(() => initialState(region))

  const refresh = useCallback(() => {
    forceNext.current = true
    setVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    const selected = getRegion(region)
    const force = forceNext.current
    forceNext.current = false
    setState(initialState(region))
    getWeather(selected, force).then((result) => {
      if (active) setState((previous) => ({
        ...previous, status: 'ready', data: result.data, error: null,
        freshness: result.freshness, fromCache: result.fromCache, warning: result.warning ?? null,
      }))
    }).catch((error: unknown) => {
      if (active) setState((previous) => ({
        ...previous, status: 'error', data: null, freshness: 'current', fromCache: false, warning: null,
        error: error instanceof Error ? error.message : 'Open-Meteo weather is unavailable.',
      }))
    })
    getAirQuality(selected, force).then((result) => {
      if (active) setState((previous) => ({
        ...previous, airStatus: 'ready', airQuality: result.data, airError: null,
        airFreshness: result.freshness, airFromCache: result.fromCache, airWarning: result.warning ?? null,
      }))
    }).catch((error: unknown) => {
      if (active) setState((previous) => ({
        ...previous, airStatus: 'error', airQuality: null, airFreshness: 'current', airFromCache: false, airWarning: null,
        airError: error instanceof Error ? error.message : 'Open-Meteo air quality is unavailable.',
      }))
    })
    return () => { active = false }
  }, [region, version])

  const value = useMemo<WeatherState>(() => {
    if (state.region !== region) return { ...initialState(region), refresh }
    const { region: _stateRegion, ...current } = state
    void _stateRegion
    return { ...current, refresh }
  }, [state, region, refresh])
  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
}

export function useWeather() {
  const context = useContext(WeatherContext)
  if (!context) throw new Error('useWeather must be used inside WeatherProvider')
  return context
}
