import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { WeatherError, WeatherLoading } from '../components/ui'

/** Testing Library does not unmount between tests in this setup, so each render starts clean. */
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
afterEach(cleanup)

const sheet = readFileSync('src/styles/index.css', 'utf8')

/**
 * The three states a data region can be in that are never visible in the happy
 * path. They still have to be styled and readable: a bare error with no rules
 * looks like a broken page, which is the worst moment to look broken.
 */
describe('unhappy-path states', () => {
  it('styles the error state with the severe colour rather than the default ink', () => {
    expect(sheet).toMatch(/\.weather-error\s*\{[^}]*var\(--risk-severe\)/)
    expect(sheet).toMatch(/\.weather-error h2\s*\{[^}]*var\(--risk-severe-text\)/)
  })

  it('renders the error state as an alert with a retry that is a real button', () => {
    render(<WeatherError name="Mumbai" error="CAMS timed out" onRetry={() => {}} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Weather unavailable for Mumbai')
    expect(alert).toHaveTextContent('CAMS timed out')
    // It must never present a substituted number as if it were live.
    expect(alert).toHaveTextContent(/No hardcoded readings are shown as live weather/)
    const retry = screen.getByRole('button', { name: /Try again/ })
    expect(retry).toHaveAttribute('type', 'button')
  })

  it('renders a loading state that names the place and is not an alert', () => {
    render(<WeatherLoading name="Delhi" />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Delhi/)).toBeInTheDocument()
  })

  it('gives every state container a visible border and padding', () => {
    for (const selector of ['.weather-state', '.empty-state', '.empty-alert-state']) {
      const rule = new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{([^}]*)\\}`).exec(sheet)
      expect(rule, `${selector} has no rule`).not.toBeNull()
      expect(rule![1]).toMatch(/border:/)
      expect(rule![1]).toMatch(/padding:/)
    }
  })
})
