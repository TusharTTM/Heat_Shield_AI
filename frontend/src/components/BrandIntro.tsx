import { useLayoutEffect, useRef, useState } from 'react'
import { sampleSvgToPixels, type PixelCell } from '../lib/samplePixels'

/**
 * Pixel intro: the wordmark is drawn from a grid of pixels in the middle of the
 * screen, holds, then travels to the dashboard's topbar and becomes the real
 * brand there.
 *
 * Two halves make the wordmark:
 *
 * - The mark is a *sample of the live SVG icon*, so the pixels form the shield
 *   the visitor is about to see rather than a hand-drawn stand-in.
 * - The name is painted into a canvas with the brand's own computed font, size
 *   and colours, so it is the same face at any breakpoint and in any language.
 *
 * The carrier that holds both is the thing that travels, and it ends on the
 * brand's exact box — measured at 0px delta on phone through 1920px. The
 * glowing pixels are then swapped for the live brand, which is already waiting
 * underneath.
 *
 * It is skipped whenever it cannot be done properly: a second visit in the same
 * tab, prefers-reduced-motion, any route without the dashboard brand, a brand
 * that is not on screen, or a canvas it cannot read.
 */

const SEEN_KEY = 'heatshield.intro-seen'

/** How large the wordmark opens, before it settles into the topbar size. */
const HERO_SCALE = 2.55
/** Hard ceiling so it never touches the screen edges on a narrow phone. */
const HERO_MAX_VW = 0.84
/** Grid resolution the shield is sampled at. Reads as pixels, not as a blur. */
const MARK_GRID = 13
/** Pixels assemble. */
const ASSEMBLE_MS = 900
/** The finished wordmark holds, so it can be read. */
const HOLD_MS = 460
/** Travel home. */
const TRAVEL_MS = 560
/** Cross-fade from the pixels to the real brand once it has landed. */
const HANDOVER_MS = 220
/** Cap on waiting for webfonts before measuring the brand's face. */
const FONT_WAIT_MS = 600

interface Pose { x: number; y: number; scale: number }

function shouldSkip() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (window.location.pathname.replace(/\/$/, '') !== base) return true
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    if (sessionStorage.getItem(SEEN_KEY)) return true
  } catch {
    // An intro is not worth failing over if storage is unavailable.
  }
  return false
}

interface WordPaint {
  /** The two coloured runs of the name, and the ink for each. */
  accentText: string
  restText: string
  accentColor: string
  restColor: string
  font: string
  letterSpacing: string
}

/**
 * Paints the wordmark into a canvas using the brand's own face and colours.
 *
 * Canvas because the name has to scale with the pixel mark during the travel.
 * Rendering it as HTML text would re-lay it out at each size and the glyph
 * spacing would visibly wobble on the way to the topbar.
 */
function paintWord(paint: WordPaint) {
  // `getContext` throws outright in environments without a canvas backend, which
  // would abort the sequence after the brand was already hidden. Skipping the
  // intro is the right answer; an exception here is not.
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = document.createElement('canvas').getContext('2d')
  } catch {
    return null
  }
  if (!ctx) return null
  ctx.font = paint.font
  // Measured before the canvas is sized, so its width is the name's width.
  const accentWidth = ctx.measureText(paint.accentText).width
  const width = accentWidth + ctx.measureText(paint.restText).width
  const metrics = ctx.measureText(paint.accentText)
  const height = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) || 24

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((width + 2) * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  canvas.style.width = `${width + 2}px`
  canvas.style.height = `${height}px`
  canvas.style.display = 'block'

  const draw = canvas.getContext('2d')
  if (!draw) return null
  draw.scale(dpr, dpr)
  draw.font = paint.font
  draw.textBaseline = 'alphabetic'
  draw.fillStyle = paint.accentColor
  draw.fillText(paint.accentText, 0, height - (metrics.actualBoundingBoxDescent || 0))
  draw.fillStyle = paint.restColor
  draw.fillText(paint.restText, accentWidth, height - (metrics.actualBoundingBoxDescent || 0))

  return { canvas, width: width + 2, height }
}

