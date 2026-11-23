import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { BrandIntro, INTRO_SEEN_KEY } from '../components/BrandIntro'

/**
 * The intro's job is to move a wordmark onto the dashboard's own brand and hand
 * over without a seam. Every bug this file guards was found by driving a real
 * browser, because jsdom has no layout: it reports every rect as 0x0 and runs no
 * transitions, so it cannot see a 10px landing error or a fade that never
 * finishes. What it *can* police is the sequencing and the skip rules — the
 * parts that fail silently and blank a page or freeze an animation.
 */

const BRAND = { left: 112, top: 24, width: 147, height: 40, right: 259, bottom: 64, x: 112, y: 24, toJSON: () => ({}) } as DOMRect

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('innerWidth', 1280)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  // jsdom has no FontFaceSet; the component tolerates its absence, but the wait
  // is part of the sequence, so make it explicit.
  Object.defineProperty(document, 'fonts', { value: undefined, configurable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(BRAND)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

/** Mounts the dashboard's brand, then the intro, the way the real page does. */
function mountPage() {
  const page = document.createElement('div')
  page.innerHTML = `
    <main><header data-intro-landmark>
      <a class="dashboard-brand" href="/"><span class="dashboard-brand-mark"></span><span class="dashboard-brand-word">Heat Shield</span></a>
    </header></main>`
  document.body.appendChild(page)
  // `act` because the intro's first act (cloning the brand) happens in a layout
  // effect during this render.
  let view!: ReturnType<typeof render>
  act(() => { view = render(<BrandIntro />) })
  return { page, view, brand: page.querySelector('.dashboard-brand') as HTMLElement }
}

const phase = () => document.querySelector('.brand-intro')?.getAttribute('data-phase') ?? 'gone'
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('BrandIntro', () => {
  it('plays through every phase in order, ending with no overlay left', async () => {
    mountPage()
    // A layout effect runs synchronously on mount, so by the time `render`
    // returns the entrance has already begun.
    expect(phase()).toBe('enter')
    await advance(620) // hold
    expect(phase()).toBe('merge')
    await advance(520) // travel
    expect(phase()).toBe('land')
    await advance(220) // cross-fade
    expect(phase()).toBe('gone')
    expect(document.querySelector('.brand-intro')).toBeNull()
  })

  it('does not freeze on its first frame', async () => {
    // The bug this catches: listing `phase` as an effect dependency tore the
    // effect down when it set the phase, so its own cancelled flag stopped the
    // sequence and the intro sat on screen forever.
    mountPage()
    await advance(2000)
    expect(phase()).toBe('gone')
  })

  it('clones the brand rather than redrawing it, so the landing cannot drift', async () => {
    mountPage()
    await advance(0)
    const copy = document.querySelector('.brand-intro-copy')
    expect(copy).not.toBeNull()
    // Same element type and the same children as the real brand.
    expect(copy?.tagName).toBe('A')
    expect(copy?.querySelector('.dashboard-brand-mark')).not.toBeNull()
    expect(copy?.querySelector('.dashboard-brand-word')?.textContent).toBe('Heat Shield')
    // It is inert: no link, nothing for a screen reader, nothing focusable.
    expect(copy?.hasAttribute('href')).toBe(false)
    expect(copy?.getAttribute('aria-hidden')).toBe('true')
    expect(copy?.getAttribute('tabindex')).toBeNull()
  })

  it('always measures the page brand, never its own copy', async () => {
    // A bare `.dashboard-brand` query matches the copy too, and cloning a copy
    // compounds its classes. The copy must never be the measurement source: it
    // is inside the stage, so it can never be inside the landmark.
    mountPage()
    await advance(0)
    const copy = document.querySelector('.brand-intro-copy')!
    expect(copy.closest('[data-intro-landmark]')).toBeNull()
    expect(document.querySelectorAll('.brand-intro-copy')).toHaveLength(1)
    // The live brand keeps its own class list and does not acquire the copy's.
    expect(document.querySelector('[data-intro-landmark] .dashboard-brand')?.className)
      .toBe('dashboard-brand')
    // And the stage only ever holds that one copy.
    expect(document.querySelectorAll('.brand-intro-stage > *')).toHaveLength(1)
  })

  it('hands the page back whole, with the brand visible and unmarked', async () => {
    // Re-queried at every step rather than held in a variable: React re-creates
    // the element on its own renders, and a stale reference reports classes from
    // a node that is no longer the one on screen.
    const brandNow = () => document.querySelector<HTMLElement>('[data-intro-landmark] .dashboard-brand')!
    mountPage()
    await advance(0)
    await advance(620)
    // Hidden only for the length of the travel, then handed back.
    expect(brandNow().classList.contains('is-intro-target')).toBe(true)
    expect(brandNow().classList.contains('is-intro-landed')).toBe(false)
    await advance(520)
    expect(brandNow().classList.contains('is-intro-landed')).toBe(true)
    await advance(220)
    // Nothing of the intro is left on the live brand.
    expect(brandNow().className).toBe('dashboard-brand')
  })

  it('restores the brand if it is unmounted mid-flight', async () => {
    const { view } = mountPage()
    await advance(0)
    await advance(620)
    const brand = document.querySelector<HTMLElement>('[data-intro-landmark] .dashboard-brand')!
    expect(brand.classList.contains('is-intro-target')).toBe(true)
    view.unmount()
    // An interrupted intro must not leave the dashboard without its wordmark.
    expect(brand.classList.contains('is-intro-target')).toBe(false)
    expect(document.querySelector('.brand-intro')).toBeNull()
  })

  it('plays once per tab', async () => {
    mountPage()
    await advance(2000)
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
    cleanup()
    render(<BrandIntro />)
    expect(phase()).toBe('gone')
  })

  it('never plays for a reader who asked for reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    mountPage()
    await advance(0)
    expect(phase()).toBe('gone')
  })

  it('does not play on routes without the dashboard brand', async () => {
    window.history.replaceState(null, '', '/assistant')
    mountPage()
    await advance(0)
    expect(phase()).toBe('gone')
  })

  it('waits for the dashboard before measuring, instead of giving up', async () => {
    // The component mounts above the router, so on first paint the dashboard has
    // not rendered. Giving up there would mean the intro silently never plays in
    // production while working in any test that mounts the brand first.
    act(() => { render(<BrandIntro />) })

    const page = document.createElement('div')
    page.innerHTML = `<header data-intro-landmark><a class="dashboard-brand" href="/"><span class="dashboard-brand-word">Heat Shield</span></a></header>`
    document.body.appendChild(page)

    // The mutation observer is a microtask; let it deliver before flushing the
    // component's own timers.
    await act(async () => { await Promise.resolve() })
    expect(phase()).toBe('enter')
  })
})
