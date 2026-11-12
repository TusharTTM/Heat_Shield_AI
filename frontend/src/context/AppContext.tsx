import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { regions } from '../data/regions'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface AppContextValue {
  region: string
  setRegion: (region: string) => void
  reducedMotion: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [storedRegion, setRegion] = useLocalStorage('hs-region', 'mumbai')
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const region = regions.some((item) => item.slug === storedRegion) ? storedRegion : 'mumbai'

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.colorScheme = 'light'
  }, [])

  const value = useMemo(() => ({ region, setRegion, reducedMotion }), [region, setRegion, reducedMotion])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
