import { useMemo } from 'react'
import type { Cover } from './lib/types'
import { COVER_TEMPLATES, SAMPLE_COVER } from './lib/coverTemplates'
import { coverHtml } from './lib/coverHtml'

const W = 453.55, H = 700.2 // zone de texte A4 (marges 2,5 cm), en pt

/** Galerie des 10 modèles : chaque vignette montre TA page de garde (textes d'exemple tant que les champs sont vides). */
export default function CoverPicker({ cover, onPick }: { cover: Cover; onPick: (id: string) => void }) {
  const filled = !!(cover.title.trim() || cover.school.trim() || cover.author.trim())
  const thumbs = useMemo(() => COVER_TEMPLATES.map(t => {
    const data: Cover = filled ? { ...cover, enabled: true, template: t.id } : { ...cover, ...SAMPLE_COVER, logo: cover.logo, enabled: true, template: t.id }
    return { id: t.id, html: coverHtml(data, W, H) }
  }), [cover, filled])
  const cur = cover.template ?? COVER_TEMPLATES[0].id
  return (
    <div className="tpl-grid" role="radiogroup" aria-label="Modèle de page de garde">
      {COVER_TEMPLATES.map((t, i) => (
        <button key={t.id} type="button" role="radio" aria-checked={cur === t.id} className={'tpl' + (cur === t.id ? ' on' : '')} onClick={() => onPick(t.id)}>
          <span className="tpl-sheet" aria-hidden="true"><span className="sheet" style={{ width: '595.3pt', height: '841.9pt' }}><span className="bd" style={{ left: '70.85pt', top: '70.85pt', width: `${W}pt`, height: `${H}pt`, display: 'block' }} dangerouslySetInnerHTML={{ __html: thumbs[i].html }} /></span></span>
          <b>{t.name}</b>
          <small>{t.tagline}</small>
        </button>
      ))}
    </div>
  )
}
