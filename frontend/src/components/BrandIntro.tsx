import { useLayoutEffect, useRef, useState } from 'react'
import { buildIconMask, type MaskBuild } from '../lib/mask'
import type { DustScene } from '../lib/dustScene'

/**
 * Website entry: dust drifts over a dark frame, converges into the site's own
 * wordmark, holds, then releases as the dashboard comes up behind it.
 *
 * Real-time only — a Three.js particle system on a canvas, driven by a timeline
 * in this component. There is no pre-rendered video anywhere in it.
 *
 * The name is drawn twice on purpose: the particles are Three.js, and the name
 * underneath is HTML in the brand's real face. Sharp typography from HTML,
 * cine matic particles from WebGL, and the latter never has to be legible on its
 * own — which matters on a small screen where a particle resolution fine enough
 * to read "Heat Shield" would be too slow.
 *
 * Failure is always "show the dashboard": no WebGL, no canvas, a brand we cannot
 * read, a tab that has seen it, or reduced motion all end with no overlay at all.
 * The intro also never captures a click — pointer events pass straight through —
 * so nothing about it can make the dashboard unresponsive.
 */

const SEEN_KEY = 'heatshield.intro-seen'

/** Wall-clock length of the sequence. The brief asks for 3–5s. */
export const INTRO_MS = 4200
/** Where in the timeline the name resolves. The shader's own release starts at
 *  0.80; this is only when the HTML name is allowed to become fully crisp. */
const FORM_AT = 0.62

type Phase = 'idle' | 'run' | 'done'

function shouldSkip() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (window.location.pathname.replace(/\/$/, '') !== base) return true
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    if (sessionStorage.getItem(SEEN_KEY)) return true
  } catch {
    // Storage can throw in private contexts; an intro is not worth failing over.
  }
  return false
}

/** Eases the sequence so it starts gently and lands softly. */
function easeProgress(t: number): number {
  // Smoothstep over the whole run: slow, full, slow.
  return t * t * (3 - 2 * t)
}

