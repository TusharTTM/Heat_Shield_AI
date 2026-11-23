import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { BrandIntro, INTRO_SEEN_KEY, INTRO_MS } from '../components/BrandIntro'
import { buildIconMask } from '../lib/mask'

/**
 * The intro is decorative, so the tests are weighted towards the ways it could
 * cost the visitor something: a page that never appears, a brand left hidden, a
 * GPU left running, or an animation replayed at them on every visit.
 *
 * The geometry — does the particle shield actually look like the mark — is not
 * testable here. jsdom has no WebGL and no canvas, so that was verified by
 * rendering the real bundle in Chromium and reading the frames.
 */

vi.mock('../lib/mask', () => ({ buildIconMask: vi.fn() }))
vi.mock('../lib/dustScene', () => ({
  createDustScene: vi.fn(() => ({
    canvas: document.createElement('canvas'),
    setProgress: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  })),
}))

const maskMock = vi.mocked(buildIconMask)

function mountPage() {
  const page = document.createElement('div')
  page.innerHTML = `
    <main>
      <a class="skip-link" href="#main">Skip</a>
      <header data-intro-landmark>
        <a class="dashboard-brand" href="/">
          <span class="dashboard-brand-mark"><svg><path d="M0 0" /></svg></span>
          <span class="dashboard-brand-word"><span class="dashboard-brand-accent">Heat</span> Shield</span>
        </a>
      </header>
    </main>`
  document.body.appendChild(page)
  let view!: ReturnType<typeof render>
  act(() => { view = render(<BrandIntro />) })
  return { page, view }
}

const hasOverlay = () => !!document.querySelector('.brand-intro')
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('innerWidth', 1280)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  Object.defineProperty(document, 'fonts', { value: undefined, configurable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 112, top: 24, width: 147, height: 40, right: 259, bottom: 64, x: 112, y: 24, toJSON: () => ({}),
  } as DOMRect)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg><path d="M0 0"/></svg>' }))
  maskMock.mockResolvedValue({ points: [{ x: 0, y: 0, ink: 1 }, { x: 0.2, y: 0.3, ink: 0.6 }], aspect: 0.82 })
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now() + 16), 16) as unknown as number))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => window.clearTimeout(id)))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
  delete document.documentElement.dataset.intro
})

describe('BrandIntro', () => {
  it('plays the full 3–5s sequence, then removes itself', async () => {
    mountPage()
    await settle()
    expect(hasOverlay()).toBe(true)
    // The brief's window.
    expect(INTRO_MS).toBeGreaterThanOrEqual(3000)
    expect(INTRO_MS).toBeLessThanOrEqual(5000)

    await advance(INTRO_MS + 500)
    expect(hasOverlay()).toBe(false)
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
  })

  it('brings the name in while the mark is forming, not after the whole run', async () => {
    mountPage()
    await settle()
    const word = () => document.querySelector<HTMLElement>('.brand-intro-word')!
    expect(word().dataset.formed).toBe('false')
    await advance(INTRO_MS * 0.7)
    expect(word().dataset.formed).toBe('true')
  })

  it('hides the topbar brand only while the logo is assembling', async () => {
    // Otherwise the real wordmark sits visible behind the dust the whole time,
    // and the particles look like they are drawing a second one.
    mountPage()
    await settle()
    const brand = () => document.querySelector('[data-intro-landmark] .dashboard-brand')!
    expect(brand().classList.contains('is-intro-hidden')).toBe(true)
    await advance(INTRO_MS + 500)
    expect(brand().classList.contains('is-intro-hidden')).toBe(false)
  })

  it('stops the GPU when it finishes, rather than on some later unmount', async () => {
    const { createDustScene } = await import('../lib/dustScene')
    mountPage()
    await settle()
    await advance(INTRO_MS + 500)
    // Released as the intro ends: the dashboard must not inherit a live WebGL
    // context and a 60fps loop it never asked for.
    const scene = vi.mocked(createDustScene).mock.results[0]?.value
    expect(scene.dispose).toHaveBeenCalled()
  })

  it('tells the page when to settle the dashboard out of its blur', async () => {
    mountPage()
    await settle()
    expect(document.documentElement.dataset.intro).toBe('running')
    await advance(INTRO_MS + 500)
    expect(document.documentElement.dataset.intro).toBe('done')
    // And then it leaves <html> completely as it found it.
    await advance(1500)
    expect(document.documentElement.dataset.intro).toBeUndefined()
  })

  it('does not replay on a later visit in the same tab', async () => {
    mountPage()
    await settle()
    await advance(INTRO_MS + 500)
    cleanup()
    render(<BrandIntro />)
    expect(hasOverlay()).toBe(false)
  })

  it('never plays for a reader who asked for reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    mountPage()
    await settle()
    expect(hasOverlay()).toBe(false)
    // And it did not touch the dashboard's brand on the way past.
    expect(document.querySelector('[data-intro-landmark] .dashboard-brand')!.className).toBe('dashboard-brand')
  })

  it('does not play on routes without the dashboard brand', async () => {
    window.history.replaceState(null, '', '/assistant')
    mountPage()
    await settle()
    expect(hasOverlay()).toBe(false)
  })

  it('shows the dashboard instead of a blank screen when there is no WebGL', async () => {
    const { createDustScene } = await import('../lib/dustScene')
    vi.mocked(createDustScene).mockReturnValueOnce(null)
    mountPage()
    await settle()
    expect(hasOverlay()).toBe(false)
    expect(document.querySelector('[data-intro-landmark] .dashboard-brand')!.className).toBe('dashboard-brand')
  })

  it('shows the dashboard when the artwork cannot be read', async () => {
    maskMock.mockResolvedValue(null)
    mountPage()
    await settle()
    expect(hasOverlay()).toBe(false)
  })

  it('restores the brand if it is unmounted mid-run', async () => {
    const { view } = mountPage()
    await settle()
    const brand = () => document.querySelector('[data-intro-landmark] .dashboard-brand')!
    expect(brand().classList.contains('is-intro-hidden')).toBe(true)
    view.unmount()
    expect(brand().classList.contains('is-intro-hidden')).toBe(false)
    expect(hasOverlay()).toBe(false)
  })

  it('waits for the dashboard to render before measuring it', async () => {
    // This component mounts above the router, so on the first frame there is no
    // brand to sample. Giving up there means it silently never plays.
    act(() => { render(<BrandIntro />) })
    const page = document.createElement('div')
    page.innerHTML = `<header data-intro-landmark><a class="dashboard-brand" href="/"><span class="dashboard-brand-mark"><svg></svg></span><span class="dashboard-brand-word"><span class="dashboard-brand-accent">Heat</span> Shield</span></a></header>`
    document.body.appendChild(page)
    await act(async () => { await Promise.resolve() })
    await settle()
    expect(hasOverlay()).toBe(true)
  })
})
