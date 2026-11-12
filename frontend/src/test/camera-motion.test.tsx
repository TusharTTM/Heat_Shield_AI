import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getCurrentWeather, getWeather } from '../api/openMeteo'
import { airQualityResult, currentResult, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getCurrentWeather: vi.fn(), getAirQuality: vi.fn() }
})
vi.mock('react-chartjs-2', () => ({ Line: () => <div /> }))
vi.mock('../components/RegionMap', () => ({ RegionMap: () => <div /> }))

// Minimal 2D context so the 3D canvas path (and therefore the camera toolbar) is active.
function createMockCanvas2DContext(): CanvasRenderingContext2D {
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return {
    save: noop, restore: noop, scale: noop, setTransform: noop, clearRect: noop, fillRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, ellipse: noop, arc: noop,
    roundRect: noop, fill: noop, stroke: noop, fillText: noop,
    measureText: (text: string) => ({ width: text.length * 6.5 } as TextMetrics),
    createRadialGradient: () => gradient as unknown as CanvasGradient,
    createLinearGradient: () => gradient as unknown as CanvasGradient,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: 'round', font: '',
    textAlign: 'left', textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D
}

function renderWithRealCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((id: string) => (id === '2d' ? createMockCanvas2DContext() : null)) as typeof HTMLCanvasElement.prototype.getContext,
  )
  return render(
    <AppProvider>
      <WeatherProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </WeatherProvider>
    </AppProvider>,
  )
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.restoreAllMocks()
  vi.mocked(getWeather).mockReset().mockImplementation(async (r) => weatherResult(r.slug))
  vi.mocked(getCurrentWeather).mockReset().mockImplementation(async (r) => currentResult(r.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (r) => airQualityResult(r.slug))
})

describe('3D camera motion', () => {
  it('eases camera buttons over several frames instead of jumping', async () => {
    const frames: FrameRequestCallback[] = []
    let handle = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); handle += 1; return handle })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const user = userEvent.setup()
    renderWithRealCanvas()
    await screen.findByRole('heading', { name: 'Temperature' })

    await user.click(screen.getByRole('button', { name: 'Zoom 3D view in' }))
    // A tween was scheduled rather than a single synchronous state change...
    expect(frames.length).toBeGreaterThan(0)

    // ...and it continues across frames until it settles.
    let now = performance.now()
    let executed = 0
    for (let i = 0; i < 60 && frames.length > 0; i += 1) {
      const next = frames.shift()!
      now += 16
      next(now)
      executed += 1
    }
    // The tween runs across many frames (260ms at ~16ms per frame) rather than one jump.
    expect(executed).toBeGreaterThan(5)
    expect(frames.length).toBe(0)
  })

  it('applies camera buttons instantly when reduced motion is requested', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const user = userEvent.setup()
    renderWithRealCanvas()
    await screen.findByRole('heading', { name: 'Temperature' })

    const before = raf.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Zoom 3D view in' }))
    // No camera tween frames are scheduled beyond the canvas redraw effect.
    const cameraTweens = raf.mock.calls.slice(before).filter(([cb]) => typeof cb === 'function')
    expect(cameraTweens.length).toBeLessThan(3)
  })
})