export function BrandIntro() {
  const [skip] = useState(shouldSkip)
  const [phase, setPhase] = useState<Phase>('idle')
  const [nameReady, setNameReady] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const wordRef = useRef<HTMLSpanElement>(null)
  const sceneRef = useRef<DustScene | null>(null)
  const frameRef = useRef<number | null>(null)
  const startedRef = useRef<number | null>(null)
  const brandRef = useRef<HTMLElement | null>(null)

  // Mount-only. Depending on `phase` here would tear the effect down the moment
  // it set the phase, which is exactly how an earlier revision froze.
  useLayoutEffect(() => {
    if (skip) return

    let cancelled = false
    let observer: MutationObserver | null = null
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)) }

    const start = async () => {
      const brand = document.querySelector<HTMLElement>('[data-intro-landmark] .dashboard-brand')
      const mount = host.current
      if (!brand || !mount || !wordRef.current) {
        setPhase('done')
        return
      }

      // Wait for the brand's own face before rasterising it, or the particles
      // would spell the name in the fallback font.
      const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
      if (fonts?.ready) await Promise.race([fonts.ready, new Promise((r) => later(() => r(null), 700))])
      if (cancelled) return

      // The logo the particles form is the site's own icon file. It is a real
      // asset, it is legible as a silhouette at particle resolution, and it is
      // the mark the dashboard already uses — not a redrawn stand-in.
      //
      // The wordmark is deliberately NOT the particle target. Its letterforms
      // need a resolution a phone cannot afford at 60fps, and the result reads
      // as a smudge. The name is part of the sequence, but it arrives as crisp
      // HTML type on top of the formed icon, which is sharper than any particle
      // grid and costs nothing to draw.
      const iconMarkup = await fetch(`${import.meta.env.BASE_URL}favicon.svg`)
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '')
      if (cancelled) return
      const mask: MaskBuild | null = iconMarkup ? await buildIconMask(iconMarkup, 1) : null
      if (cancelled) return
      if (!mask) {
        setPhase('done')
        return
      }

      // Three.js is ~600 kB of the bundle and is used for one animation on one
      // route. Loading it here keeps it out of the entry chunk entirely; the
      // overlay is already covering the screen, so the fetch is invisible.
      const { createDustScene } = await import('../lib/dustScene')
      if (cancelled) return
      const scene = createDustScene(mask.points, mask.aspect)
      if (!scene) {
        // No WebGL: no intro at all rather than a dark screen with nothing on it.
        setPhase('done')
        return
      }
      sceneRef.current = scene
      mount.appendChild(scene.canvas)
      scene.setSize(window.innerWidth, window.innerHeight)

      // The HTML name sits under the particles in the brand's real face.
      const brandWord = brand.querySelector('.dashboard-brand-word')
      const accentEl = brand.querySelector('.dashboard-brand-accent')
      if (brandWord && accentEl && wordRef.current) {
        const wordStyle = getComputedStyle(brandWord)
        const accentStyle = getComputedStyle(accentEl)
        const accentText = accentEl.textContent ?? ''
        const rest = (brandWord.textContent ?? '').trim().slice(accentText.length)
        // Family and weight only, deliberately not the shorthand: the shorthand
        // carries the topbar's 19px, and it would override the intro's own
        // clamp() and collapse the name back to a label.
        wordRef.current.style.fontFamily = wordStyle.fontFamily
        wordRef.current.style.fontWeight = wordStyle.fontWeight
        wordRef.current.style.letterSpacing = wordStyle.letterSpacing
        wordRef.current.replaceChildren(
          Object.assign(document.createElement('span'), { textContent: accentText, className: 'brand-intro-accent' }),
          document.createTextNode(rest),
        )
        wordRef.current.style.setProperty('--accent', accentStyle.color)
      }

      // The topbar's own wordmark would otherwise sit visible behind the dust
      // the whole time. Hidden while the logo assembles, handed back once the
      // name is formed — the particles lead into the real brand rather than
      // duplicating what is already on screen.
      brandRef.current = brand
      brand.classList.add('is-intro-hidden')
      document.documentElement.dataset.intro = 'running'
      setPhase('run')

      const resize = () => scene.setSize(window.innerWidth, window.innerHeight)
      window.addEventListener('resize', resize)

      const tick = (now: number) => {
        if (cancelled) return
        if (startedRef.current === null) startedRef.current = now
        const t = Math.min(1, (now - startedRef.current) / INTRO_MS)
        scene.setProgress(easeProgress(t))
        scene.render()
        if (t < 1) {
          frameRef.current = window.requestAnimationFrame(tick)
        } else {
          finish()
        }
      }

      const finish = () => {
        if (cancelled) return
        // Stop the GPU completely: cancel the loop, then release every buffer,
        // program and the context itself. Nothing waits for unmount.
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
        window.removeEventListener('resize', resize)
        scene.dispose()
        sceneRef.current = null
        brand.classList.remove('is-intro-hidden')
        // Cleared only after the shell has had time to settle, then removed
        // entirely so nothing is left on <html> for the rest of the session.
        document.documentElement.dataset.intro = 'done'
        later(() => { delete document.documentElement.dataset.intro }, 1200)
        setPhase('done')
        try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage can be unavailable */ }
      }

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
      const onReduce = () => { if (reduce.matches) finish() }
      reduce.addEventListener?.('change', onReduce)

      later(() => setNameReady(true), INTRO_MS * FORM_AT)
      startedRef.current = null
      frameRef.current = window.requestAnimationFrame(tick)

      return () => reduce.removeEventListener?.('change', onReduce)
    }

    // The dashboard renders below this component, so the brand does not exist on
    // the first frame. Wait for its landmark rather than giving up.
    if (document.querySelector('[data-intro-landmark]')) {
      void start()
    } else {
      observer = new MutationObserver(() => {
        if (!document.querySelector('[data-intro-landmark]')) return
        observer?.disconnect()
        observer = null
        void start()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      cancelled = true
      observer?.disconnect()
      for (const id of timers) window.clearTimeout(id)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      sceneRef.current?.dispose()
      sceneRef.current = null
      // One owner, one place: `finish` and the unmount path both route through
      // `brand`, so the brand is restored by the same line that hid it. A
      // document-wide sweep here would have hidden a real bug in the finish
      // path — it made "brand never restored" pass.
      brandRef.current?.classList.remove('is-intro-hidden')
    }
  }, [skip])

  if (skip || phase === 'done') return null

  return (
    <div className="brand-intro" data-phase={phase} aria-hidden="true">
      <div className="brand-intro-dust" ref={host} />
      <div className="brand-intro-mark-stage" data-formed={nameReady}>
        <span className="brand-intro-word" ref={wordRef} data-formed={nameReady} />
      </div>
    </div>
  )
}

/** Test seam: the intro records that it has run, so clear it between cases. */
export const INTRO_SEEN_KEY = SEEN_KEY
