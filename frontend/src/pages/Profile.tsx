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
import { nearestRegion, regions } from '../data/regions'
import { languageOptions, useT, type Translate } from '../i18n'

const HYDRATION_INTERVALS = [30, 60, 120, 180, 240] as const

const LEAD_TIMES = [1, 3, 6, 12, 24]

const ALERT_TYPE_KEYS = ['extremeHeat', 'heatIndex', 'airQuality', 'official', 'hotNights'] as const

const ALERT_TYPE_DESCRIPTIONS: Record<(typeof ALERT_TYPE_KEYS)[number], string> = {
  extremeHeat: 'Spikes and multi-day heat events',
  heatIndex: 'When the feels-like temperature turns risky',
  airQuality: 'Unhealthy air that compounds heat stress',
  official: 'Government-issued alerts for your area',
  hotNights: 'Nights that stay too warm to recover',
}

const MAX_PHOTO_BYTES = 300 * 1024

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

function SettingsSection({ icon: Icon, slug, title, description, children }: {
  icon: typeof MapPin
  slug: string
  title: string
  description: string
  children: ReactNode
}) {
  const headingId = `settings-${slug}`
  return <section className="settings-section" aria-labelledby={headingId}>
    <div className="settings-section-heading">
      <span className="settings-section-icon"><Icon size={18} aria-hidden="true" /></span>
      <div>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    <div className="settings-section-body">{children}</div>
  </section>
}

