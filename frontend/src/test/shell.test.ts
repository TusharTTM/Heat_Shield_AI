import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '../i18n'
import { getDocumentTitle } from '../navigation'

const html = readFileSync('index.html', 'utf8')

describe('document shell', () => {
  it('describes the uploaded screens and leaves the single skip link to the React layout', () => {
    expect(html).not.toContain('Disconnected demo website')
    expect(html).toContain('Heat Shield AI dashboard, assistant, and chat history')
    expect(html).toContain('<meta name="theme-color" content="#120e09" />')
    expect(html).not.toContain('class="skip-link"')
    expect(html).toContain('<div id="root"></div>')
  })

  it('normalizes trailing slashes and names each uploaded screen', () => {
    expect(getDocumentTitle('/assistant/')).toBe('Assistant · Heat Shield AI')
    expect(getDocumentTitle('/menu')).toBe('Menu · Heat Shield AI')
    expect(getDocumentTitle('/monitor')).toBe('Dashboard · Heat Shield AI')
  })

  it('names metric detail views by metric and day so open tabs stay distinguishable', () => {
    expect(getDocumentTitle('/metric/temperature', 'en', '?day=today')).toBe('Temperature · Today · Heat Shield AI')
    expect(getDocumentTitle('/metric/heat-index', 'en', '?day=yesterday')).toBe('Heat Index · Yesterday · Heat Shield AI')
    // heat-risk was retired: the band lives on heat-index now, so the old URL
    // resolves like any other unknown metric.
    expect(getDocumentTitle('/metric/heat-risk/', 'en', '?day=tomorrow')).toBe('Dashboard · Heat Shield AI')
  })

  it('drops unknown days and unknown metrics instead of naming them wrong', () => {
    expect(getDocumentTitle('/metric/humidity', 'en', '?day=someday')).toBe('Humidity · Heat Shield AI')
    expect(getDocumentTitle('/metric/humidity', 'en', '')).toBe('Humidity · Heat Shield AI')
    expect(getDocumentTitle('/metric/bogus', 'en', '?day=today')).toBe('Dashboard · Heat Shield AI')
  })

  it('translates metric titles with the chosen language', () => {
    expect(getDocumentTitle('/metric/humidity', 'hi', '?day=today')).toBe(`${translate('hi', 'metric.humidity')} · ${translate('hi', 'detail.today')} · Heat Shield AI`)
  })
})
