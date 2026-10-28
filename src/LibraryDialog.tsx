import { useState } from 'react'
import type { Doc } from './storage'

interface Props {
  docs: Doc[]; currentId: string; onOpen: (d: Doc) => void; onDelete: (id: string) => void; onNew: () => void; onClose: () => void
  /** compte : null = non connecté ; undefined = connexion non disponible */
  account?: { email: string | null } | null; syncLabel?: string; onLogin?: () => void; onLogout?: () => void
  /** présent seulement pour le propriétaire */
  onAdmin?: () => void
}

const ago = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (m < 1) return 'à l’instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'hier' : `il y a ${d} jours`
}

/** « Mes documents » : les documents enregistrés sur cet appareil. */
export default function LibraryDialog({ docs, currentId, onOpen, onDelete, onNew, onClose, account, syncLabel, onLogin, onLogout, onAdmin }: Props) {
  const [ask, setAsk] = useState('')
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Mes documents" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        <h2>Mes documents</h2>
        {account === null && onLogin && (
          <div className="acct"><p>Connecte-toi pour retrouver tes documents sur tous tes appareils.</p><button className="btn small" onClick={onLogin}>Se connecter</button></div>
        )}
        {account && (
          <div className="acct on"><p><b>Connecté</b>{account.email ? ` : ${account.email}` : ''}{syncLabel ? ` · ${syncLabel}` : ''}</p>{onAdmin && <button className="btn small" onClick={onAdmin}>Espace admin</button>}{onLogout && <button className="link" onClick={onLogout}>Se déconnecter</button>}</div>
        )}
        {docs.length === 0 ? <p>Rien pour l’instant. Ton travail est enregistré automatiquement dès que tu colles du texte.</p> : (
          <ul className="docs">
            {docs.map(d => (
              <li key={d.id} className={d.id === currentId ? 'cur' : ''}>
                <button className="open" onClick={() => onOpen(d)}><b>{d.name}</b><small>{d.id === currentId ? 'Ouvert · ' : ''}{ago(d.updatedAt)}</small></button>
                {ask === d.id
                  ? <span className="confirm"><button className="link danger" onClick={() => { onDelete(d.id); setAsk('') }}>Supprimer</button><button className="link" onClick={() => setAsk('')}>Annuler</button></span>
                  : <button className="link" onClick={() => setAsk(d.id)} aria-label={`Supprimer ${d.name}`}>Supprimer</button>}
              </li>
            ))}
          </ul>
        )}
        <button className="btn" onClick={onNew}>Nouveau document</button>
        <p className="tiny">{account ? 'Gardés sur cet appareil et dans ton compte.' : 'Enregistrés sur cet appareil, dans ce navigateur.'}</p>
      </div>
    </div>
  )
}
