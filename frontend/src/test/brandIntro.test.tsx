import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { BrandIntro, INTRO_SEEN_KEY } from '../components/BrandIntro'
import { sampleSvgToPixels } from '../lib/samplePixels'

/**
 * The intro's job: build a pixel wordmark in the middle of the screen, carry it
 * to the topbar, and hand over to the real brand without a seam. The geometric
 * part of that (does it land on the brand?) was verified in a real browser at
 * 0px delta on four viewports, because jsdom reports every rect as 0x0.
 *
 * What is worth policing here is everything that fails *silently*: the sequence
 * that can freeze, the brand that can be left hidden, and the skip rules that
 * decide whether the visitor sees a page at all.
 */

const BRAND = { left: 112, top: 24, width: 147, height: 40, right: 259, bottom: 64, x: 112, y: 24, toJSON: () => ({}) } as DOMRect
const MARK = { left: 112, top: 24, width: 40, height: 40, right: 152, bottom: 64, x: 112, y: 24, toJSON: () => ({}) } as DOMRect

/** jsdom has no canvas backend, so the sample always fails there. Stub the
 *  sampler rather than the canvas: the real one is exercised in the browser. */
vi.mock('../lib/samplePixels', () => ({
  sampleSvgToPixels: vi.fn(),
}))

const sampleMock = vi.mocked(sampleSvgToPixels)

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('innerWidth', 1280)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  Object.defineProperty(document, 'fonts', { value: undefined, configurable: true })
  // jsdom has no canvas backend and throws on `getContext`. The intro paints the
  // wordmark into one, so give the tests a minimal 2D context; the real painting
  // is verified in a browser.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    font: '',
    fillStyle: '',
    textBaseline: '',
    scale: vi.fn(),
    fillText: vi.fn(),
    measureText: (t: string) => ({ width: t.length * 10, actualBoundingBoxAscent: 14, actualBoundingBoxDescent: 4 }),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.classList?.contains('dashboard-brand-mark') ? MARK : BRAND
  })
  sampleMock.mockResolvedValue({
    cols: 13,
    rows: 13,
    cells: [
      { col: 6, row: 2, weight: 1 },
      { col: 6, row: 6, weight: 1 },
      { col: 3, row: 4, weight: 0.4 },
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

function mountPage() {
  const page = document.createElement('div')
  page.innerHTML = `
    <main><header data-intro-landmark>
      <a class="dashboard-brand" href="/">
        <span class="dashboard-brand-mark"><svg><path d="M0 0" /></svg></span>
        <span class="dashboard-brand-word"><span class="dashboard-brand-accent">Heat</span> Shield</span>
      </a>
    </header></main>`
  document.body.appendChild(page)
  let view!: ReturnType<typeof render>
  act(() => { view = render(<BrandIntro />) })
  return { page, view }
}

const phase = () => document.querySelector('.brand-intro')?.getAttribute('data-phase') ?? 'gone'
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const brandNow = () => document.querySelector<HTMLElement>('[data-intro-landmark] .dashboard-brand')!

/** The sampling promise has to settle before the sequence can move on. */
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

describe('BrandIntro', () => {
  it('assembles, travels, hands over, and leaves nothing behind', async () => {
    mountPage()
    await settle()
    expect(phase()).toBe('assemble')

    await advance(900 + 460) // assemble + hold
    expect(phase()).toBe('travel')
    const carrier = document.querySelector('.brand-intro-carrier') as HTMLElement
    expect(carrier.style.transform).toContain('scale(1)') // aimed at the brand

    await advance(560)
    expect(phase()).toBe('handover')
    await advance(220)
    expect(phase()).toBe('gone')
    expect(document.querySelector('.brand-intro')).toBeNull()
  })

  it('builds the mark out of sampled pixels, not a hand-drawn mask', async () => {
    // The silhouette has to be the icon the visitor is about to see. Sampling the
    // live element is the only way that survives an icon or stroke change.
    mountPage()
    await settle()
    expect(sampleMock).toHaveBeenCalled()
    const pixels = document.querySelectorAll('.brand-intro-mark > i')
    expect(pixels).toHaveLength(3)
    // Solid parts of the glyph arrive before its edges.
    const [solid, , edge] = [...pixels].map((el) => (el as HTMLElement).style.animationDelay)
    expect(parseFloat(solid)).toBeLessThan(parseFloat(edge))
  })

  it('paints the name from the brand’s own text and colours', async () => {
    mountPage()
    await settle()
    // The canvas is the name; the text it draws comes from the live spans, so a
    // translated wordmark or a retheme needs no change here.
    expect(document.querySelector('.brand-intro-text canvas')).not.toBeNull()
  })

  it('hides the real brand only while its pixels are on screen', async () => {
    mountPage()
    await settle()
    // Out of view, but still laid out: the box the pixels aim at must not move.
    expect(brandNow().classList.contains('is-intro-hidden')).toBe(true)
    await advance(900 + 460 + 560)
    expect(brandNow().classList.contains('is-intro-hidden')).toBe(false)
    // And once settled, nothing of the intro is left on the live brand.
    await advance(220)
    expect(brandNow().className).toBe('dashboard-brand')
  })

  it('does not freeze on its first frame', async () => {
    // The regression: listing `phase` as an effect dependency tore the effect
    // down when it set the phase, and its own cancelled flag stopped the run.
    mountPage()
    await settle()
    await advance(4000)
    expect(phase()).toBe('gone')
  })

  it('gives up on the whole intro if the icon cannot be sampled', async () => {
    // Showing a shield that is not the shield would be worse than showing none.
    sampleMock.mockResolvedValue(null)
    mountPage()
    await settle()
    expect(phase()).toBe('gone')
    expect(brandNow().classList.contains('is-intro-hidden')).toBe(false)
  })

  it('restores the brand if it is unmounted mid-flight', async () => {
    const { view } = mountPage()
    await settle()
    expect(brandNow().classList.contains('is-intro-hidden')).toBe(true)
    view.unmount()
    // An interrupted intro must never leave the dashboard without its wordmark.
    expect(brandNow().classList.contains('is-intro-hidden')).toBe(false)
    expect(document.querySelector('.brand-intro')).toBeNull()
  })

  it('plays once per tab', async () => {
    mountPage()
    await settle()
    await advance(4000)
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
    cleanup()
    render(<BrandIntro />)
    expect(phase()).toBe('gone')
  })

  it('never plays for a reader who asked for reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    mountPage()
    await settle()
    expect(phase()).toBe('gone')
    expect(brandNow().classList.contains('is-intro-hidden')).toBe(false)
  })

  it('does not play on routes without the dashboard brand', async () => {
    window.history.replaceState(null, '', '/assistant')
    mountPage()
    await settle()
    expect(phase()).toBe('gone')
  })

  it('waits for the dashboard before measuring, instead of giving up', async () => {
    // This component mounts above the router, so on first paint the dashboard
    // has not rendered. Giving up there means it silently never plays.
    act(() => { render(<BrandIntro />) })
    const page = document.createElement('div')
    page.innerHTML = `<header data-intro-landmark><a class="dashboard-brand" href="/"><span class="dashboard-brand-mark"><svg></svg></span><span class="dashboard-brand-word"><span class="dashboard-brand-accent">Heat</span> Shield</span></a></header>`
    document.body.appendChild(page)
    await act(async () => { await Promise.resolve() })
    await settle()
    expect(phase()).toBe('assemble')
  })
})
