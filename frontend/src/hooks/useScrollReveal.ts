import { useLayoutEffect } from 'react'

/** Where the fold sits for reveal purposes: 12% up from the bottom edge. */
const FOLD_RATIO = 0.88

/**
 * Reveals `.scroll-section` blocks as they scroll into view.
 *
 * Three properties matter more than the animation itself, and each one exists
 * because the obvious implementation gets it wrong:
 *
 * 1. Nothing is ever hidden that cannot be shown again. The hidden state lives
 *    behind `.is-reveal-ready`, a class this hook adds itself. No script, no
 *    observer, or a throw before that line all leave the page at full opacity.
 *
 * 2. No flash. The class is added in a layout effect, which runs before the
 *    browser paints, so the hidden state is never applied to something the user
 *    has already seen. With a passive effect the page paints fully visible, then
 *    blanks, then fades back in — worse than no animation at all.
 *
 * 3. Content already on screen is not animated. A section above the fold has
 *    already "entered" by the time the page opens, so it is shown immediately
 *    and only what is genuinely below the fold is held back.
 */
export function useScrollReveal() {
  useLayoutEffect(() => {
    const root = document.querySelector('[data-scroll-reveal]')
    if (!root) return

    const sections = [...root.querySelectorAll('.scroll-section')]

    // A user who lands on a deep link (#official-warnings) arrives mid-page.
    // Animating everything above the target would be motion underneath them.
    const showAll = () => {
      root.classList.add('is-reveal-ready')
      for (const section of sections) section.classList.add('is-revealed')
    }

    if (window.location.hash) {
      showAll()
      return
    }

    // `in` is not enough: an environment can define the property and leave it
    // undefined, which passes `in` and then throws on construction.
    if (typeof window.IntersectionObserver !== 'function') {
      showAll()
      return
    }

    // Marked ready only now, before paint, with the observer about to exist.
    root.classList.add('is-reveal-ready')

    const fold = window.innerHeight * FOLD_RATIO
    const pending: Element[] = []
    for (const section of sections) {
      // Already visible, including after a scroll restoration: show it now.
      if (section.getBoundingClientRect().top < fold) section.classList.add('is-revealed')
      else pending.push(section)
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        // One-way: once shown, this element has no work left to do.
        observer.unobserve(entry.target)
      }
    }, {
      // Fires a little before the block reaches the fold, so the motion has
      // finished by the time it is properly in view rather than starting as it
      // lands.
      //
      // threshold is 0, not a fraction: a threshold is measured against the
      // *section*, so a section taller than the screen on a short viewport can
      // never reach it and would stay invisible. Any visible pixel inside the
      // margin is enough.
      rootMargin: `0px 0px -12% 0px`,
      threshold: 0,
    })

    for (const section of pending) observer.observe(section)

    return () => {
      observer.disconnect()
      root.classList.remove('is-reveal-ready')
    }
  }, [])
}
