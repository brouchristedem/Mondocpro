import { useState } from 'react'
import { isIOS } from './install'

interface Props { defaultName: string; pages: number | null; busy: boolean; error: string; onPick: (kind: 'docx' | 'pdf', name: string) => void; onClose: () => void }

/** Après « Télécharger » : on choisit Word ou PDF. */
export default function DownloadDialog({ defaultName, pages, busy, error, onPick, onClose }: Props) {
  const [name, setName] = useState(defaultName)
  const clean = name.trim() || 'document'
  return (
    <div className="scrim" onClick={busy ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Télécharger" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer" disabled={busy}>×</button>
        <h2>Télécharger ton document</h2>
        {pages !== null && <p className="ok">{pages} page{pages > 1 ? 's' : ''} · prêt</p>}
        <label className="field"><span>Nom du fichier</span><input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></label>
        <div className="formats">
          <button className="format" disabled={busy} onClick={() => onPick('docx', clean)}>
            <b>Word</b><span>.docx · modifiable</span>
          </button>
          <button className="format" disabled={busy} onClick={() => onPick('pdf', clean)}>
            <b>PDF</b><span>.pdf · prêt à envoyer</span>
          </button>
        </div>
        <p className="tiny">{busy ? 'Préparation du fichier…' : isIOS()
          ? 'PDF : touche Partager dans la fenêtre qui s’ouvre, puis « Enregistrer dans Fichiers ».'
          : 'PDF : dans la fenêtre qui s’ouvre, choisis « Enregistrer au format PDF ».'}</p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
