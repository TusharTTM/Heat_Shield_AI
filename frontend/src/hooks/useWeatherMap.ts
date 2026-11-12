import { useCallback, useEffect, useRef, useState } from 'react'
import { getAirQuality, getCurrentWeather } from '../api/openMeteo'
import { regions } from '../data/regions'
import type { AirQualityResult, CurrentWeatherResult } from '../types'

interface WeatherMapState {
  status: 'loading' | 'ready' | 'error'
  airStatus: 'loading' | 'ready' | 'error'
  entries: Partial<Record<string, CurrentWeatherResult>>
  airEntries: Partial<Record<string, AirQualityResult>>
  unavailable: string[]
  airUnavailable: string[]
  refresh: () => void
}

export function useWeatherMap(): WeatherMapState {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<Omit<WeatherMapState, 'refresh'>>({ status: 'loading', airStatus: 'loading', entries: {}, airEntries: {}, unavailable: [], airUnavailable: [] })
  const mounted = useRef(true)

  const refresh = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    mounted.current = true
    let active = true
    setState((previous) => ({ status: 'loading', airStatus: 'loading', entries: previous.entries, airEntries: previous.airEntries, unavailable: [], airUnavailable: [] }))
    const force = version > 0
    const entries: Partial<Record<string, CurrentWeatherResult>> = {}
    const airEntries: Partial<Record<string, AirQualityResult>> = {}
    const unavailable: string[] = []
    const airUnavailable: string[] = []
    let cursor = 0
    const worker = async () => {
      while (cursor < regions.length) {
        const region = regions[cursor]
        cursor += 1
        const [weather, air] = await Promise.allSettled([getCurrentWeather(region, force), getAirQuality(region, force)])
        if (weather.status === 'fulfilled') entries[region.slug] = weather.value
        else unavailable.push(region.name)
        if (air.status === 'fulfilled') airEntries[region.slug] = air.value
        else airUnavailable.push(region.name)
      }
    }
    Promise.all([worker(), worker()]).then(() => {
      if (active && mounted.current) setState({
        status: Object.keys(entries).length > 0 ? 'ready' : 'error',
        airStatus: Object.keys(airEntries).length > 0 ? 'ready' : 'error',
        entries, airEntries, unavailable, airUnavailable,
      })
    })
    return () => { active = false; mounted.current = false }
  }, [version])

  return { ...state, refresh }
}
