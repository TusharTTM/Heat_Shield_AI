import { useEffect, useState } from 'react'

/**
 * Returns the extra class the site shell wears while the entry animation is
 * running: settles from a shallow blur and a hair of scale, then returns to
 * nothing and stays there.
 *
 * It reads the same clock the intro writes, rather than being driven by the
 * intro component — the overlay and the shell are in different subtrees, and
 * threading a callback between them would couple the dashboard to a decorative
 * animation. If the intro never runs, this observes nothing and the shell is
 * never touched.
 */
export function useIntroShell() {
  const [state, setState] = useState<'' | ' is-under-intro' | ' is-intro-clear'>('')

  useEffect(() => {
    const root = document.documentElement
    const sync = () => {
      if (root.dataset.intro === 'running') setState(' is-under-intro')
      else if (root.dataset.intro === 'done') setState(' is-intro-clear')
      else setState('')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-intro'] })
    return () => observer.disconnect()
  }, [])

  return state
}