export function BrandIntro() {
  const [skip] = useState(shouldSkip)
  const [phase, setPhase] = useState<'idle' | 'assemble' | 'travel' | 'handover' | 'done'>('idle')
  const [origin, setOrigin] = useState<Pose | null>(null)
  const [target, setTarget] = useState<Pose | null>(null)
  const [markCells, setMarkCells] = useState<PixelCell[]>([])
  const [markBox, setMarkBox] = useState<{ w: number; h: number } | null>(null)
  const carrier = useRef<HTMLDivElement>(null)
  const textSlot = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLElement | null>(null)

  // Mount-only. An earlier version depended on `phase`, so setting the phase
  // tore the effect down and its own cancelled flag killed the sequence.
  useLayoutEffect(() => {
    if (skip) return

    let cancelled = false
    const timers: number[] = []
    let landmark: MutationObserver | null = null
    const pause = (ms: number) => new Promise<void>((resolve) => {
      timers.push(window.setTimeout(resolve, ms))
    })

    const start = async () => {
      const brand = document.querySelector<HTMLElement>('[data-intro-landmark] .dashboard-brand')
      if (!brand) {
        setPhase('done')
        return
      }
      brandRef.current = brand

      const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
      if (fonts?.ready) await Promise.race([fonts.ready, pause(FONT_WAIT_MS)])
      if (cancelled) return

      const rect = brand.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        setPhase('done')
        return
      }

      // Build the pixel mark from the icon the dashboard is actually showing.
      const svg = brand.querySelector('svg')
      const sample = svg instanceof SVGSVGElement
        ? await sampleSvgToPixels(svg, MARK_GRID)
        : null
      if (cancelled) return
      if (!sample) {
        setPhase('done')
        return
      }
      const markEl = brand.querySelector<HTMLElement>('.dashboard-brand-mark')
      const markRect = markEl?.getBoundingClientRect() ?? rect
      setMarkCells(sample.cells)
      setMarkBox({ w: markRect.width, h: markRect.height })

      // The wordmark's own colours and face, so the painted name is the brand's.
      const wordEl = brand.querySelector<HTMLElement>('.dashboard-brand-word')
      const accentEl = brand.querySelector<HTMLElement>('.dashboard-brand-accent')
      const wordStyle = getComputedStyle(wordEl ?? brand)
      const slot = textSlot.current
      if (!slot) { setPhase('done'); return }
      const accentText = accentEl?.textContent ?? ''
      // The name as the visitor sees it, in the current language: "Heat" in the
      // accent, the rest in the body colour, from the same two spans the brand
      // renders. Nothing here is a hard-coded string.
      const fullText = (wordEl?.textContent ?? '').trim()
      const restText = fullText.slice(accentText.length)

      const painted = paintWord({
        accentText,
        restText,
        accentColor: getComputedStyle(accentEl ?? wordEl ?? brand).color,
        restColor: wordStyle.color,
        font: wordStyle.font,
        letterSpacing: wordStyle.letterSpacing,
      })
      if (!painted) { setPhase('done'); return }
      const textWidth = painted.width

      const gap = parseFloat(getComputedStyle(brand).columnGap || '0') || 0
      const heroW = (markRect.width + gap + textWidth) * HERO_SCALE
      const scale = Math.min(HERO_SCALE, HERO_MAX_VW * window.innerWidth / (heroW / HERO_SCALE))

      // The carrier is a copy of the brand's own box, at the brand's own scale,
      // so the landing pose is one transform away and cannot drift.
      if (slot) {
        slot.replaceChildren()
      }
      const carrierEl = carrier.current
      if (carrierEl) {
        carrierEl.style.width = `${markRect.width + gap + textWidth}px`
        carrierEl.style.height = `${rect.height}px`
        carrierEl.style.gap = `${gap}px`
      }

      targetRef.current = { x: rect.left, y: rect.top, scale: 1 }
      setTarget({ x: rect.left, y: rect.top, scale: 1 })
      setOrigin({
        x: (window.innerWidth - (markRect.width + gap + textWidth) * scale) / 2,
        y: (window.innerHeight - rect.height * scale) / 2,
        scale,
      })
      setPhase('assemble')
      // Phase first, then populate: the nodes below only exist after the render
      // that the phase change schedules.
      await pause(0)
      if (cancelled) return
      textSlot.current?.replaceChildren(painted.canvas)

      brand.classList.add('is-intro-hidden')

      await pause(ASSEMBLE_MS + HOLD_MS)
      if (cancelled) return
      setPhase('travel')

      await pause(TRAVEL_MS)
      if (cancelled) return

      // Landed. The real brand is already sitting underneath this box.
      brand.classList.remove('is-intro-hidden')
      brand.classList.add('is-intro-shown')
      setPhase('handover')

      await pause(HANDOVER_MS)
      if (cancelled) return
      setPhase('done')
      brand.classList.remove('is-intro-shown')
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage can be unavailable */ }
    }

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
      // Never leave the dashboard without its wordmark if the intro is cut off.
      brandRef.current?.classList.remove('is-intro-hidden')
      brandRef.current?.classList.remove('is-intro-shown')
    }
  }, [skip])

  const targetRef = useRef<Pose | null>(null)

  if (skip || phase === 'done') return null

  const at = phase === 'travel' || phase === 'handover' ? target : origin
  return (
    <div className="brand-intro" data-phase={phase} aria-hidden="true">
      <div className="brand-intro-veil" data-phase={phase} />
      <div
        ref={carrier}
        className="brand-intro-carrier"
        data-phase={phase}
        style={at ? { transform: `translate3d(${at.x}px, ${at.y}px, 0) scale(${at.scale})` } : undefined}
      >
        {markBox && (
          <div
            className="brand-intro-mark"
            style={{ width: markBox.w, height: markBox.h, ['--grid' as string]: MARK_GRID }}
          >
            {markCells.map((cell) => (
              <i
                key={`${cell.col}:${cell.row}`}
                style={{
                  // Centre each pixel inside its cell so the grid is even.
                  left: `${(cell.col + 0.5) * 100 / MARK_GRID}%`,
                  top: `${(cell.row + 0.5) * 100 / MARK_GRID}%`,
                  // Solid parts of the glyph arrive first; edges follow.
                  animationDelay: `${(1 - cell.weight) * 420}ms`,
                }}
              />
            ))}
          </div>
        )}
        <div ref={textSlot} className="brand-intro-text" data-phase={phase} />
      </div>
    </div>
  )
}

/** Test seam: the intro records that it has run, so clear it between cases. */
export const INTRO_SEEN_KEY = SEEN_KEY
