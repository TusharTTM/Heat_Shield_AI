import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Contrast is computed from the tokens themselves, not asserted from a comment.
 * A stylesheet can look calm and still fail WCAG on the surface text actually
 * sits on, so every pair below is measured against the ground it renders over.
 */

const tokens = readFileSync('src/styles/tokens.css', 'utf8')

function oklchToRgb([L, C, H]: [number, number, number]): [number, number, number] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => {
    const x = Math.max(0, Math.min(1, v))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  }) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]) {
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const x = luminance(a), y = luminance(b)
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return (hi + 0.05) / (lo + 0.05)
}

/** Read a token's oklch triple straight out of tokens.css. */
function token(name: string): [number, number, number] {
  const m = tokens.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`))
  if (!m) throw new Error(`token --${name} is not a literal oklch triple (aliases cannot be measured)`)
  return [Number(m[1]) / 100, Number(m[2]), Number(m[3])]
}

const rgb = (name: string) => oklchToRgb(token(name))

const SURFACES = ['paper', 'paper-2', 'plate'] as const
const BODY_TEXT = ['ink', 'ink-2', 'muted', 'accent-text'] as const

describe('contrast', () => {
  it('keeps every text token at 4.5:1 or better on every ground it sits on', () => {
    const failures: string[] = []
    for (const text of BODY_TEXT) {
      for (const surface of SURFACES) {
        const ratio = contrast(rgb(text), rgb(surface))
        if (ratio < 4.5) failures.push(`${text} on ${surface} = ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('pairs each state text token with its own soft surface', () => {
    const pairs: [string, string][] = [
      ['info-text', 'info-soft'],
      ['risk-low-text', 'risk-low-soft'],
      ['risk-watch-text', 'risk-watch-soft'],
      ['risk-warning-text', 'risk-warning-soft'],
      ['risk-severe-text', 'risk-severe-soft'],
      ['accent-text', 'accent-soft'],
    ]
    const failures = pairs
      .map(([text, surface]) => [text, surface, contrast(rgb(text), rgb(surface))] as const)
      .filter(([, , ratio]) => ratio < 4.5)
      .map(([text, surface, ratio]) => `${text} on ${surface} = ${ratio.toFixed(2)}`)
    expect(failures).toEqual([])
  })

  it('carries plate ink inside every filled risk chip', () => {
    for (const fill of ['risk-low', 'risk-watch', 'risk-warning', 'risk-severe', 'ink']) {
      expect(contrast(rgb('plate-ink'), rgb(fill))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives the focus ring 3:1 against every ground it can appear on', () => {
    for (const surface of SURFACES) {
      expect(contrast(rgb('focus'), rgb(surface))).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the product accent distinguishable from the warning state', () => {
    // The accent is orange and Warning is orange-brown; if they sit too close a
    // primary button reads as a hazard. 0.08 in OKLab lightness/chroma space is
    // roughly the threshold where two fills stop being tellable apart at a glance.
    const toOklab = (name: string) => {
      const [r, g, b] = rgbOf(name)
      const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
      const R = lin(r), G = lin(g), B = lin(b)
      const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
      const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
      const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
      return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
      ]
    }
    const rgbOf = (name: string) => oklchToRgb(token(name))
    const a = toOklab('accent')
    const w = toOklab('risk-warning')
    const dE = Math.hypot(a[0] - w[0], a[1] - w[1], a[2] - w[2]) * 100
    expect(dE).toBeGreaterThanOrEqual(10)
  })
})
