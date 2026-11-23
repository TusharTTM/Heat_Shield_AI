import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Wordmark intro: the brand appears centred, holds long enough to be read, then
 * slides home into the dashboard's own brand and cross-fades into it.
 *
 * The moving piece is a *clone of the real brand node*, not a redrawn one. The
 * merge has to be pixel-exact — a separately-styled copy would land a font-size
 * or a gap away from the original and the handover would visibly jump. Cloning
 * means it cannot drift, at any breakpoint, whatever the wordmark says in the
 * current language.
 *
 * It is skipped whenever it cannot be done properly:
 * - a second time in the same tab (a welcome, not a toll booth),
 * - when the reader asked for reduced motion,
 * - on any route without the dashboard brand, and
 * - if the brand is not on screen to be merged into.
 */

const SEEN_KEY = 'heatshield.intro-seen'

/** Held still, so the name can be read, before it starts moving. */
const HOLD_MS = 620
/** The slide home; the veil clears under it. Matches the 520ms in the CSS. */
const MERGE_MS = 520
/** The cross-fade at the end: long enough that neither wordmark blinks, short
 *  enough that it still reads as one thing becoming another. */
const HANDOFF_MS = 220
/** How large the wordmark opens, before it settles into the topbar size. */
const HERO_SCALE = 2.6
/** Cap on waiting for webfonts. Measuring the brand before they load would size
 *  the copy to the fallback face and the merge would land in the wrong place. */
const FONT_WAIT_MS = 600

interface Pose { x: number; y: number; scale: number }

function shouldSkip() {
  // The brand lives on the dashboard. On any other route there is nothing to
  // merge into, so the intro has no second act and is not played. Compared
  // without the trailing slash, which is present on the landing route only.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (window.location.pathname.replace(/\/$/, '') !== base) return true
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    if (sessionStorage.getItem(SEEN_KEY)) return true
  } catch {
    // Private contexts can throw on storage. An intro is not worth failing over,
    // so play it.
  }
  return false
}

