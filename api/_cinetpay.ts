// Client CinetPay (serveur uniquement), même API que celle de moncvproci.
// Variables Vercel : CINETPAY_BASE_URL (sans « /v1 » ni « / » final), CINETPAY_API_KEY, CINETPAY_API_PASSWORD
import type { Gateway } from './_pay.js'

const baseUrl = () => (process.env.CINETPAY_BASE_URL || '').replace(/\/+$/, '')
export const cinetpayConfigured = () => !!(baseUrl() && process.env.CINETPAY_API_KEY && process.env.CINETPAY_API_PASSWORD)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any // réponse JSON du prestataire, lue champ par champ avec contrôles

let cached: { token: string; expiresAt: number } | null = null

async function accessToken(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.expiresAt) return cached.token
  const res = await fetch(`${baseUrl()}/v1/oauth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: process.env.CINETPAY_API_KEY, api_password: process.env.CINETPAY_API_PASSWORD }),
    signal: AbortSignal.timeout(8000),
  })
  const data: Json = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) throw new Error(`connexion refusée (${data?.status || res.status})`)
  const ttl = Number(data.expires_in) || 300
  cached = { token: data.access_token, expiresAt: Date.now() + Math.max(ttl - 60, 30) * 1000 }
  return cached.token
}

/** Appel authentifié ; jeton expiré ou invalide : on en redemande un et on réessaie une fois. */
async function authed(path: string, init: RequestInit = {}): Promise<{ res: Response; data: Json }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(attempt > 0)
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const data: Json = await res.json().catch(() => null)
    const expired = res.status === 401 || data?.code === 1002 || data?.code === 1003
    if (!expired || attempt === 1) return { res, data }
  }
  throw new Error('inatteignable')
}

export const cinetpay: Gateway = {
  async init(i) {
    const { res, data } = await authed('/v1/payment', {
      method: 'POST',
      body: JSON.stringify({
        currency: 'XOF', merchant_transaction_id: i.id, amount: i.amount, lang: 'fr', designation: i.designation,
        client_email: i.email, client_first_name: i.firstName, client_last_name: i.lastName,
        success_url: i.successUrl, failed_url: i.failedUrl, notify_url: i.notifyUrl,
      }),
    })
    if (!res.ok || data?.code !== 200 || !data?.payment_url) throw new Error(`init refusé (${data?.status || res.status})`)
    return { paymentUrl: String(data.payment_url), notifyToken: String(data.notify_token || '') }
  },
  async status(id) {
    const { res, data } = await authed(`/v1/payment/${encodeURIComponent(id)}`)
    if (!res.ok || typeof data?.status !== 'string') return null
    return { status: data.status, amount: typeof data.amount === 'number' ? data.amount : undefined }
  },
}
