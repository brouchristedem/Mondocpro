import { useCallback, useEffect, useState } from 'react'
import type { AdminState } from './account'

type Acc = typeof import('./account')

/** Espace admin : nombre d'utilisateurs et choix d'afficher ce nombre sur la page d'accueil. */
export default function AdminDialog({ acc, onClose }: { acc: Acc; onClose: () => void }) {
  const [st, setSt] = useState<AdminState | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const call = useCallback(async (show?: boolean) => {
    setBusy(true); setErr('')
    try {
      const r = await acc.admin(show === undefined ? { action: 'stats' } : { action: 'set', showUserCount: show })
      if (r.status === 200 && r.state) setSt(r.state)
      else setErr(r.status === 403 ? 'Accès refusé : ce compte n’est pas administrateur.' : 'Impossible de charger les chiffres. Réessaie dans un instant.')
    } catch { setErr('Impossible de charger les chiffres. Réessaie dans un instant.') }
    setBusy(false)
  }, [acc])
  useEffect(() => { call() }, [call])

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Espace admin" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        <h2>Espace admin</h2>
        {st && (
          <>
            <div className="stats">
              <div><b>{st.total.toLocaleString('fr-FR')}</b><span>utilisateurs</span></div>
              <div><b>{st.today.toLocaleString('fr-FR')}</b><span>aujourd’hui</span></div>
              <div><b>{st.week.toLocaleString('fr-FR')}</b><span>7 derniers jours</span></div>
            </div>
            <label className="check">
              <input type="checkbox" checked={st.showUserCount} disabled={busy} onChange={e => call(e.target.checked)} />
              <span><b>Afficher le nombre d’utilisateurs sur la page d’accueil</b><small>{st.showUserCount ? `Les visiteurs voient « ${st.total.toLocaleString('fr-FR')} utilisateurs ». Mise à jour sous 5 minutes.` : 'Masqué : les visiteurs ne voient rien.'}</small></span>
            </label>
          </>
        )}
        {!st && !err && <p>Chargement…</p>}
        {err && <p className="error">{err}</p>}
        <button className="btn ghost" disabled={busy} onClick={() => call()}>{busy ? 'Chargement…' : 'Actualiser'}</button>
      </div>
    </div>
  )
}
