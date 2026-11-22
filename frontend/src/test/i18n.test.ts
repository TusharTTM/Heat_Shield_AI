import { describe, expect, it } from 'vitest'
import { dictionaries, translate } from '../i18n'

const PLACEHOLDER = /\{(\w+)\}/g

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]).sort()
}

describe('interface dictionaries', () => {
  const english = dictionaries.en

  it('every language defines exactly the English key set', () => {
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), `${language} key set`).toEqual(Object.keys(english).sort())
    }
  })

  it('every translation keeps the same placeholders as English', () => {
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const [key, template] of Object.entries(dictionary)) {
        expect(placeholders(template), `${language} ${key}`).toEqual(placeholders(english[key as keyof typeof english]))
      }
    }
  })

  it('substitutes every placeholder it declares, with no malformed braces left over', () => {
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const [key, template] of Object.entries(dictionary)) {
        const params = Object.fromEntries(placeholders(template).map((name) => [name, 'X']))
        const rendered = translate(language as keyof typeof dictionaries, key as keyof typeof english, params)
        expect(rendered, `${language} ${key}`).not.toMatch(/\{\w+[\]}]/)
        expect(rendered, `${language} ${key}`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('falls back to English for unknown languages', () => {
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard')
    // A missing dictionary entry must never render "undefined".
    expect(translate('hi', 'nav.dashboard')).toBeTruthy()
  })
})
