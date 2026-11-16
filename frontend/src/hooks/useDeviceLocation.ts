import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useSettings } from '../context/SettingsContext'
import { nearestRegion } from '../data/regions'

/**
 * When "Use device location" is on and the browser has already granted
 * permission, quietly snap the app to the nearest listed city on load.
 * Never triggers a permission prompt on its own — that stays in the
 * Profile → Location switch.
 */
export function useDeviceLocationSync() {
  const { setRegion } = useApp()
  const { settings } = useSettings()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current || !settings.useDeviceLocation || !navigator.geolocation) return
    attempted.current = true
    const moveToNearest = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => setRegion(nearestRegion(position.coords.latitude, position.coords.longitude).slug),
        () => { /* Stay on the current city if the reading fails. */ },
        { timeout: 10_000, maximumAge: 300_000 },
      )
    }
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((status) => { if (status.state === 'granted') moveToNearest() })
        .catch(() => { /* Without a permission answer, leave the stored city in place. */ })
    }
  }, [settings.useDeviceLocation, setRegion])
}
