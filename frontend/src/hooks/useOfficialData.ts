import { useCallback, useEffect, useState } from 'react'
import {
  getOfficialAirQualityBundle, getOfficialAlerts, OFFICIAL_API_CONFIGURED,
  type OfficialAirQualityBundle, type OfficialAlertsData,
} from '../api/official'

export interface OfficialSourceState<T> {
  status: 'unconfigured' | 'loading' | 'ready' | 'error'
  data: T | null
  error: string | null
  refresh: () => void
}

function useOfficialSource<T>(slug: string, loader: (slug: string) => Promise<T>): OfficialSourceState<T> {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<Omit<OfficialSourceState<T>, 'refresh'>>({
    status: OFFICIAL_API_CONFIGURED ? 'loading' : 'unconfigured', data: null, error: null,
  })
  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  useEffect(() => {
    let active = true
    if (!OFFICIAL_API_CONFIGURED) {
      setState({ status: 'unconfigured', data: null, error: null })
      return () => { active = false }
    }
    setState({ status: 'loading', data: null, error: null })
    loader(slug).then((data) => {
      if (active) setState({ status: 'ready', data, error: null })
    }).catch((error: unknown) => {
      if (active) setState({
        status: 'error', data: null,
        error: error instanceof Error ? error.message : 'The official source could not be retrieved.',
      })
    })
    return () => { active = false }
  }, [slug, loader, version])
  return { ...state, refresh }
}

const alertsLoader = (slug: string) => getOfficialAlerts(slug)
const airQualityLoader = (slug: string) => getOfficialAirQualityBundle(slug)

export function useOfficialAlerts(slug: string): OfficialSourceState<OfficialAlertsData> {
  return useOfficialSource(slug, alertsLoader)
}

export function useOfficialAirQuality(slug: string): OfficialSourceState<OfficialAirQualityBundle> {
  return useOfficialSource(slug, airQualityLoader)
}
