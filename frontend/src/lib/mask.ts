/**
 * Turns real brand artwork into a cloud of target points.
 *
 * Both sources are the site's own assets:
 *
 * - the dashboard's live wordmark (mark plus name), serialised to an SVG with its
 *   computed face and colours, so the particles assemble into exactly the logo
 *   the visitor is about to see in the topbar;
 * - `favicon.svg`, the site's icon file, drawn as-is.
 *
 * Nothing here is a placeholder or a redrawn approximation: if the brand changes,
 * the cloud changes with it.
 */

export interface TargetPoint {
  /** Normalised position in the mask, -1..1, y up. */
  x: number
  y: number
  /** 0..1 — how solid the artwork is here. Drives brightness and settle order. */
  ink: number
}

export interface MaskBuild {
  points: TargetPoint[]
  /** Width / height of the source artwork. */
  aspect: number
}

/** Grid the artwork is read at. Fine enough to keep letterforms legible. */
const SAMPLE_GRID = 120
/** Below this a cell is anti-aliasing from a neighbouring stroke. */
const INK_FLOOR = 0.1

/** Decodes an SVG data URL into a bitmap. Resolves null instead of rejecting:
 *  this is decorative, and the caller's job is to skip, not to report. */
function decode(markup: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const settle = (value: HTMLImageElement | null) => {
      image.onload = null
      image.onerror = null
      resolve(value)
    }
    image.onload = () => settle(image)
    image.onerror = () => settle(null)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}

/** Reads a decoded bitmap into normalised points. */
function readBitmap(image: HTMLImageElement, aspect: number): MaskBuild | null {
  const width = SAMPLE_GRID * 2
  const height = SAMPLE_GRID * 2
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  } catch {
    // No canvas backend (jsdom, a hardened browser). Skip the intro.
    return null
  }
  if (!ctx) return null

  try {
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
  } catch {
    return null
  }

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, width, height).data
  } catch {
    // A tainted canvas; nothing to read.
    return null
  }

  const points: TargetPoint[] = []
  const cw = width / SAMPLE_GRID
  for (let gy = 0; gy < SAMPLE_GRID; gy++) {
    for (let gx = 0; gx < SAMPLE_GRID; gx++) {
      const x0 = Math.floor(gx * cw)
      const x1 = Math.floor((gx + 1) * cw)
      const y0 = Math.floor(gy * cw)
      const y1 = Math.floor((gy + 1) * cw)
      let sum = 0
      let count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          // Alpha only. Luminance is the wrong signal for artwork like this: the
          // icon is a filled rust square with a *white* shield and thermometer
          // inside it, so anything weighting by darkness erases the interior and
          // leaves a hollow ring of warm edges. Opacity is the one channel that
          // means "there is artwork here" whatever colour it is.
          sum += data[i + 3] / 255
          count++
        }
      }
      const ink = count ? sum / count : 0
      if (ink > INK_FLOOR) {
        points.push({
          x: ((gx + 0.5) / SAMPLE_GRID) * 2 - 1,
          // Canvas y grows down; the mask is in world space, so flip it.
          y: 1 - ((gy + 0.5) / SAMPLE_GRID) * 2,
          ink: Math.min(1, ink),
        })
      }
    }
  }

  if (points.length === 0) return null
  return { points, aspect }
}

/**
 * Extracts just the shield outline from the site icon.
 *
 * The icon file is a rounded square with the mark knocked out of it, plus a
 * thermometer drawn on top. Sampled whole, the particles form a *filled
 * rectangle* — a square, not a logo. So the square is dropped and the chest
 * shield path is drawn alone, on transparency: that path is the actual mark
 * silhouette, and it is the same artwork the dashboard's icon comes from.
 *
 * The thermometer is left out on purpose. At particle resolution it is three
 * cells of noise inside the shield, and it muddies the silhouette rather than
 * reading as the hydration detail it is at 22px.
 */
function extractMarkPath(svgMarkup: string): string | null {
  const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null
  const viewBox = root.getAttribute('viewBox') ?? '0 0 64 64'
  const paths = [...root.querySelectorAll('path')]
  // The shield is the only path with a filled `d`-shape (the background square is
  // a <rect>, the thermometer is a stroked path). Pick by geometry, not by order.
  const shield = paths.find((path) => {
    const fill = path.getAttribute('fill') ?? ''
    const d = path.getAttribute('d') ?? ''
    return !path.getAttribute('stroke') && (fill !== 'none') && d.length > 40
  })
  if (!shield) return null
  const d = shield.getAttribute('d')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${d}" fill="#fff"/></svg>`
}

