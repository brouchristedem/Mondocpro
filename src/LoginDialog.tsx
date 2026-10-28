import { useState } from 'react'

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

/** Connexion facultative : Google ou lien reçu par e-mail. Elle sert à retrouver ses documents sur tous ses appareils. */
export default function LoginDialog({ acc, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
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
      <div className="modal" role="dialog" aria-modal="true" aria-label="Connexion" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        <h2>Retrouve tes documents partout</h2>
        <p>Connecte-toi : tes documents sont gardés dans ton compte et disponibles sur tous tes appareils. C’est gratuit.</p>
        <button className="btn" disabled={busy} onClick={() => run(() => acc.loginGoogle())}>Continuer avec Google</button>
        {sent ? <p className="note">Lien envoyé à {email}. Ouvre-le depuis cet appareil pour te connecter.</p> : (
          <form onSubmit={e => { e.preventDefault(); run(async () => { await acc.sendLink(email.trim()); setSent(true) }) }}>
            <p className="or">ou par e-mail</p>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.com" autoComplete="email" />
            <button className="btn ghost" disabled={busy}>Recevoir un lien de connexion</button>
          </form>
        )}
        {err && <p className="error">{err}</p>}
        <p className="tiny">Sans compte, tout fonctionne aussi : tes documents restent alors sur cet appareil.</p>
      </div>
    </div>
  )
}
