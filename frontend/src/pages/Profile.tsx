import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  BellRing,
  Check,
  Database,
  Droplets,
  LogOut,
  MapPin,
  MonitorCog,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { defaultSettings, useSettings, type ProfileSettings } from '../context/SettingsContext'
import { getRegion, regions } from '../data/regions'

const LANGUAGE_LABELS: Array<{ value: ProfileSettings['display']['language']; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
  { value: 'mr', label: 'मराठी (Marathi)' },
  { value: 'bn', label: 'বাংলা (Bengali)' },
  { value: 'ta', label: 'தமிழ் (Tamil)' },
  { value: 'te', label: 'తెలుగు (Telugu)' },
]

const HYDRATION_INTERVALS = [
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 180, label: 'Every 3 hours' },
  { value: 240, label: 'Every 4 hours' },
]

const LEAD_TIMES = [1, 3, 6, 12, 24]

const ALERT_TYPE_ROWS: Array<{ key: keyof ProfileSettings['heatAlerts']['types']; label: string; description: string }> = [
  { key: 'extremeHeat', label: 'Extreme heat & heat waves', description: 'Spikes and multi-day heat events' },
  { key: 'heatIndex', label: 'High heat index', description: 'When the feels-like temperature turns risky' },
  { key: 'airQuality', label: 'Poor air quality', description: 'Unhealthy air that compounds heat stress' },
  { key: 'official', label: 'Official IMD & SACHET warnings', description: 'Government-issued alerts for your area' },
  { key: 'hotNights', label: 'Hot nights', description: 'Nights that stay too warm to recover' },
]

const MAX_PHOTO_BYTES = 300 * 1024

function distanceInKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function nearestRegion(lat: number, lon: number) {
  return regions.reduce((best, region) =>
    distanceInKm(lat, lon, region.latitude, region.longitude) < distanceInKm(lat, lon, best.latitude, best.longitude)
      ? region
      : best)
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return parts.slice(0, 2).map((part) => part[0]!.toLocaleUpperCase()).join('')
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`settings-switch${checked ? ' is-on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="settings-switch-thumb" aria-hidden="true" />
  </button>
}

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
}) {
  return <div className="settings-segmented" role="group" aria-label={label}>
    {options.map((option) => <button
      key={String(option.value)}
      type="button"
      aria-pressed={option.value === value}
      onClick={() => onChange(option.value)}
    >{option.label}</button>)}
  </div>
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="settings-row">
    <div className="settings-row-copy">
      <strong>{title}</strong>
      {description && <small>{description}</small>}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
}

function SettingsSection({ icon: Icon, title, description, children }: {
  icon: typeof MapPin
  title: string
  description: string
  children: ReactNode
}) {
  return <section className="settings-section" aria-labelledby={`settings-${title.replace(/\W+/g, '-').toLowerCase()}`}>
    <div className="settings-section-heading">
      <span className="settings-section-icon"><Icon size={18} aria-hidden="true" /></span>
      <div>
        <h2 id={`settings-${title.replace(/\W+/g, '-').toLowerCase()}`}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    <div className="settings-section-body">{children}</div>
  </section>
}

export default function Profile() {
  const navigate = useNavigate()
  const { region, setRegion } = useApp()
  const { settings, patchSettings, replaceSettings, tempSymbol } = useSettings()
  const { heatAlerts, hydration, display } = settings
  const fileInput = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState('')
  const [deviceLocationError, setDeviceLocationError] = useState('')
  const [deviceLocationBusy, setDeviceLocationBusy] = useState(false)
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('unsupported')
  const [clearArmed, setClearArmed] = useState(false)
  const [dataNote, setDataNote] = useState('')

  useEffect(() => {
    let cancelled = false
    let status: PermissionStatus | null = null
    const sync = () => {
      if (!cancelled && status) setPermissionState(status.state as typeof permissionState)
    }
    if (!navigator.permissions?.query) {
      setPermissionState('unsupported')
      return
    }
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      status = result
      sync()
      status.addEventListener('change', sync)
    }).catch(() => setPermissionState('unsupported'))
    return () => {
      cancelled = true
      status?.removeEventListener('change', sync)
    }
  }, [])

  const selectedRegion = getRegion(region)

  const displayName = settings.name.trim() || 'Your profile'
  const initials = initialsOf(settings.name)

  const useDeviceLocation = (enable: boolean) => {
    setDeviceLocationError('')
    if (!enable) {
      patchSettings({ useDeviceLocation: false })
      return
    }
    if (!navigator.geolocation) {
      setDeviceLocationError('This browser cannot share its location. Pick a city instead.')
      return
    }
    setDeviceLocationBusy(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearest = nearestRegion(position.coords.latitude, position.coords.longitude)
        setRegion(nearest.slug)
        patchSettings({ useDeviceLocation: true })
        setDeviceLocationBusy(false)
      },
      () => {
        setDeviceLocationError('Location permission was refused. Allow it in your browser settings, or pick a city manually.')
        patchSettings({ useDeviceLocation: false })
        setDeviceLocationBusy(false)
      },
      { timeout: 10_000 },
    )
  }

  const onPhotoSelected = (file: File | undefined) => {
    setPhotoError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file (PNG or JPEG).')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Please choose an image under 300 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => patchSettings({ photo: typeof reader.result === 'string' ? reader.result : null })
    reader.onerror = () => setPhotoError('That image could not be read. Try another one.')
    reader.readAsDataURL(file)
  }

  const requestPermission = () => {
    setDeviceLocationError('')
    if (!navigator.geolocation) {
      setPermissionState('unsupported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      () => setPermissionState('granted'),
      () => setPermissionState('denied'),
      { timeout: 10_000 },
    )
  }

  const downloadData = () => {
    const payload: Record<string, unknown> = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith('hs-')) continue
      try {
        payload[key] = JSON.parse(localStorage.getItem(key) ?? 'null')
      } catch {
        payload[key] = localStorage.getItem(key)
      }
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: payload }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'heat-shield-data.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setDataNote('Your data file has been downloaded.')
  }

  const clearLocalData = () => {
    if (!clearArmed) {
      setClearArmed(true)
      return
    }
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith('hs-')) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
    replaceSettings(defaultSettings)
    setClearArmed(false)
    setDataNote('Local data cleared from this device.')
  }

  const signOut = () => {
    patchSettings({ signedIn: false })
    navigate('/')
  }

  const permissionLabel = useMemo(() => ({
    granted: 'Allowed — this browser may share your location.',
    denied: 'Blocked — your browser is refusing location requests.',
    prompt: 'Not decided yet — the browser will ask when needed.',
    unsupported: 'This browser cannot report location permission.',
  } as const)[permissionState], [permissionState])

  return <div className="profile-page">
    <header className="profile-topbar">
      <Link to="/" className="profile-back-link" aria-label="Back to Dashboard">
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <h1>Profile</h1>
      <Link to="/" className="profile-home-link">Dashboard</Link>
    </header>

    <section className="profile-card" aria-label="Profile">
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {settings.photo
            ? <img src={settings.photo} alt="" />
            : initials
              ? <span className="profile-avatar-initials">{initials}</span>
              : <UserRound size={28} />}
        </span>
        <div className="profile-identity-copy">
          <strong>{settings.signedIn ? displayName : 'Signed out'}</strong>
          <small>{settings.signedIn ? (settings.email || 'Add your email below') : 'Your details stay on this device.'}</small>
        </div>
        {settings.signedIn && <div className="profile-photo-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            aria-label="Profile photo"
            onChange={(event) => onPhotoSelected(event.target.files?.[0])}
          />
          <button type="button" className="profile-button ghost" onClick={() => fileInput.current?.click()}>Change photo</button>
          {settings.photo && <button type="button" className="profile-button ghost" onClick={() => { setPhotoError(''); patchSettings({ photo: null }) }}>
            <X size={14} aria-hidden="true" />Remove
          </button>}
        </div>}
      </div>
      {photoError && <p className="profile-note error" role="alert">{photoError}</p>}

      {settings.signedIn
        ? <div className="profile-fields">
          <label className="profile-field">
            <span>Name</span>
            <input
              type="text"
              value={settings.name}
              placeholder="Your name"
              autoComplete="name"
              onChange={(event) => patchSettings({ name: event.target.value })}
            />
          </label>
          <label className="profile-field">
            <span>Email</span>
            <input
              type="email"
              value={settings.email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => patchSettings({ email: event.target.value })}
            />
          </label>
        </div>
        : <div className="profile-signin">
          <p className="profile-note">Sign in to keep your name, photo, and email on this device. Heat Shield has no online account — nothing is uploaded.</p>
          <button type="button" className="profile-button primary" onClick={() => patchSettings({ signedIn: true })}>Sign in</button>
        </div>}
    </section>

    <SettingsSection icon={MapPin} title="Location" description="Where Heat Shield watches the weather for you.">
      <SettingRow title="Default city" description={`Currently ${selectedRegion.name}, ${selectedRegion.state}`}>
        <select
          className="settings-select"
          aria-label="Default city"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        >
          {regions.map((item) => <option key={item.slug} value={item.slug}>{item.name}, {item.state}</option>)}
        </select>
      </SettingRow>
      <SettingRow title="Use device location" description="Match the nearest city to where you are right now">
        <Switch checked={settings.useDeviceLocation} onChange={useDeviceLocation} label="Use device location" />
      </SettingRow>
      {deviceLocationBusy && <p className="profile-note">Finding the nearest city…</p>}
      {deviceLocationError && <p className="profile-note error" role="alert">{deviceLocationError}</p>}
    </SettingsSection>

    <SettingsSection icon={BellRing} title="Heat alerts" description="Early warnings about heat and air quality.">
      <SettingRow title="Early warnings" description="A heads-up before conditions deteriorate">
        <Switch
          checked={heatAlerts.earlyWarnings}
          onChange={(earlyWarnings) => patchSettings({ heatAlerts: { ...heatAlerts, earlyWarnings } })}
          label="Early warnings"
        />
      </SettingRow>
      <SettingRow title="Alert lead time" description="How far in advance to warn you">
        <select
          className="settings-select"
          aria-label="Alert lead time"
          value={heatAlerts.leadHours}
          disabled={!heatAlerts.earlyWarnings}
          onChange={(event) => patchSettings({ heatAlerts: { ...heatAlerts, leadHours: Number(event.target.value) } })}
        >
          {LEAD_TIMES.map((hours) => <option key={hours} value={hours}>{hours} hour{hours > 1 ? 's' : ''} ahead</option>)}
        </select>
      </SettingRow>
      <fieldset className="settings-fieldset">
        <legend>Alert types</legend>
        <ul className="settings-check-list">
          {ALERT_TYPE_ROWS.map((row) => <li key={row.key}>
            <label>
              <input
                type="checkbox"
                checked={heatAlerts.types[row.key]}
                onChange={(event) => patchSettings({
                  heatAlerts: { ...heatAlerts, types: { ...heatAlerts.types, [row.key]: event.target.checked } },
                })}
              />
              <span className="settings-checkmark" aria-hidden="true"><Check size={13} /></span>
              <span className="settings-check-copy">
                <strong>{row.label}</strong>
                <small>{row.description}</small>
              </span>
            </label>
          </li>)}
        </ul>
      </fieldset>
      <SettingRow title="Quiet hours" description="Mute alert sounds while you sleep">
        <Switch
          checked={heatAlerts.quietHours.enabled}
          onChange={(enabled) => patchSettings({ heatAlerts: { ...heatAlerts, quietHours: { ...heatAlerts.quietHours, enabled } } })}
          label="Quiet hours"
        />
      </SettingRow>
      {heatAlerts.quietHours.enabled && <div className="settings-time-row">
        <label>
          <span>From</span>
          <input
            type="time"
            value={heatAlerts.quietHours.start}
            onChange={(event) => patchSettings({ heatAlerts: { ...heatAlerts, quietHours: { ...heatAlerts.quietHours, start: event.target.value } } })}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="time"
            value={heatAlerts.quietHours.end}
            onChange={(event) => patchSettings({ heatAlerts: { ...heatAlerts, quietHours: { ...heatAlerts.quietHours, end: event.target.value } } })}
          />
        </label>
      </div>}
      <p className="profile-note">Critical safety alerts may still appear during quiet hours.</p>
    </SettingsSection>

    <SettingsSection icon={Droplets} title="Reminders" description="Hydration nudges while Heat Shield is open.">
      <SettingRow title="Hydration reminders" description="A gentle reminder to drink water">
        <Switch
          checked={hydration.enabled}
          onChange={(enabled) => patchSettings({ hydration: { ...hydration, enabled } })}
          label="Hydration reminders"
        />
      </SettingRow>
      <SettingRow title="Reminder interval" description="How often to remind you">
        <select
          className="settings-select"
          aria-label="Reminder interval"
          value={hydration.intervalMinutes}
          disabled={!hydration.enabled}
          onChange={(event) => patchSettings({ hydration: { ...hydration, intervalMinutes: Number(event.target.value) } })}
        >
          {HYDRATION_INTERVALS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </SettingRow>
    </SettingsSection>

    <SettingsSection icon={MonitorCog} title="Display" description="Units, language, and readability.">
      <SettingRow title="Temperature unit" description="Applies to readings and forecasts">
        <Segmented
          label="Temperature unit"
          value={display.unit}
          options={[{ value: 'celsius', label: `°C Celsius` }, { value: 'fahrenheit', label: `°F Fahrenheit` }]}
          onChange={(unit) => patchSettings({ display: { ...display, unit } })}
        />
      </SettingRow>
      <SettingRow title="Language" description="Saved on this device. Interface translations are coming soon">
        <select
          className="settings-select"
          aria-label="Language"
          value={display.language}
          onChange={(event) => patchSettings({ display: { ...display, language: event.target.value as ProfileSettings['display']['language'] } })}
        >
          {LANGUAGE_LABELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </SettingRow>
      <SettingRow title="Text size" description={`Preview: ${tempSymbol} readings scale with the text`}>
        <Segmented
          label="Text size"
          value={display.textSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'default', label: 'Default' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(textSize) => patchSettings({ display: { ...display, textSize } })}
        />
      </SettingRow>
      <SettingRow title="High contrast" description="Stronger text, borders, and colours">
        <Switch
          checked={display.highContrast}
          onChange={(highContrast) => patchSettings({ display: { ...display, highContrast } })}
          label="High contrast"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection icon={ShieldCheck} title="Privacy & account" description="Your data stays on this device.">
      <SettingRow title="Location permission" description={permissionLabel}>
        <button type="button" className="profile-button ghost" onClick={requestPermission} disabled={permissionState === 'unsupported'}>
          {permissionState === 'denied' ? 'Try again' : 'Request access'}
        </button>
      </SettingRow>
      <SettingRow title="Data controls" description="Everything Heat Shield stores in this browser">
        <div className="profile-button-row">
          <button type="button" className="profile-button ghost" onClick={downloadData}>
            <Database size={14} aria-hidden="true" />Download my data
          </button>
          <button type="button" className={`profile-button danger${clearArmed ? ' armed' : ''}`} onClick={clearLocalData}>
            <Trash2 size={14} aria-hidden="true" />{clearArmed ? 'Tap again to confirm' : 'Clear local data'}
          </button>
        </div>
      </SettingRow>
      {dataNote && <p className="profile-note" role="status">{dataNote}</p>}
      <SettingRow title="Sign out" description="Ends this local session on the device">
        <button type="button" className="profile-button danger" onClick={signOut}>
          <LogOut size={14} aria-hidden="true" />Sign out
        </button>
      </SettingRow>
    </SettingsSection>
  </div>
}
