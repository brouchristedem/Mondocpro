import { useEffect, useMemo, useState } from 'react'
import type { Cover } from './lib/types'
import { COVER_TEMPLATES, SAMPLE_COVER, templateOf } from './lib/coverTemplates'
import { coverSheetHtml, SHEET_PX } from './lib/coverHtml'
import { useDialog } from './useDialog'
import { IBack, IClose, INext, IZoom } from './icons'

/** Données affichées dans les vignettes : ta page de garde si elle est remplie, sinon un exemple (le logo reste le tien). */
export function sampleOrReal(cover: Cover): Cover {
  const filled = !!(cover.title.trim() || cover.school.trim() || cover.author.trim())
  return filled ? cover : { ...cover, ...SAMPLE_COVER }
}

/** Une feuille A4 réduite à la largeur voulue (px). */
export function MiniSheet({ html, width }: { html: string; width: number }) {
  const sc = width / SHEET_PX.w
  return (
    <span className="tpl-sheet" aria-hidden="true" style={{ width, height: SHEET_PX.h * sc }}>
      <span className="tpl-in" style={{ transform: `scale(${sc})` }} dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  )
}

/** Aperçu en grand d'un modèle : on voit tout clairement, on passe d'un modèle à l'autre, puis on choisit. */
function Big({ cover, index, setIndex, onPick, onClose }: { cover: Cover; index: number; setIndex: (i: number) => void; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useDialog(onClose)
  const n = COVER_TEMPLATES.length
  const t = COVER_TEMPLATES[index]
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setIndex((index + n - 1) % n); if (e.key === 'ArrowRight') setIndex((index + 1) % n) }
    document.addEventListener('keydown', k)
    return () => { window.removeEventListener('resize', f); document.removeEventListener('keydown', k) }
  }, [index, n, setIndex])
  const width = Math.max(220, Math.min(SHEET_PX.w * 1.05, vp.w - 28, (vp.h - 190) / (SHEET_PX.h / SHEET_PX.w)))
  const html = useMemo(() => coverSheetHtml({ ...sampleOrReal(cover), template: t.id }), [cover, t.id])
  const real = cover === sampleOrReal(cover)
  return (
    <div className="scrim big" onClick={onClose}>
      <div className="bigbox" ref={ref} role="dialog" aria-modal="true" aria-label={`Modèle ${t.name}`} onClick={e => e.stopPropagation()}>
        <div className="bigbar">
          <button className="roundbtn" onClick={() => setIndex((index + n - 1) % n)} aria-label="Modèle précédent"><IBack size={20} /></button>
          <div className="bigtitle"><b>{index + 1}/{n} · {t.name}</b><small>{t.tagline}{real ? '' : ' · texte d’exemple'}</small></div>
          <button className="roundbtn" onClick={() => setIndex((index + 1) % n)} aria-label="Modèle suivant"><INext size={20} /></button>
          <button className="roundbtn" onClick={onClose} aria-label="Fermer"><IClose size={20} /></button>
        </div>
        <div className="bigstage"><div className="bigpaper"><MiniSheet html={html} width={width} /></div></div>
        <div className="bigfoot"><button className="btn" onClick={() => { onPick(t.id); onClose() }}>Choisir ce modèle</button></div>
      </div>
    </div>
  )
}

/** Galerie des 10 modèles : chaque vignette montre TA page de garde ; la loupe ouvre l'aperçu en grand. */
export default function CoverPicker({ cover, onPick }: { cover: Cover; onPick: (id: string) => void }) {
  const [big, setBig] = useState<number | null>(null)
  const data = useMemo(() => sampleOrReal(cover), [cover])
  const thumbs = useMemo(() => COVER_TEMPLATES.map(t => coverSheetHtml({ ...data, template: t.id })), [data])
  const cur = templateOf(cover.template).id
  return (
    <>
      <div className="tpl-grid" role="radiogroup" aria-label="Modèle de page de garde">
        {COVER_TEMPLATES.map((t, i) => (
          <div key={t.id} className={'tpl' + (cur === t.id ? ' on' : '')}>
            <button type="button" role="radio" aria-checked={cur === t.id} className="tpl-pick" onClick={() => onPick(t.id)}>
              <MiniSheet html={thumbs[i]} width={136} />
              <b>{t.name}</b>
              <small>{t.tagline}</small>
            </button>
            <button type="button" className="tpl-zoom" onClick={() => setBig(i)} aria-label={`Voir le modèle ${t.name} en grand`}><IZoom size={18} /></button>
          </div>
        ))}
      </div>
      {big !== null && <Big cover={cover} index={big} setIndex={setBig} onPick={onPick} onClose={() => setBig(null)} />}
    </>
  )
}
