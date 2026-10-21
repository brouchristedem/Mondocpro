import { useState } from 'react'

type Acc = typeof import('./account')
interface Props { kind: 'login' | 'pay'; acc: Acc; onClose: () => void; onDone: () => void }

const MSG: Record<string, string> = {
  invalid_txid: 'Cet ID ne ressemble pas à un ID Wave. Il commence par T_ et fait 18 caractères.',
  txid_used: 'Cet ID a déjà servi pour un autre compte.',
}

export default function Modal({ kind, acc, onClose, onDone }: Props) {
  const [email, setEmail] = useState('')
  const [txid, setTxid] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(String((e as Error).message || e)) }
    setBusy(false)
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        {kind === 'login' ? (
          <>
            <h2>Connecte-toi pour télécharger</h2>
            <p>Ton premier document est gratuit. La connexion nous permet de le retrouver, et de garder ton accès à vie si tu passes à la suite.</p>
            <button className="btn" disabled={busy} onClick={() => run(async () => { await acc.loginGoogle(); onDone() })}>Continuer avec Google</button>
            {sent ? <p className="note">Lien envoyé à {email}. Ouvre-le depuis ce téléphone ou cet ordinateur pour te connecter.</p> : (
              <form onSubmit={e => { e.preventDefault(); run(async () => { await acc.sendLink(email.trim()); setSent(true) }) }}>
                <p className="or">ou par email</p>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.com" autoComplete="email" />
                <button className="btn ghost" disabled={busy}>Recevoir un lien de connexion</button>
              </form>
            )}
          </>
        ) : (
          <>
            <h2>Accès à vie : 1 000 F</h2>
            <p>Ton premier document est téléchargé. Pour en faire autant que tu veux, paie <b>une seule fois 1 000 F</b>, c’est valable à vie.</p>
            <ol className="pay">
              <li>Paie 1 000 F par Wave{acc.WAVE_LINK && <> : <a href={acc.WAVE_LINK} target="_blank" rel="noopener noreferrer">ouvrir Wave</a></>}</li>
              <li>Copie l’ID de transaction (il commence par <code>T_</code>)</li>
              <li>Colle-le ici</li>
            </ol>
            <form onSubmit={e => { e.preventDefault(); run(async () => {
              const r = await acc.claim('activate', { txid })
              if (r.status !== 200) throw new Error(MSG[r.error] || 'Vérification impossible, réessaie dans un instant.')
              onDone()
            }) }}>
              <input required value={txid} onChange={e => setTxid(e.target.value)} placeholder="T_XXXXXXXXXXXXXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
              <button className="btn" disabled={busy}>{busy ? 'Vérification…' : 'Activer mon accès à vie'}</button>
            </form>
          </>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}
