import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { handle, type Db } from './_logic.js'

function app() {
  return getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) })
}

export default async function (req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    const a = app()
    const user = await getAuth(a).verifyIdToken(token)
    if (!user.email_verified) return res.status(403).json({ error: 'email_not_verified' })
    // Pas de `verify` ici : tant qu'aucun prestataire (API Wave Business, CinetPay…) n'est branché,
    // un ID de transaction n'active jamais l'accès tout seul, il est mis en attente de validation manuelle.
    const r = await handle(getFirestore(a) as unknown as Db, user.uid, user.email, req.body ?? {})
    return res.status(r.status).json(r.body)
  } catch (e) {
    // Les erreurs Firestore ont un `code` numérique : ne jamais appeler .startsWith dessus
    const code = String((e as { code?: unknown }).code ?? '')
    return res.status(code.startsWith('auth/') ? 401 : 500).json({ error: 'server' })
  }
}
