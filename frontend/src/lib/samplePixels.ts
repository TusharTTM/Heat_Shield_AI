/**
 * Turns an on-page SVG into a coarse grid of cells: is this cell inside the
 * glyph, and if so, roughly how solid is the ink there?
 *
 * The point is an *honest* silhouette. Hand-writing a shield mask would drift
 * from the real icon the moment the icon or its stroke weight changed; sampling
 * the element that is actually on the page cannot. Resolution is deliberately
 * coarse — one cell should read as a pixel, not as an anti-aliased edge.
 */

export interface PixelCell {
  /** Column and row in the grid. */
  col: number
  row: number
  /** 0 at the glyph's edge, 1 where it is most solid. Drives arrival order. */
  weight: number
}

export interface PixelSample {
  cols: number
  rows: number
  cells: PixelCell[]
}

/** Raster resolution the grid is sampled from; well above `resolution` so each
 *  cell averages many source pixels instead of aliasing. */
const RASTER = 128

/**
 * Rasterises `svg` and resolves with the filled cells.
 *
 * Alpha is read rather than colour, so this works whatever ink the theme uses
 * and never needs to know the accent or the paper.
 *
 * Resolves `null` rather than rejecting on any failure — this is a decorative
 * reveal, and the caller's job is to skip it, not to report it.
 */
export function sampleSvgToPixels(svg: SVGSVGElement, resolution: number): Promise<PixelSample | null> {
  const box = svg.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return Promise.resolve(null)

  // Serialise the live node so the sample uses its real stroke, fill and icon
  // geometry — the same drawing the visitor will later see in the topbar.
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(RASTER))
  clone.setAttribute('height', String(RASTER))
  clone.removeAttribute('class')
  // `currentColor` does not survive serialisation; pin it to opaque white so
  // alpha is the only thing the sample depends on.
  clone.setAttribute('stroke', '#fff')
  clone.setAttribute('color', '#fff')
  const markup = new XMLSerializer().serializeToString(clone)

  return new Promise((resolve) => {
    const image = new Image()
    // Settles either way: a load that never fires must not hang the intro.
    const done = (value: PixelSample | null) => {
      image.onload = null
      image.onerror = null
      resolve(value)
    }
    image.onload = () => done(readCells())
    image.onerror = () => done(null)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

    function readCells(): PixelSample | null {
      const canvas = document.createElement('canvas')
      canvas.width = RASTER
      canvas.height = RASTER
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      try {
        context.clearRect(0, 0, RASTER, RASTER)
        context.drawImage(image, 0, 0, RASTER, RASTER)
      } catch {
        return null
      }

      let data: Uint8ClampedArray
      try {
        data = context.getImageData(0, 0, RASTER, RASTER).data
      } catch {
        // A tainted canvas; nothing to read.
        return null
      }

      const cell = RASTER / resolution
      const cells: PixelCell[] = []
      let peak = 0

      for (let row = 0; row < resolution; row++) {
        for (let col = 0; col < resolution; col++) {
          let sum = 0
          let count = 0
          for (let y = Math.floor(row * cell); y < Math.floor((row + 1) * cell); y++) {
            for (let x = Math.floor(col * cell); x < Math.floor((col + 1) * cell); x++) {
              sum += data[(y * RASTER + x) * 4 + 3]
              count++
            }
          }
          const alpha = count ? sum / count / 255 : 0
          // Below this a cell is anti-aliasing from a neighbouring stroke, and
          // including it would fatten the glyph into a blob.
          if (alpha > 0.14) {
            cells.push({ col, row, weight: alpha })
            peak = Math.max(peak, alpha)
          }
        }
      }

      if (cells.length === 0) return null
      // Normalise so the solid parts of the glyph are 1.
      for (const c of cells) c.weight = peak ? Math.min(1, c.weight / peak) : 1
      return { cols: resolution, rows: resolution, cells }
    }
  })
}
