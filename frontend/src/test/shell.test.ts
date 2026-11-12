import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getDocumentTitle } from '../navigation'

const html = readFileSync('index.html', 'utf8')

describe('document shell', () => {
  it('uses live weather metadata and leaves the single skip link to the React layout', () => {
    expect(html).not.toContain('Disconnected demo website')
    expect(html).toContain('source-aware weather and CAMS air-quality monitoring')
    // The browser chrome tint follows the concrete paper token.
    expect(html).toContain('<meta name="theme-color" content="#adaaa5" />')
    expect(html).not.toContain('class="skip-link"')
    expect(html).toContain('<div id="root"></div>')
  })

  it('normalizes trailing slashes and labels unknown routes accurately', () => {
    expect(getDocumentTitle('/forecast/', 'Mumbai')).toBe('5-day forecast for Mumbai · HeatShield AI')
    expect(getDocumentTitle('/not-a-real-page', 'Mumbai')).toBe('Page not found · HeatShield AI')
  })
})
