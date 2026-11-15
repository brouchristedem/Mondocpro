import { useState } from 'react'
import { useDialog } from './useDialog'

type Acc = typeof import('./account')
interface Props { acc: Acc; onClose: () => void }

const MSG: Record<string, string> = {
  'auth/popup-blocked': 'La fenêtre Google a été bloquée. Utilise le lien par e-mail ci-dessous.',
  'auth/network-request-failed': 'Pas de connexion internet. Réessaie dans un instant.',
  'auth/unauthorized-domain': 'Ce site n’est pas encore autorisé pour la connexion Google. Utilise le lien par e-mail.',
  'auth/invalid-email': 'Cette adresse e-mail ne semble pas valide.',
  'auth/too-many-requests': 'Trop d’essais. Réessaie dans quelques minutes.',
}
const IGNORED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']

/** Connexion : Google ou lien reçu par e-mail. Chaque document est ensuite enregistré dans le compte, sur tous les appareils. */
export default function LoginDialog({ acc, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useDialog(onClose)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) {
      const code = String((e as { code?: string }).code || '')
      if (!IGNORED.includes(code)) setErr(MSG[code] || 'Connexion impossible pour le moment. Réessaie dans un instant.')
    }
    setBusy(false)
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label="Connexion" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        <h2>Connecte-toi pour commencer</h2>
        <p>Tes documents sont enregistrés tout seuls dans ton compte et disponibles sur tous tes appareils. C’est gratuit, sans mot de passe.</p>
        <button className="btn" disabled={busy} onClick={() => run(() => acc.loginGoogle())}>Continuer avec Google</button>
        {sent ? <p className="note">Lien envoyé à {email}. Ouvre-le depuis cet appareil pour te connecter.</p> : (
          <form onSubmit={e => { e.preventDefault(); run(async () => { await acc.sendLink(email.trim()); setSent(true) }) }}>
            <p className="or">ou par e-mail</p>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.com" autoComplete="email" />
            <button className="btn ghost" disabled={busy}>Recevoir un lien de connexion</button>
          </form>
        )}
        {err && <p className="error">{err}</p>}
        <p className="tiny">Ton texte reste privé : toi seul vois tes documents.</p>
      </div>
    </div>
  )
}
