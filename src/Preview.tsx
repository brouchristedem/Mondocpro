import { useEffect, useRef, useState } from 'react'
import type { Layout } from './lib/layout'

const STEPS = [0, 0.75, 1] // 0 = ajusté à la largeur de l'écran

/** Les vraies pages, avec pied de page et sommaire numérotés : ce que tu vois est ce que Word affichera. */
export default function Preview({ layout }: { layout: Layout | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(800)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setAvail(Math.max(240, el.clientWidth - 16))
    const ro = new ResizeObserver(fit)
    ro.observe(el); fit()
    return () => ro.disconnect()
  }, [])

  const px = (landscape: boolean) => (landscape ? 842 : 595.3) * (96 / 72)
  const total = layout?.pages.length ?? 0
  const zoomed = STEPS[step] > 0
  const label = zoomed ? `${Math.round(STEPS[step] * 100)} %` : 'Ajusté'
  return (
    <div className="preview" ref={box}>
      {layout && (
        <div className="zoombar" role="group" aria-label="Zoom de l’aperçu">
          <button onClick={() => setStep(v => Math.max(0, v - 1))} disabled={step === 0} aria-label="Réduire">−</button>
          <span aria-live="polite">{label}</span>
          <button onClick={() => setStep(v => Math.min(STEPS.length - 1, v + 1))} disabled={step === STEPS.length - 1} aria-label="Agrandir">+</button>
        </div>
      )}
      {!layout && <p className="hint">Chargement de l’aperçu…</p>}
      <div className={'pages' + (zoomed ? ' zoomed' : '')}>
        {layout?.pages.map((p, i) => {
          const z = zoomed ? STEPS[step] : Math.min(1, avail / px(p.landscape))
          return (
            <figure className="pg" key={i} style={{ zoom: z } as React.CSSProperties}>
              <div dangerouslySetInnerHTML={{ __html: p.html }} />
              <figcaption>{p.kind === 'cover' ? 'Page de garde' : `Page ${i + 1} sur ${total}`}</figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