/**
 * Serialises the live dashboard wordmark to standalone SVG.
 *
 * The mark is inlined as-is (Lucide strokes with `currentColor` pinned), and the
 * name is drawn as `<text>` in the brand's own computed face and two colours —
 * which is why the particles spell the site name in the site's typography rather
 * than an approximation of it.
 */
function wordmarkToSvg(brand: HTMLElement, width: number, height: number): string | null {
  const markEl = brand.querySelector('.dashboard-brand-mark')
  const wordEl = brand.querySelector('.dashboard-brand-word')
  const accentEl = brand.querySelector('.dashboard-brand-accent')
  if (!markEl || !wordEl || !accentEl) return null

  const svg = markEl.querySelector('svg')
  if (!svg) return null

  const brandBox = brand.getBoundingClientRect()
  const markBox = markEl.getBoundingClientRect()
  const wordBox = wordEl.getBoundingClientRect()
  const wordStyle = getComputedStyle(wordEl)
  const accentStyle = getComputedStyle(accentEl)

  // Work in the brand's own coordinate space and scale the whole thing to fit.
  const inline = svg.cloneNode(true) as SVGSVGElement
  inline.removeAttribute('class')
  inline.setAttribute('x', String(markBox.left - brandBox.left + 1))
  inline.setAttribute('y', String(markBox.top - brandBox.top + 1))
  inline.setAttribute('width', String(markBox.width))
  inline.setAttribute('height', String(markBox.height))
  inline.setAttribute('stroke', accentStyle.color)
  inline.setAttribute('color', accentStyle.color)

  const accentText = accentEl.textContent ?? ''
  const fullText = (wordEl.textContent ?? '').trim()
  const restText = fullText.slice(accentText.length)
  const textX = wordBox.left - brandBox.left
  const baseline = wordBox.top - brandBox.top + wordBox.height / 2
  const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const inner = new XMLSerializer().serializeToString(inline)
  const body = inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
    viewBox="0 0 ${brandBox.width} ${brandBox.height}">
    ${body}
    <text x="${textX}" y="${baseline}" dominant-baseline="middle"
      fill="${accentStyle.color}"
      font-family='${wordStyle.fontFamily.replace(/'/g, '')}'
      font-size="${wordStyle.fontSize}"
      font-weight="${wordStyle.fontWeight}"
      letter-spacing="${wordStyle.letterSpacing === 'normal' ? 0 : wordStyle.letterSpacing}">${escape(accentText)}</text>
    <text x="${textX + measure(accentText, wordStyle)}" y="${baseline}" dominant-baseline="middle"
      fill="${wordStyle.color}"
      font-family='${wordStyle.fontFamily.replace(/'/g, '')}'
      font-size="${wordStyle.fontSize}"
      font-weight="${wordStyle.fontWeight}"
      letter-spacing="${wordStyle.letterSpacing === 'normal' ? 0 : wordStyle.letterSpacing}">${escape(restText)}</text>
  </svg>`
}

/** Width of a run of text in the brand's own face. */
function measure(text: string, style: CSSStyleDeclaration): number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * parseFloat(style.fontSize) * 0.55
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return ctx.measureText(text).width
}

/** Reads the live dashboard wordmark into normalised points. */
export async function buildWordmarkMask(brand: HTMLElement): Promise<MaskBuild | null> {
  const box = brand.getBoundingClientRect()
  if (box.width < 8 || box.height < 8) return null
  const markup = wordmarkToSvg(brand, Math.round(box.width * 2), Math.round(box.height * 2))
  if (!markup) return null
  const image = await decode(markup)
  if (!image) return null
  return readBitmap(image, box.width / box.height)
}

/**
 * Reads the site icon into normalised points, as the mark alone.
 *
 * Falls back to the whole file if the shield path cannot be identified — a
 * filled square is a poor logo, but it beats an intro that never runs.
 */
export async function buildIconMask(svgMarkup: string, aspect = 1): Promise<MaskBuild | null> {
  const markOnly = extractMarkPath(svgMarkup)
  const image = await decode(markOnly ?? svgMarkup)
  if (!image) return null
  // The extracted path has a different aspect from the square icon; the shield
  // is taller than it is wide, so the cloud is not squashed into a square.
  const build = readBitmap(image, markOnly ? 0.82 : aspect)
  return build
}
