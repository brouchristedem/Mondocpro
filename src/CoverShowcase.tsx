import { useMemo } from 'react'
import { COVER_TEMPLATES, SAMPLE_COVER } from './lib/coverTemplates'
import { coverSheetHtml } from './lib/coverHtml'
import { MiniSheet } from './CoverPicker'

/** Accueil : les 10 pages de garde, avec un texte d'exemple. */
export default function CoverShowcase({ onStart }: { onStart: () => void }) {
  const items = useMemo(() => COVER_TEMPLATES.map(t => ({ t, html: coverSheetHtml({ ...SAMPLE_COVER, enabled: true, template: t.id }) })), [])
  return (
    <div className="strip" role="list">
      {items.map(({ t, html }) => (
        <button key={t.id} className="strip-it" role="listitem" onClick={onStart} aria-label={`Page de garde ${t.name} : commencer`}>
          <MiniSheet html={html} width={176} />
          <b>{t.name}</b><small>{t.tagline}</small>
        </button>
      ))}
    </div>
  )
}
