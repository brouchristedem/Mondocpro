import { useEffect, useRef } from 'react'

/** Comportement commun des fenêtres : Échap ferme, la page derrière ne défile plus, le focus entre dans la fenêtre puis revient où il était. */
export function useDialog(onClose: () => void, locked = false) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    const first = ref.current?.querySelector<HTMLElement>('input:not([type=file]), textarea, select')
    ;(first ?? ref.current?.querySelector<HTMLElement>('button, a'))?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) close.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      html.style.overflow = prevOverflow
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [locked])
  return ref
}
