import { useEffect, useRef, useState } from 'react'
import { BellRing, Menu, ShieldCheck, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getRegion } from '../data/regions'
import { getDocumentTitle, navigation } from '../navigation'
import { CityPicker } from './CityPicker'
import { DemoBanner } from './ui'
import { HashDisclosureOpener } from './HashDisclosureOpener'

export function Layout() {
  const { region } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const isDashboard = location.pathname === '/'
  const menuButton = useRef<HTMLButtonElement>(null)
  const mainContent = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
    if (previousPath.current !== location.pathname) {
      mainContent.current?.focus({ preventScroll: true })
      previousPath.current = location.pathname
    }
  }, [location.pathname])

  useEffect(() => {
    document.title = getDocumentTitle(location.pathname, getRegion(region).name)
  }, [location.pathname, region])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1281px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false)
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  const closeMobileNavigation = (path: string) => {
    setMenuOpen(false)
    if (location.pathname === path) menuButton.current?.focus()
  }

  return <div className={`site-shell${isDashboard ? ' dashboard-shell' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className={`site-header${isDashboard ? ' dashboard-site-header' : ''}`}>
      <div className="nav-container">
        <Link to="/" className="brand" aria-label="HeatShield AI home"><span className="brand-mark"><ShieldCheck size={24} aria-hidden="true" /></span><span>{isDashboard ? 'Heat Shield' : 'HeatShield'} <strong>AI</strong></span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">{navigation.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span></NavLink>)}</nav>
        <div className="nav-actions">
          {isDashboard ? <Link to="/alerts" className="dashboard-notify"><BellRing size={18} aria-hidden="true" /><span>Notify</span></Link> : <CityPicker />}
          <button ref={menuButton} className={`menu-button${isDashboard ? ' dashboard-menu-button' : ''}`} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
        </div>
      </div>
      <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{navigation.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => closeMobileNavigation(item.path)} className={({ isActive }) => isActive ? 'mobile-nav-link active' : 'mobile-nav-link'}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span></NavLink>)}</nav>
    </header>
    <HashDisclosureOpener />
    {!isDashboard && <DemoBanner />}
    <main ref={mainContent} id="main-content" className={`page-content${isDashboard ? ' dashboard-page-content' : ''}`} tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><span>HeatShield AI · Environmental screening, explained</span><span>Weather + CAMS air models: Open-Meteo · Check official local warnings</span></footer>
  </div>
}
