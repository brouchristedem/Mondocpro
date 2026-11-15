import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import type { Layout } from './lib/layout'
import type { Settings } from './lib/types'
import { fontInfo } from './lib/fonts'
import { useDialog } from './useDialog'
import { IClose, IPaste } from './icons'

const Preview = lazy(() => import('./Preview'))
export type FocusMode = 'ecrire' | 'apercu'

/** Mode « en grand » : une feuille plein écran pour écrire sans rien autour, ou les vraies pages en grand pour relire. */
export default function Focus({ text, onType, s, layout, start, status, onPaste, onClose }: {
  text: string; onType: (v: string) => void; s: Settings; layout: Layout | null; start: FocusMode; status: string; onPaste: () => void; onClose: () => void
}) {
  const [mode, setMode] = useState<FocusMode>(start)
  const ref = useDialog(onClose)
  const ta = useRef<HTMLTextAreaElement>(null)
  const F = fontInfo(s.font)
  const fit = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px' } }
  useLayoutEffect(fit, [text, mode, s.font, s.size, s.spacing])
  useLayoutEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit) }, [])
  return (
    <div className="focus" ref={ref} role="dialog" aria-modal="true" aria-label="Éditeur en grand">
      <div className="focus-bar">
        <div className="seg" role="group" aria-label="Affichage">
          <button aria-pressed={mode === 'ecrire'} onClick={() => setMode('ecrire')}>Écrire</button>
          <button aria-pressed={mode === 'apercu'} onClick={() => setMode('apercu')}>Aperçu</button>
        </div>
        <span className="status saved" aria-live="polite">{status}</span>
        {mode === 'ecrire' && <button className="btn ghost sm" onClick={onPaste}><IPaste size={18} />Coller</button>}
        <button className="btn sm" onClick={onClose}><IClose size={18} />Réduire</button>
      </div>
      <div className="focus-body">
        {mode === 'ecrire' ? (
          <div className="paper">
            <textarea
              ref={ta} value={text} onChange={e => onType(e.target.value)} spellCheck={false} aria-label="Ton texte" placeholder="Écris ici, ou colle ton texte…"
              style={{ fontFamily: F.css, fontSize: `max(16px, ${s.size}pt)`, lineHeight: s.spacing > 1.3 ? 1.5 : 1.3 }}
            />
          </div>
        ) : !text.trim() ? (
          <p className="hint center">Écris ou colle d’abord ton texte : les pages apparaîtront ici en grand.</p>
        ) : (
          <Suspense fallback={<p className="hint center">Chargement de l’aperçu…</p>}><Preview layout={layout} fill /></Suspense>
        )}
      </div>
    </div>
  )
}
