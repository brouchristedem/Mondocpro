import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { adminApp, userStats } from './_users.js'

/** Espace admin : réservé aux adresses e-mail vérifiées de ADMIN_EMAILS (par défaut, le propriétaire). */
export default async function (req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    const a = adminApp()
    const user = await getAuth(a).verifyIdToken(token)
    const admins = (process.env.ADMIN_EMAILS ?? 'brouchristedem@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!user.email_verified || !user.email || !admins.includes(user.email.toLowerCase())) return res.status(403).json({ error: 'forbidden' })

    const ref = getFirestore(a).doc('config/site')
    const body = (req.body ?? {}) as { action?: string; showUserCount?: unknown }
    if (body.action === 'set') await ref.set({ showUserCount: body.showUserCount === true }, { merge: true })
    else if (body.action !== 'stats') return res.status(400).json({ error: 'bad_request' })

    const [stats, cfg] = await Promise.all([userStats(a), ref.get()])
    return res.status(200).json({ ...stats, showUserCount: cfg.data()?.showUserCount === true })
  } catch (e) {
    const code = String((e as { code?: unknown }).code ?? '')
    return res.status(code.startsWith('auth/') ? 401 : 500).json({ error: 'server' })
  }
}
