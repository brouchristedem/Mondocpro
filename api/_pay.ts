import { createHash, timingSafeEqual } from 'node:crypto'
import type { Db, Result } from './_logic.js'

/**
 * Paiement automatique : le serveur crée la commande (montant décidé ici, jamais par le navigateur),
 * le client paie chez le prestataire, puis le serveur redemande le statut RÉEL au prestataire avant d'activer l'accès.
 * Ce qu'envoie le webhook n'est qu'un signal : on ne l'écoute jamais pour décider.
 */
export interface InitInput {
  id: string; amount: number; designation: string; email: string; firstName: string; lastName: string
  successUrl: string; failedUrl: string; notifyUrl: string
}
export interface Gateway {
  init(i: InitInput): Promise<{ paymentUrl: string; notifyToken: string }>
  status(id: string): Promise<{ status: string; amount?: number } | null>
}

const ID = /^mp[a-f0-9]{24}$/ // 26 caractères (CinetPay accepte 30 au plus)
export const isPayId = (s: unknown): s is string => typeof s === 'string' && ID.test(s)
const ok = (extra: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...extra } })
const fail = (status: number, error: string): Result => ({ status, body: { error } })

export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

export interface StartParams {
  uid: string; email: string | undefined; name?: string
  price: number; siteUrl: string; newId: () => string; maxStarts?: number
}

/** Prénom et nom : CinetPay veut 2 caractères au moins pour chacun. */
export function splitName(name: string | undefined, email: string): { first: string; last: string } {
  const base = (name || email.split('@')[0] || '').replace(/[^\p{L}\s'-]/gu, ' ').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  const first = parts[0] && parts[0].length >= 2 ? parts[0] : 'Client'
  const last = parts.slice(1).join(' ')
  return { first, last: last.length >= 2 ? last : 'MonDocPro' }
}

export async function startPayment(db: Db, gw: Gateway, p: StartParams): Promise<Result> {
  if (!p.email) return fail(400, 'no_email')
  if (!p.siteUrl.startsWith('https://')) return fail(503, 'payment_unavailable')
  const id = p.newId()
  const userRef = db.doc(`users/${p.uid}`)
  const ref = db.doc(`payments/${id}`)

  // commande enregistrée AVANT d'envoyer le client payer ; plafond de démarrages par compte
  const gate = await db.runTransaction<Result | null>(async tx => {
    const u = (await tx.get(userRef)).data() ?? {}
    if (u.paid) return ok({ paid: true })
    const n = typeof u.payStarts === 'number' ? u.payStarts : 0
    if (n >= (p.maxStarts ?? 20)) return fail(429, 'too_many_attempts')
    tx.set(userRef, { payStarts: n + 1, email: p.email }, { merge: true })
    tx.set(ref, { uid: p.uid, email: p.email, amount: p.price, status: 'CREATED', createdAt: Date.now() })
    return null
  })
  if (gate) return gate

  try {
    const { first, last } = splitName(p.name, p.email)
    const r = await gw.init({
      id, amount: p.price, designation: 'mondocpro - acces a vie', email: p.email, firstName: first, lastName: last,
      successUrl: `${p.siteUrl}/?pay=${id}`, failedUrl: `${p.siteUrl}/?payfail=1`, notifyUrl: `${p.siteUrl}/api/pay-notify`,
    })
    await db.runTransaction(async tx => { tx.set(ref, { status: 'INITIATED', notifyToken: r.notifyToken }, { merge: true }) })
    return ok({ paymentUrl: r.paymentUrl, id })
  } catch {
    await db.runTransaction(async tx => { tx.set(ref, { status: 'FAILED' }, { merge: true }) }).catch(() => {})
    return fail(502, 'payment_unavailable')
  }
}

/**
 * Interroge le prestataire et, si (et seulement si) le statut réel est SUCCESS, active le compte.
 * Peut être appelée plusieurs fois (webhook en double, retour du navigateur) : l'accès n'est donné qu'une fois.
 * `onlyUid` : pour l'appel du navigateur, une commande qui n'est pas la sienne est traitée comme introuvable.
 */
export async function settlePayment(db: Db, gw: Gateway, id: string, onlyUid?: string): Promise<{ status: string; paid: boolean } | null> {
  const ref = db.doc(`payments/${id}`)
  const rec = await db.runTransaction(async tx => (await tx.get(ref)).data())
  if (!rec) return null
  if (onlyUid && rec.uid !== onlyUid) return null
  if (rec.status === 'SUCCESS') return { status: 'SUCCESS', paid: true }

  let remote: Awaited<ReturnType<Gateway['status']>>
  try { remote = await gw.status(id) } catch { return { status: String(rec.status), paid: false } }
  if (!remote) return { status: String(rec.status), paid: false }

  if (remote.status === 'SUCCESS') {
    // si le prestataire indique un montant, il doit couvrir le prix de la commande
    if (typeof remote.amount === 'number' && remote.amount < Number(rec.amount)) return { status: 'AMOUNT_MISMATCH', paid: false }
    const uid = String(rec.uid)
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(ref)).data()
      if (!fresh || fresh.status === 'SUCCESS') return
      const at = Date.now()
      tx.set(ref, { status: 'SUCCESS', paidAt: at }, { merge: true })
      tx.set(db.doc(`users/${uid}`), { paid: true, paidAt: at, paymentId: id }, { merge: true })
    })
    return { status: 'SUCCESS', paid: true }
  }
  const st = remote.status
  if ((st === 'FAILED' || st === 'EXPIRED') && rec.status !== st) {
    await db.runTransaction(async tx => { tx.set(ref, { status: st }, { merge: true }) })
  }
  return { status: st, paid: false }
}

/** Webhook du prestataire : jeton de notification vérifié, puis statut réel redemandé. */
export async function handleNotify(db: Db, gw: Gateway, body: unknown): Promise<Result> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const id = b.merchant_transaction_id
  const token = typeof b.notify_token === 'string' ? b.notify_token : ''
  if (!isPayId(id) || !token) return fail(400, 'bad_request')
  const rec = await db.runTransaction(async tx => (await tx.get(db.doc(`payments/${id}`))).data())
  if (!rec) return ok({ ignored: true }) // commande inconnue : 200 pour éviter des relances inutiles
  if (!safeEqual(String(rec.notifyToken ?? ''), token)) return fail(403, 'forbidden')
  await settlePayment(db, gw, id)
  return ok()
}