export default function Profile() {
  const t: Translate = useT()
  const navigate = useNavigate()
  const { region, setRegion } = useApp()
  const { settings, patchSettings, replaceSettings } = useSettings()
  const { heatAlerts, hydration, display } = settings
  const fileInput = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState('')
  const [deviceLocationError, setDeviceLocationError] = useState('')
  const [deviceLocationBusy, setDeviceLocationBusy] = useState(false)
  const [remindersNote, setRemindersNote] = useState<'unsupported' | 'denied' | null>(null)
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
        setRegion(nearestRegion(position.coords.latitude, position.coords.longitude).slug)
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

  const toggleBrowserNotifications = (enable: boolean) => {
    setRemindersNote(null)
    if (!enable) {
      patchSettings({ hydration: { ...hydration, browserNotifications: false } })
      return
    }
    const apply = (granted: boolean) => {
      patchSettings({ hydration: { ...hydration, browserNotifications: granted } })
      if (!granted) setRemindersNote('denied')
    }
    if (typeof Notification === 'undefined') {
      setRemindersNote('unsupported')
      return
    }
    if (Notification.permission === 'granted') apply(true)
    else if (Notification.permission === 'denied') setRemindersNote('denied')
    else Notification.requestPermission().then((result) => apply(result === 'granted')).catch(() => setRemindersNote('unsupported'))
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
    setDataNote(t('profile.dataDownloaded'))
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
    setDataNote(t('profile.dataCleared'))
  }

  const signOut = () => {
    patchSettings({ signedIn: false })
    navigate('/')
  }

  const permissionLabel = useMemo(() => ({
    granted: t('perm.granted'),
    denied: t('perm.denied'),
    prompt: t('perm.prompt'),
    unsupported: t('perm.unsupported'),
  } as const)[permissionState], [permissionState, t])

  return <div className="profile-page">
    <header className="profile-topbar">
      <Link to="/" className="profile-back-link" aria-label={t('profile.back')}>
        <ArrowLeft size={18} aria-hidden="true" />
      </Link>
      <h1>{t('nav.profile')}</h1>
      <Link to="/" className="profile-home-link">{t('nav.dashboard')}</Link>
    </header>

    <section className="profile-card">
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {settings.photo
            ? <img src={settings.photo} alt="" />
            : initials
              ? <span className="profile-avatar-initials">{initials}</span>
              : <UserRound size={28} />}
        </span>
        <div className="profile-identity-copy">
          <strong>{settings.signedIn ? displayName : t('profile.signedOutTitle')}</strong>
          <small>{settings.signedIn ? (settings.email || t('profile.emailNote')) : t('profile.signedOutNote')}</small>
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
          <button type="button" className="profile-button ghost" onClick={() => fileInput.current?.click()}>{t('profile.photoChange')}</button>
          {settings.photo && <button type="button" className="profile-button ghost" onClick={() => { setPhotoError(''); patchSettings({ photo: null }) }}>
            <X size={16} aria-hidden="true" />{t('profile.photoRemove')}
          </button>}
        </div>}
      </div>
      {photoError && <p className="profile-note error" role="alert">{photoError}</p>}

      {settings.signedIn
        ? <div className="profile-fields">
          <label className="profile-field">
            <span>{t('profile.name')}</span>
            <input
              type="text"
              value={settings.name}
              placeholder={t('profile.namePlaceholder')}
              autoComplete="name"
              onChange={(event) => patchSettings({ name: event.target.value })}
            />
          </label>
          <label className="profile-field">
            <span>{t('profile.email')}</span>
            <input
              type="email"
              value={settings.email}
              placeholder="you@example.com…"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => patchSettings({ email: event.target.value })}
            />
          </label>
        </div>
        : <div className="profile-signin">
          <p className="profile-note">{t('profile.signInNote')}</p>
          <button type="button" className="profile-button primary" onClick={() => patchSettings({ signedIn: true })}>{t('profile.signIn')}</button>
        </div>}
    </section>

    <SettingsSection icon={MapPin} slug="location" title={t('profile.location')} description={t('profile.locationDesc')}>
      <SettingRow title={t('profile.defaultCity')}>
        <select
          className="settings-select"
          aria-label={t('profile.defaultCity')}
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        >
          {regions.map((item) => <option key={item.slug} value={item.slug}>{item.name}, {item.state}</option>)}
        </select>
      </SettingRow>
      <SettingRow title={t('profile.deviceLocation')} description={t('profile.deviceLocationDesc')}>
        <Switch checked={settings.useDeviceLocation} onChange={useDeviceLocation} label={t('profile.deviceLocation')} />
      </SettingRow>
      {deviceLocationBusy && <p className="profile-note">{t('profile.findingCity')}</p>}
      {deviceLocationError && <p className="profile-note error" role="alert">{deviceLocationError}</p>}
    </SettingsSection>

    <SettingsSection icon={BellRing} slug="heat-alerts" title={t('profile.heatAlerts')} description={t('profile.heatAlertsDesc')}>
      <SettingRow title={t('profile.earlyWarnings')} description={t('profile.earlyWarningsDesc')}>
        <Switch
          checked={heatAlerts.earlyWarnings}
          onChange={(earlyWarnings) => patchSettings({ heatAlerts: { ...heatAlerts, earlyWarnings } })}
          label={t('profile.earlyWarnings')}
        />
      </SettingRow>
      <SettingRow title={t('profile.leadTime')} description={t('profile.leadTimeDesc')}>
        <select
          className="settings-select"
          aria-label={t('profile.leadTime')}
          value={heatAlerts.leadHours}
          disabled={!heatAlerts.earlyWarnings}
          onChange={(event) => patchSettings({ heatAlerts: { ...heatAlerts, leadHours: Number(event.target.value) } })}
        >
          {LEAD_TIMES.map((hours) => <option key={hours} value={hours}>{t('profile.leadOption', { hours })}</option>)}
        </select>
      </SettingRow>
      <fieldset className="settings-fieldset">
        <legend>{t('profile.alertTypes')}</legend>
        <ul className="settings-check-list">
          {ALERT_TYPE_KEYS.map((type) => <li key={type}>
            <label>
              <input
                type="checkbox"
                checked={heatAlerts.types[type]}
                onChange={(event) => patchSettings({
                  heatAlerts: { ...heatAlerts, types: { ...heatAlerts.types, [type]: event.target.checked } },
                })}
              />
              <span className="settings-checkmark" aria-hidden="true"><Check size={16} /></span>
              <span className="settings-check-copy">
                <strong>{t(`alert.${type}`)}</strong>
                <small>{ALERT_TYPE_DESCRIPTIONS[type]}</small>
              </span>
            </label>
          </li>)}
        </ul>
      </fieldset>
      <SettingRow title={t('profile.quietHours')} description={t('profile.quietHoursDesc')}>
        <Switch
          checked={heatAlerts.quietHours.enabled}
          onChange={(enabled) => patchSettings({ heatAlerts: { ...heatAlerts, quietHours: { ...heatAlerts.quietHours, enabled } } })}
          label={t('profile.quietHours')}
        />
      </SettingRow>
      {heatAlerts.quietHours.enabled && <div className="settings-time-row">
        <label>
          <span>{t('profile.from')}</span>
          <input
            type="time"
            value={heatAlerts.quietHours.start}
            onChange={(event) => patchSettings({ heatAlerts: { ...heatAlerts, quietHours: { ...heatAlerts.quietHours, start: event.target.value } } })}
          />
        </label>
        <label>
          <span>{t('profile.to')}</span>
          <input
            type="time"
            value={heatAlerts.quietHours.end}
            onChange={(event) => patchSettings({ heatAlerts: { ...heatAlerts, quietHours: { ...heatAlerts.quietHours, end: event.target.value } } })}
          />
        </label>
      </div>}
      <p className="profile-note">{t('profile.criticalNote')}</p>
    </SettingsSection>

    <SettingsSection icon={Droplets} slug="reminders" title={t('profile.reminders')} description={t('profile.remindersDesc')}>
      <SettingRow title={t('profile.hydration')} description={t('profile.hydrationDesc')}>
        <Switch
          checked={hydration.enabled}
          onChange={(enabled) => patchSettings({ hydration: { ...hydration, enabled } })}
          label={t('profile.hydration')}
        />
      </SettingRow>
      <SettingRow title={t('profile.interval')} description={t('profile.intervalDesc')}>
        <select
          className="settings-select"
          aria-label={t('profile.interval')}
          value={hydration.intervalMinutes}
          disabled={!hydration.enabled}
          onChange={(event) => patchSettings({ hydration: { ...hydration, intervalMinutes: Number(event.target.value) } })}
        >
          {HYDRATION_INTERVALS.map((minutes) => <option key={minutes} value={minutes}>{t(`interval.${minutes}`)}</option>)}
        </select>
      </SettingRow>
      <SettingRow title={t('profile.browserNotifications')} description={t('profile.browserNotificationsDesc')}>
        <Switch
          checked={hydration.browserNotifications}
          onChange={toggleBrowserNotifications}
          label={t('profile.browserNotifications')}
        />
      </SettingRow>
      {remindersNote === 'unsupported' && <p className="profile-note" role="status">Browser notifications are not available in this browser.</p>}
      {remindersNote === 'denied' && <p className="profile-note error" role="alert">Notifications are blocked. Allow them in your browser settings.</p>}
    </SettingsSection>

    <SettingsSection icon={MonitorCog} slug="display" title={t('profile.display')} description={t('profile.displayDesc')}>
      <SettingRow title={t('profile.tempUnit')} description={t('profile.tempUnitDesc')}>
        <Segmented
          label={t('profile.tempUnit')}
          value={display.unit}
          options={[{ value: 'celsius', label: t('unit.celsius') }, { value: 'fahrenheit', label: t('unit.fahrenheit') }]}
          onChange={(unit) => patchSettings({ display: { ...display, unit } })}
        />
      </SettingRow>
      <SettingRow title={t('profile.language')} description={t('profile.languageDesc')}>
        <select
          className="settings-select"
          aria-label={t('profile.language')}
          value={display.language}
          onChange={(event) => patchSettings({ display: { ...display, language: event.target.value as ProfileSettings['display']['language'] } })}
        >
          {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </SettingRow>
      <SettingRow title={t('profile.textSize')} description={t('profile.textSizeDesc')}>
        <Segmented
          label={t('profile.textSize')}
          value={display.textSize}
          options={[
            { value: 'small', label: t('size.small') },
            { value: 'default', label: t('size.default') },
            { value: 'large', label: t('size.large') },
          ]}
          onChange={(textSize) => patchSettings({ display: { ...display, textSize } })}
        />
      </SettingRow>
      <SettingRow title={t('profile.highContrast')} description={t('profile.highContrastDesc')}>
        <Switch
          checked={display.highContrast}
          onChange={(highContrast) => patchSettings({ display: { ...display, highContrast } })}
          label={t('profile.highContrast')}
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection icon={ShieldCheck} slug="privacy" title={t('profile.privacy')} description={t('profile.privacyDesc')}>
      <SettingRow title={t('profile.permission')} description={permissionLabel}>
        <button type="button" className="profile-button ghost" onClick={requestPermission} disabled={permissionState === 'unsupported'}>
          {permissionState === 'denied' ? t('profile.tryAgain') : t('profile.requestAccess')}
        </button>
      </SettingRow>
      <SettingRow title={t('profile.dataControls')} description={t('profile.dataControlsDesc')}>
        <div className="profile-button-row">
          <button type="button" className="profile-button ghost" onClick={downloadData}>
            <Database size={16} aria-hidden="true" />{t('profile.downloadData')}
          </button>
          <button type="button" className={`profile-button danger${clearArmed ? ' armed' : ''}`} onClick={clearLocalData}>
            <Trash2 size={16} aria-hidden="true" />{clearArmed ? t('profile.clearConfirm') : t('profile.clearData')}
          </button>
        </div>
      </SettingRow>
      {dataNote && <p className="profile-note" role="status">{dataNote}</p>}
      <SettingRow title={t('profile.signOut')} description={t('profile.signOutDesc')}>
        <button type="button" className="profile-button danger" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />{t('profile.signOut')}
        </button>
      </SettingRow>
    </SettingsSection>
  </div>
}
