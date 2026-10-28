import { useEffect, useState } from 'react'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Installation de l'application : bouton natif sur Chrome/Android, consignes sur iPhone. */
export function useInstall() {
  const [ev, setEv] = useState<BIPEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())
  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setEv(e as BIPEvent) }
    const onDone = () => { setInstalled(true); setEv(null) }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onDone)
    return () => { window.removeEventListener('beforeinstallprompt', onBip); window.removeEventListener('appinstalled', onDone) }
  }, [])
  return {
    installed,
    canPrompt: !!ev,
    ios: isIOS(),
    prompt: async () => { if (!ev) return false; await ev.prompt(); const r = await ev.userChoice; setEv(null); return r.outcome === 'accepted' },
  }
}
