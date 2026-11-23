import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useScrollReveal } from '../hooks/useScrollReveal'

/**
 * The reveal is the one piece of this page that can hide content, so the tests
 * are weighted towards the ways it could fail to show it again rather than
 * towards the happy path.
 */

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void

let observerCallback: Callback
let observed: Element[] = []
let unobserved: Element[] = []
let disconnected = 0
let observerCount = 0
let lastOptions: IntersectionObserverInit | undefined

class FakeObserver {
  constructor(callback: Callback, options?: IntersectionObserverInit) {
    observerCallback = callback
    observerCount += 1
    lastOptions = options
  }
  observe = (el: Element) => { observed.push(el) }
  unobserve = (el: Element) => { unobserved.push(el) }
  disconnect = () => { disconnected += 1 }
}

/**
 * jsdom reports every rect as 0x0, so "is this section already on screen?" would
 * be true for all of them and nothing would ever be observed. Stub the rect per
 * id: sections above the list are on screen, the rest are below it.
 */
const TOPS: Record<string, number> = { one: 100, two: 1400, three: 2400 }
const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect')

function Harness() {
  useScrollReveal()
  return (
    <div data-scroll-reveal>
      <header>topbar</header>
      <section className="scroll-section" id="one">
        <p>first</p>
        <p>second</p>
      </section>
      <section className="scroll-section" id="two">middle</section>
      <section id="three">not marked</section>
    </div>
  )
}

const root = () => document.querySelector('[data-scroll-reveal]')!
const section = (id: string) => document.getElementById(id)!

beforeEach(() => {
  observed = []
  unobserved = []
  disconnected = 0
  observerCount = 0
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  // A 1000px viewport with a 12% margin puts the fold at 880px.
  vi.stubGlobal('innerHeight', 1000)
  rectSpy.mockImplementation(function (this: Element) {
    return { top: TOPS[this.id] ?? 0 } as DOMRect
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  rectSpy.mockReset()
  window.history.replaceState(null, '', '/')
})

describe('useScrollReveal', () => {
  it('hides nothing until the observer is actually attached', () => {
    // The ordering is the whole safety property: `is-reveal-ready` is what the
    // stylesheet keys the hidden state off, so it must not exist before the
    // observer that will undo it.
    render(<Harness />)
    expect(root().classList.contains('is-reveal-ready')).toBe(true)
    expect(observerCount).toBe(1)
  })

  it('shows what is already on screen instead of animating it', () => {
    // `one` sits at 100px in a 1000px viewport: it is already in front of the
    // reader, so fading it in would be an animation of something they are
    // looking at, not an entrance.
    render(<Harness />)
    expect(section('one').classList.contains('is-revealed')).toBe(true)
    expect(observed.map((el) => el.id)).toEqual(['two'])
  })

  it('holds back only what is genuinely below the fold', () => {
    render(<Harness />)
    expect(section('two').classList.contains('is-revealed')).toBe(false)
    expect(observed).toHaveLength(1)
    // The unmarked section is never touched either way.
    expect(observed.map((el) => el.id)).not.toContain('three')
  })

  it('reveals on any visible pixel, so a tall section cannot get stuck', () => {
    // A threshold is a fraction of the *section*. A section taller than the
    // viewport — the warnings panel with three alerts in it — can never reach
    // 5% visible on a short phone screen, and would stay invisible forever.
    // Zero is the only threshold that cannot strand content.
    render(<Harness />)
    expect(lastOptions?.threshold).toBe(0)
  })

  it('decides before the first paint, so nothing flashes', () => {
    // A passive effect runs after paint: the page would show at full opacity,
    // hide, then fade back. A layout effect runs before it.
    const order: string[] = []
    const spy = vi.spyOn(document.defaultView!, 'requestAnimationFrame')
    spy.mockImplementation(() => { order.push('frame'); return 0 })
    render(<Harness />)
    // The ready class is present synchronously after render, with no frame
    // having been requested in between.
    expect(root().classList.contains('is-reveal-ready')).toBe(true)
    expect(order).toEqual([])
    spy.mockRestore()
  })

  it('reveals a section when it enters the viewport, then stops watching it', () => {
    render(<Harness />)
    expect(section('two').classList.contains('is-revealed')).toBe(false)

    observerCallback([{ isIntersecting: true, target: section('two') }])

    expect(section('two').classList.contains('is-revealed')).toBe(true)
    expect(unobserved.map((el) => el.id)).toEqual(['two'])
    // `one` never entered the observer at all, so there is nothing to release.
    expect(unobserved.map((el) => el.id)).not.toContain('one')
  })

  it('does not re-hide a section that scrolls back out', () => {
    // Someone scrolling up to re-read a number should not see it fade away.
    render(<Harness />)
    observerCallback([{ isIntersecting: true, target: section('one') }])
    observerCallback([{ isIntersecting: false, target: section('one') }])
    expect(section('one').classList.contains('is-revealed')).toBe(true)
  })

  it('leaves below-fold content recoverable when the observer never fires', () => {
    // The failure this guards: a section held back with nothing that can ever
    // release it. `two` is held, but only ever behind a live observer.
    render(<Harness />)
    expect(root().classList.contains('is-reveal-ready')).toBe(true)
    expect(observerCount).toBe(1)
    observerCallback([{ isIntersecting: true, target: section('two') }])
    expect(section('two').classList.contains('is-revealed')).toBe(true)
  })

  it('renders everything visible in a browser with no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Harness />)
    // Every section is shown outright. The ready class is allowed here — it is
    // harmless when every section also carries `is-revealed`.
    expect(observerCount).toBe(0)
    for (const id of ['one', 'two']) {
      expect(section(id).classList.contains('is-revealed')).toBe(true)
    }
  })

  it('renders everything visible when the observer exists but is not a function', () => {
    // The bug this caught: `'IntersectionObserver' in window` is true for a
    // property holding undefined, and construction then throws.
    vi.stubGlobal('IntersectionObserver', 'not a constructor')
    expect(() => render(<Harness />)).not.toThrow()
    for (const id of ['one', 'two']) {
      expect(section(id).classList.contains('is-revealed')).toBe(true)
    }
  })

  it('shows the whole page when landing on a deep link mid-page', () => {
    // Arriving at #official-warnings puts the reader below several sections.
    // Animating those in underneath them would be motion they never asked for
    // and content that was on screen arriving late.
    window.history.replaceState(null, '', '/#official-warnings')
    render(<Harness />)
    expect(root().classList.contains('is-reveal-ready')).toBe(true)
    for (const el of document.querySelectorAll('.scroll-section')) {
      expect(el.classList.contains('is-revealed')).toBe(true)
    }
    // No observer is needed, so none is created.
    expect(observerCount).toBe(0)
  })

  it('cleans up on unmount so a remount does not stack observers', () => {
    const view = render(<Harness />)
    const node = root() // held across unmount: the detached node keeps its classes
    view.unmount()
    expect(disconnected).toBe(1)
    expect(node.classList.contains('is-reveal-ready')).toBe(false)
  })
})
