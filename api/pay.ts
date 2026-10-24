import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import type { Db } from './_logic.js'
import { cinetpay, cinetpayConfigured } from './_cinetpay.js'
import { isPayId, settlePayment, startPayment } from './_pay.js'

const PRICE = Number(process.env.PRICE_FCFA) || 1000 // prix décidé ici, jamais par le navigateur

function app() {
  return getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) })
}

/** POST : démarre un paiement (renvoie l'adresse de la page de paiement). GET ?tx=… : vérifie une commande au retour du paiement. */
export default async function (req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (!cinetpayConfigured()) return res.status(503).json({ error: 'payment_unavailable' })
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    const a = app()
    const user = await getAuth(a).verifyIdToken(token)
    if (!user.email_verified) return res.status(403).json({ error: 'email_not_verified' })
    const db = getFirestore(a) as unknown as Db

    if (req.method === 'POST') {
      const r = await startPayment(db, cinetpay, {
        uid: user.uid, email: user.email, name: user.name as string | undefined, price: PRICE,
        siteUrl: (process.env.SITE_URL || '').replace(/\/+$/, ''), newId: () => 'mp' + randomUUID().replace(/-/g, '').slice(0, 24),
      })
      return res.status(r.status).json(r.body)
    }
    const tx = req.query.tx
    if (!isPayId(tx)) return res.status(404).json({ error: 'not_found' })
    const r = await settlePayment(db, cinetpay, tx, user.uid)
    return r ? res.status(200).json(r) : res.status(404).json({ error: 'not_found' })
  } catch (e) {
    const code = String((e as { code?: unknown }).code ?? '')
    return res.status(code.startsWith('auth/') ? 401 : 500).json({ error: 'server' })
  }
}
