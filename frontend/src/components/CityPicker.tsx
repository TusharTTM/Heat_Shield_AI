import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, MapPin, Search, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getRegion, regions } from '../data/regions'

export function CityPicker() {
  const { region, setRegion } = useApp()
  const selected = getRegion(region)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const dialogId = useId()
  const titleId = `${dialogId}-title`
  const searchId = `${dialogId}-search`

  const filteredRegions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('en-IN')
    if (!normalized) return regions
    return regions.filter((item) => `${item.name} ${item.state}`.toLocaleLowerCase('en-IN').includes(normalized))
  }, [query])

  const openPicker = useCallback(() => {
    setQuery('')
    setOpen(true)
  }, [])

  const closePicker = useCallback((restoreFocus = false) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const list = root.current?.querySelector<HTMLUListElement>('.city-picker-options')
      const current = list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      if (list && current) {
        const listBounds = list.getBoundingClientRect()
        const currentBounds = current.getBoundingClientRect()
        list.scrollTop += currentBounds.top - listBounds.top - (list.clientHeight - current.clientHeight) / 2
      }
      search.current?.focus({ preventScroll: true })
    })
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) closePicker()
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [open, closePicker])

  const handleKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker(true)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-city-option]') ?? [])
    if (options.length === 0) return
    event.preventDefault()
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (currentIndex + 1 + options.length) % options.length
        : currentIndex < 0 ? options.length - 1
          : (currentIndex - 1 + options.length) % options.length
    options[nextIndex].focus()
  }

  return <div
    ref={root}
    className={`city-picker${open ? ' open' : ''}`}
    onKeyDown={handleKeys}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closePicker()
    }}
  >
    <button
      ref={trigger}
      type="button"
      className="city-picker-trigger"
      aria-label={`Location: ${selected.name}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={dialogId}
      onClick={() => open ? closePicker() : openPicker()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && !open) {
          event.preventDefault()
          openPicker()
        }
      }}
    >
      <MapPin size={17} aria-hidden="true" />
      <span>{selected.name}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>

    {open && <div id={dialogId} className="city-picker-popover" role="dialog" aria-labelledby={titleId}>
      <div className="city-picker-heading">
        <div><h2 id={titleId}>Choose a location</h2><p>Search 15 predefined Indian cities or states · updates all pages</p></div>
        <button type="button" className="city-picker-close" aria-label="Close city picker" onClick={() => closePicker(true)}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="city-picker-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>Search cities or states</label><input id={searchId} ref={search} type="search" value={query} placeholder="City or state" autoComplete="off" onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear city search" onClick={() => { setQuery(''); search.current?.focus() }}><X size={15} aria-hidden="true" /></button>}</div>
      <p className="city-picker-count" role="status">{filteredRegions.length} {filteredRegions.length === 1 ? 'location' : 'locations'}{!query.trim() && filteredRegions.length > 6 ? ' · scroll for more' : ''}</p>
      {filteredRegions.length > 0 ? <ul className="city-picker-options" aria-label="Predefined locations">
        {filteredRegions.map((item) => <li key={item.slug}><button
          type="button"
          data-city-option
          data-city-slug={item.slug}
          className={`city-picker-option${item.slug === region ? ' selected' : ''}`}
          aria-pressed={item.slug === region}
          onClick={() => { setRegion(item.slug); closePicker(true) }}
        >
          <MapPin size={17} aria-hidden="true" />
          <span><strong>{item.name}</strong><small>{item.state}</small></span>
          {item.slug === region && <Check size={18} aria-hidden="true" />}
        </button></li>)}
      </ul> : <div className="city-picker-empty"><MapPin size={22} aria-hidden="true" /><strong>No matching city</strong><p>Only the 15 predefined locations are available. Try a different city or state.</p></div>}
    </div>}
  </div>
}
