import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Keeps in-page jump links honest now that secondary detail lives inside <details> drawers.
 *
 * When the URL hash changes (jump nav pill, or a link such as /safety#safety-hazards),
 * open every enclosing disclosure and any disclosure immediately after the target, so the
 * reader never lands on a closed box with nothing to read. Honours reduced-motion and only
 * scrolls when the target is not already comfortably in view.
 */
export function HashDisclosureOpener() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    let frame = 0
    // Two frames: one for the route change to paint, one for it to be laid out.
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        let target: HTMLElement | null = null
        try {
          target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
        } catch {
          target = null
        }
        if (!target) return

        let opened = false
        for (let node: HTMLElement | null = target; node; node = node.parentElement) {
          if (node instanceof HTMLDetailsElement && !node.open) {
            node.open = true
            opened = true
          }
        }
        const next = target.nextElementSibling
        if (next instanceof HTMLDetailsElement && !next.open) {
          next.open = true
          opened = true
        }
        // A wrapper section (e.g. #safety-scales) whose only visible content is one drawer.
        const firstChild = target.firstElementChild
        if (firstChild instanceof HTMLDetailsElement && !firstChild.open) {
          firstChild.open = true
          opened = true
        }

        const bounds = target.getBoundingClientRect()
        const comfortable = bounds.top >= 0 && bounds.top < window.innerHeight * 0.6
        if (!opened && comfortable) return

        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, location.pathname])

  return null
}
