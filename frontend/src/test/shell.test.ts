import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getDocumentTitle } from '../navigation'

const html = readFileSync('index.html', 'utf8')

describe('document shell', () => {
  it('describes the uploaded screens and leaves the single skip link to the React layout', () => {
    expect(html).not.toContain('Disconnected demo website')
    expect(html).toContain('Heat Shield AI dashboard, assistant, and chat history')
    expect(html).toContain('<meta name="theme-color" content="#090909" />')
    expect(html).not.toContain('class="skip-link"')
    expect(html).toContain('<div id="root"></div>')
  })

  it('normalizes trailing slashes and only names the uploaded screens', () => {
    expect(getDocumentTitle('/assistant/')).toBe('AI Assistant · Heat Shield AI')
    expect(getDocumentTitle('/menu')).toBe('Menu · Heat Shield AI')
    expect(getDocumentTitle('/monitor')).toBe('Dashboard · Heat Shield AI')
  })
})
