import { useEffect, useRef, useState } from 'react'
import type { Layout } from './lib/layout'

/** Les vraies pages, avec pied de page et sommaire numérotés : ce que tu vois est ce que Word affichera. */
export default function Preview({ layout }: { layout: Layout | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(800)

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
  return (
    <div className="preview" ref={box}>
      {!layout && <p className="hint">Chargement de l’aperçu…</p>}
      <div className="pages">
        {layout?.pages.map((p, i) => {
          const z = Math.min(1, avail / px(p.landscape))
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
