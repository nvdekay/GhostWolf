import { useSyncExternalStore } from 'react'

function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => matches(query),
  )
}

/** Bố cục máy tính bàn: từ 1024px trở lên. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

export function prefersReducedMotion(): boolean {
  return matches('(prefers-reduced-motion: reduce)')
}
