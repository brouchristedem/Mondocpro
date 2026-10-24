import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Db } from './_logic.js'
import { cinetpay, cinetpayConfigured } from './_cinetpay.js'
import { handleNotify } from './_pay.js'

function app() {
  return getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) })
}

/** Webhook (notify_url) : le prestataire peut sonder l'adresse en GET, puis envoie un POST à chaque changement de statut. */
export default async function (req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!cinetpayConfigured()) return res.status(503).json({ error: 'payment_unavailable' })
  try {
    const r = await handleNotify(getFirestore(app()) as unknown as Db, cinetpay, req.body)
    return res.status(r.status).json(r.body)
  } catch {
    return res.status(500).json({ ok: false }) // 500 : le prestataire réessaiera plus tard, ce qu'on veut en cas de panne
  }
}
