import { readFileSync, readdirSync } from 'node:fs'
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

  it('defines no message that the interface never shows', () => {
    // Retired screens leave their copy behind; the slogan and mission panel both
    // did. Keys are matched against every non-test source file, and namespaces
    // reached through a template literal (`alert.${type}`) count as used.
    const sources = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !file.includes('test') && file !== 'i18n.ts')
      .map((file) => readFileSync(`src/${file}`, 'utf8'))
      .join('\n')
    const dynamic = new Set([...sources.matchAll(/t\(`(\w+)\.\$\{/g)].map((m) => m[1]))
    const unused = Object.keys(english).filter((key) =>
      !dynamic.has(key.split('.')[0]) && !sources.includes(`'${key}'`) && !sources.includes(`"${key}"`),
    )
    expect(unused, `unused messages: ${unused.join(', ')}`).toEqual([])
  })

  it('never tells someone a period of lower heat is safe', () => {
    // Standing safety rule: a comparatively cooler window is a comparison, not a
    // guarantee. The required phrasing is a negation ("not an all-clear", "not a
    // safe period"); the defect is the affirmative claim. Strip the required
    // negations, then nothing may read as reassurance.
    const NEGATED = /\b(?:not|never)\s+(?:an?\s+)?(?:all[- ]clear|safe(?:\s+(?:period|window|hour|time|day))?|danger[- ]free|harmless)\b/gi
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const [key, template] of Object.entries(dictionary)) {
        const affirmative = template.replace(NEGATED, ' ')
        expect(affirmative, `${language} ${key}`).not.toMatch(/\ball[- ]clear\b/i)
        expect(affirmative, `${language} ${key}`).not.toMatch(/\b(?:is|are|as)\s+(?:a\s+)?safe\b/i)
        expect(affirmative, `${language} ${key}`).not.toMatch(/\bsafe\s+(?:period|window|hour|time|day)\b/i)
        expect(affirmative, `${language} ${key}`).not.toMatch(/\b(?:danger[- ]free|harmless)\b/i)
      }
    }
    // And the caveat itself must exist, in every language, and must negate.
    const NEGATION = {
      en: /\bnot\b/i, hi: /नहीं/, mr: /नाही/, bn: /নয়/, ta: /அல்ல/, te: /కాదు/,
    }
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      expect(dictionary['plan.lowerCaveat'], language).toMatch(NEGATION[language as keyof typeof NEGATION])
    }
  })

  it('falls back to English for unknown languages', () => {
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard')
    // A missing dictionary entry must never render "undefined".
    expect(translate('hi', 'nav.dashboard')).toBeTruthy()
  })
})
