import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

export function adminApp(): App {
  return getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) })
}

export interface UserStats { total: number; today: number; week: number }

/** Nombre de comptes créés (Firebase Authentication) : au total, aujourd'hui (jour UTC = Abidjan) et sur 7 jours. */
export async function userStats(a: App): Promise<UserStats> {
  const now = Date.now()
  const day = new Date(now); day.setUTCHours(0, 0, 0, 0)
  const weekAgo = now - 7 * 864e5
  const out: UserStats = { total: 0, today: 0, week: 0 }
  let token: string | undefined
  do {
    const page = await getAuth(a).listUsers(1000, token)
    for (const u of page.users) {
      out.total++
      const t = Date.parse(u.metadata.creationTime)
      if (t >= day.getTime()) out.today++
      if (t >= weekAgo) out.week++
    }
    token = page.pageToken
  } while (token)
  return out
}
