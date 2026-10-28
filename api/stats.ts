import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getFirestore } from 'firebase-admin/firestore'
import { adminApp, userStats } from './_users.js'

/** Public : renvoie le nombre d'utilisateurs seulement si le propriétaire a activé l'affichage depuis l'admin. */
export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  try {
    const a = adminApp()
    const cfg = await getFirestore(a).doc('config/site').get()
    if (cfg.data()?.showUserCount !== true) return res.status(200).json({ count: null })
    return res.status(200).json({ count: (await userStats(a)).total })
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ count: null })
  }
}