export function BrandIntro() {
  const [skip] = useState(shouldSkip)
  const [phase, setPhase] = useState<'idle' | 'enter' | 'merge' | 'land' | 'done'>('idle')
  const [origin, setOrigin] = useState<Pose | null>(null)
  const [target, setTarget] = useState<Pose | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLElement | null>(null)

  // Mount-only, deliberately. An earlier version listed `phase` as a dependency,
  // so setting the phase tore the effect down and its own `cancelled` flag
  // stopped the sequence dead — the intro froze on its first frame.
  useLayoutEffect(() => {
    if (skip) return

    let cancelled = false
    const timers: number[] = []
    let landmark: MutationObserver | null = null
    const pause = (ms: number) => new Promise<void>((resolve) => {
      timers.push(window.setTimeout(resolve, ms))
    })

    const start = async () => {
      // Scoped to the landmark, never a bare document query: once a copy is in
      // the DOM it also matches `.dashboard-brand`, and cloning the copy would
      // compound its classes on every run.
      const brand = document.querySelector<HTMLElement>('[data-intro-landmark] .dashboard-brand')
      if (!brand) {
        setPhase('done')
        return
      }
      brandRef.current = brand

      const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
      if (fonts?.ready) await Promise.race([fonts.ready, pause(FONT_WAIT_MS)])
      if (cancelled) return

      // The brand's own box, unaffected by any transform, is what the copy must
      // be aimed at. Measured before the stage is sized because the stage drives
      // the copy's scale.
      const rect = brand.getBoundingClientRect()
      // Not on screen: nothing to merge into, so nothing to play.
      if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        setPhase('done')
        return
      }

      // Pin the stage's box to the brand's *unscaled* size and let scale() do the
      // rest, so the landing pose is exactly translate to the brand's corner at
      // scale 1. Without this the stage has no size (it renders `null` while
      // idle) and the copy would sit at its natural size in a 0x0 box.
      const sized = stage.current
      if (sized) {
        sized.style.width = `${rect.width}px`
        sized.style.height = `${rect.height}px`
      }

      // A copy of the brand, so the handover cannot drift.
      const copy = brand.cloneNode(true) as HTMLElement
      copy.removeAttribute('href')
      copy.removeAttribute('tabindex')
      copy.setAttribute('aria-hidden', 'true')
      copy.className = `${copy.className} brand-intro-copy`

      // The wordmark opens at hero size over the veil, then lands at the
      // dashboard's own size. Both poses are expressed from the same origin —
      // the stage's top-left — so the landing is one transform away and cannot
      // drift: translate(brand position) scale(1) puts the copy exactly on the
      // real brand, pixel for pixel, which is what makes the handover invisible.
      const scale = Number((Math.min(HERO_SCALE, (window.innerWidth * 0.82) / rect.width)).toFixed(3))
      setOrigin({
        x: (window.innerWidth - rect.width * scale) / 2,
        y: (window.innerHeight - rect.height * scale) / 2,
        scale,
      })
      setTarget({ x: rect.left, y: rect.top, scale: 1 })

      // Phase first, so the stage is mounted and sized by the time the copy is
      // put in it. Setting `enter` with the copy already attached animates from
      // nothing, because the stage is invisible until this point.
      setPhase('enter')
      await pause(0)
      if (cancelled) return
      // Read the ref *now*: at the top of this function the stage had not been
      // rendered yet, so a captured `node` is null and nothing would be sized.
      const live = stage.current
      if (live) live.replaceChildren(copy)

      await pause(HOLD_MS)
      if (cancelled) return

      // The copy is about to travel. Take the real brand out of view now, so the
      // two are never stacked on top of each other — and hand it back before the
      // copy fades, so the page is whole whichever frame the handover lands on.
      brand.classList.add('is-intro-target')
      setPhase('merge')

      // Let the travel finish. The handover only starts once the copy is
      // already sitting on the brand, so the two are never both moving.
      await pause(MERGE_MS)
      if (cancelled) return

      // Cross-fade in place: the copy dissolves exactly over the real brand.
      brand.classList.add('is-intro-landed')
      setPhase('land')

      await pause(HANDOFF_MS)
      if (cancelled) return

      // Hand the brand back cleanly. Leaving these on the live element would
      // keep it tied to intro-only rules for the life of the page, and a later
      // route change or re-render would inherit a transition it never asked for.
      brand.classList.remove('is-intro-target')
      brand.classList.remove('is-intro-landed')

      setPhase('done')
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage can be unavailable */ }
    }

    // Waits for the dashboard's landmark before measuring. This component sits
    // above the router, so its layout effect runs *before* the dashboard has
    // rendered: querying for the brand immediately would find nothing and the
    // intro would silently never play.
    if (document.querySelector('[data-intro-landmark]')) {
      void start()
    } else {
      landmark = new MutationObserver(() => {
        if (!document.querySelector('[data-intro-landmark]')) return
        landmark?.disconnect()
        landmark = null
        void start()
      })
      landmark.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      cancelled = true
      landmark?.disconnect()
      for (const id of timers) window.clearTimeout(id)
      // Never leave the real brand hidden because the intro was interrupted.
      brandRef.current?.classList.remove('is-intro-target')
      brandRef.current?.classList.remove('is-intro-landed')
    }
  }, [skip])

  // The node is only mounted while the intro is playing.
  if (skip || phase === 'done') return null

  const at = phase === 'merge' || phase === 'land' ? target : origin
  return (
    <div className="brand-intro" data-phase={phase} aria-hidden="true">
      <div className="brand-intro-veil" data-phase={phase} />
      <div
        ref={stage}
        className="brand-intro-stage"
        data-phase={phase}
        style={at ? { transform: `translate3d(${at.x}px, ${at.y}px, 0) scale(${at.scale})` } : undefined}
      />
    </div>
  )
}

/** Test seam: the intro records that it has run, so clear it between cases. */
export const INTRO_SEEN_KEY = SEEN_KEY
