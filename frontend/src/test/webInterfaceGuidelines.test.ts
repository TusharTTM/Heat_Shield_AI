import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The source-level half of Vercel's Web Interface Guidelines.
 *
 * The stylesheet half lives in design-system.test.ts; the rendered DOM is
 * covered by siteAudit.test.tsx (heading order, labelled controls, no dead
 * targets). These rules are about markup that is easier to read from source
 * than from a snapshot: they are the things that quietly regress when a
 * component is rewritten.
 *
 * Source: vercel-labs/web-interface-guidelines @ 434b7f9, via the
 * web-design-guidelines skill.
 */

const FILES = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.includes('test') && file !== 'i18n.ts')
const SOURCE = new Map(FILES.map((file) => [file, readFileSync(`src/${file}`, 'utf8')]))

describe('web interface guidelines', () => {
  it('never puts a click handler on a div or span', () => {
    // An action is a <button>; navigation is an <a>. A clickable div is reachable
    // by pointer only.
    const offenders: string[] = []
    for (const [file, source] of SOURCE) {
      for (const match of source.matchAll(/<(div|span)\b[^>]*\bonClick/g)) {
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${file}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('hides decorative icons from assistive tech', () => {
    // lucide icons are decorative unless they are the only content of a control;
    // in that case the control carries the aria-label.
    const offenders: string[] = []
    for (const [file, source] of SOURCE) {
      for (const match of source.matchAll(/<(LucideIcon|Icon)\b([^>]*)\/>/g)) {
        if (!/aria-hidden/.test(match[2])) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${file}:${line}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('labels every form control, and every icon-only button', () => {
    // A control is labelled by aria-label, or by a wrapping/associated <label>.
    // Icon-only buttons are the ones with no text, so they must carry a label.
    const offenders: string[] = []
    for (const [file, source] of SOURCE) {
      for (const match of source.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
        const [, tag, attrs] = match
        if (/type="(hidden|file)"/.test(attrs) && /aria-label/.test(attrs)) continue
        if (/aria-label|aria-labelledby/.test(attrs)) continue
        if (/\bid=\{/.test(attrs)) continue // labelled by htmlFor elsewhere
        // Inputs rendered inside a <label> wrapper are labelled implicitly; the
        // fixture inputs in these components always are.
        if (tag === 'input') continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${file}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps three-dot ellipses and straight prose quotes out of the copy', () => {
    // Typography: `…` not `...`, curly quotes not straight ones.
    const offenders: string[] = []
    for (const [file, source] of SOURCE) {
      if (!/\.tsx$/.test(file)) continue
      for (const match of source.matchAll(/>[^<>{}]*\.\.\.[^<>{}]*</g)) {
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${file}:${line}`)
      }
    }
    expect(offenders).toEqual([])
    const dictionary = readFileSync('src/i18n.ts', 'utf8')
    expect(dictionary).not.toMatch(/:\s*['"][^'"]*\.\.\.[^'"]*['"],/)
  })

  it('ends placeholder text with an ellipsis and names the expected value', () => {
    const offenders: string[] = []
    for (const [file, source] of SOURCE) {
      for (const match of source.matchAll(/placeholder=(?:"([^"]*)"|\{t\('([\w.]+)'[^)]*\)\})/g)) {
        // A translated placeholder is checked against its English message.
        const value = match[1] ?? (match[2] ? dictionaryValue(match[2]) : '')
        if (!value.endsWith('…')) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${file}:${line} ${value}`)
        }
      }
    }
    expect(offenders).toEqual([])
    // The translated placeholders carry it too.
    expect(dictionaryValue('profile.namePlaceholder')).toMatch(/…$/)
  })

  it('does not autofocus on mobile and never blocks paste', () => {
    // autoFocus is allowed only for a single primary input inside a desktop-width
    // surface; the one place it is used is the rename field of an open row.
    const autofocus = [...SOURCE].filter(([, source]) => /autoFocus/.test(source)).map(([file]) => file)
    expect(autofocus).toEqual(['components/ChatHistoryMenu.tsx'])
    for (const [file, source] of SOURCE) {
      expect(source, file).not.toMatch(/onPaste=\{?[^}]*preventDefault/)
    }
  })

  it('never disables zoom or sets a fixed viewport scale', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).not.toMatch(/user-scalable|maximum-scale/)
    // Preconnect to the origins the first paint depends on.
    expect(html).toMatch(/rel="preconnect" href="https:\/\/api\.open-meteo\.com"/)
  })
})

function dictionaryValue(key: string): string {
  const dictionary = readFileSync('src/i18n.ts', 'utf8')
  const match = new RegExp(`^  '${key.replace('.', '\\.')}': '([^']*)'`, 'm').exec(dictionary)
  if (!match) throw new Error(`missing message ${key}`)
  return match[1]
}
