import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

export type TemperatureUnit = 'celsius' | 'fahrenheit'
export type TextSize = 'small' | 'default' | 'large'
export type LanguageCode = 'en' | 'hi' | 'mr' | 'bn' | 'ta' | 'te'

export interface HeatAlertTypes {
  extremeHeat: boolean
  heatIndex: boolean
  airQuality: boolean
  official: boolean
  hotNights: boolean
}

export interface ProfileSettings {
  /** Local, device-only session flag. Heat Shield has no online account. */
  signedIn: boolean
  name: string
  email: string
  /** Avatar image as a data URL. */
  photo: string | null
  useDeviceLocation: boolean
  heatAlerts: {
    earlyWarnings: boolean
    leadHours: number
    types: HeatAlertTypes
    quietHours: { enabled: boolean; start: string; end: string }
  }
  hydration: { enabled: boolean; intervalMinutes: number; browserNotifications: boolean }
  display: {
    unit: TemperatureUnit
    language: LanguageCode
    textSize: TextSize
    highContrast: boolean
  }
}

export const defaultSettings: ProfileSettings = {
  signedIn: true,
  name: '',
  email: '',
  photo: null,
  useDeviceLocation: false,
  heatAlerts: {
    earlyWarnings: true,
    leadHours: 6,
    types: {
      extremeHeat: true,
      heatIndex: true,
      airQuality: true,
      official: true,
      hotNights: false,
    },
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
  },
  hydration: { enabled: false, intervalMinutes: 120, browserNotifications: false },
  display: {
    unit: 'celsius',
    language: 'en',
    textSize: 'default',
    highContrast: false,
  },
}

/** Deep merge for the two-level settings shape, so callers can patch one leaf. */
function mergeSettings(base: ProfileSettings, patch: Partial<ProfileSettings>): ProfileSettings {
  return {
    ...base,
    ...patch,
    heatAlerts: {
      ...base.heatAlerts,
      ...(patch.heatAlerts ?? {}),
      types: { ...base.heatAlerts.types, ...(patch.heatAlerts?.types ?? {}) },
      quietHours: { ...base.heatAlerts.quietHours, ...(patch.heatAlerts?.quietHours ?? {}) },
    },
    hydration: { ...base.hydration, ...(patch.hydration ?? {}) },
    display: { ...base.display, ...(patch.display ?? {}) },
  }
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? celsiusToFahrenheit(celsius) : celsius
}

interface SettingsContextValue {
  settings: ProfileSettings
  patchSettings: (patch: Partial<ProfileSettings>) => void
  replaceSettings: (settings: ProfileSettings) => void
  /** Applies the current unit to a Celsius reading. */
  convertTemp: (celsius: number) => number
  /** Formats a Celsius reading in the current unit, without the degree symbol. */
  formatTemp: (celsius: number, digits?: number) => string
  /** °C or °F for the current unit. */
  tempSymbol: string
  /** "Celsius" or "Fahrenheit" for the current unit. */
  tempName: string
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage<ProfileSettings>('hs-settings-v1', defaultSettings)
  // Tolerate partial or older stored shapes so one bad value never blanks the page.
  const settings = useMemo(() => mergeSettings(defaultSettings, stored ?? {}), [stored])

  const patchSettings = useCallback((patch: Partial<ProfileSettings>) => {
    setStored((previous) => mergeSettings(mergeSettings(defaultSettings, previous ?? {}), patch))
  }, [setStored])

  const replaceSettings = useCallback((next: ProfileSettings) => {
    setStored(mergeSettings(defaultSettings, next))
  }, [setStored])

  useEffect(() => {
    const root = document.documentElement
    if (settings.display.textSize === 'default') root.removeAttribute('data-text-size')
    else root.dataset.textSize = settings.display.textSize
  }, [settings.display.textSize])

  useEffect(() => {
    document.documentElement.dataset.contrast = settings.display.highContrast ? 'high' : 'default'
  }, [settings.display.highContrast])

  useEffect(() => {
    document.documentElement.lang = settings.display.language
  }, [settings.display.language])

  const value = useMemo<SettingsContextValue>(() => {
    const unit = settings.display.unit
    const convertTemp = (celsius: number) => convertTemperature(celsius, unit)
    return {
      settings,
      patchSettings,
      replaceSettings,
      convertTemp,
      formatTemp: (celsius, digits = 1) => convertTemp(celsius).toFixed(digits),
      tempSymbol: unit === 'fahrenheit' ? '°F' : '°C',
      tempName: unit === 'fahrenheit' ? 'Fahrenheit' : 'Celsius',
    }
  }, [settings, patchSettings, replaceSettings])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside SettingsProvider')
  return context
}
