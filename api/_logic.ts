type Snap = { exists: boolean; data(): Record<string, unknown> | undefined }
type Tx = { get(ref: unknown): Promise<Snap>; set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): unknown }
export interface Db {
  doc(path: string): unknown
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
}
export interface Result { status: number; body: Record<string, unknown> }
export interface Body { action?: string; docId?: unknown; txid?: unknown }

/** Preuve de paiement renvoyée par le prestataire (Wave Business, CinetPay…) pour un ID de transaction. */
export interface Payment { amount: number; currency?: string }
export interface Options {
  /**
   * Vérifie un ID de transaction auprès du prestataire de paiement. Renvoie null si aucun paiement réussi n'existe.
   * Sans fonction `verify`, rien n'est activé automatiquement : la demande est mise « en attente » (202)
   * et le propriétaire valide à la main après avoir vu le paiement dans son compte Wave.
   */
  verify?: (txid: string) => Promise<Payment | null>
  price?: number // prix minimum en F CFA (1 000)
  maxTries?: number // tentatives d'activation par compte
  maxFree?: number // téléchargements du 1er document gratuit (Word + PDF + retouches)
}

// Même format que MON CV PRO CI : T_ suivi de 16 caractères
const TXID = /^T_[A-Z0-9]{16}$/
const ok = (extra: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...extra } })
const fail = (status: number, error: string): Result => ({ status, body: { error } })

export async function handle(db: Db, uid: string, email: string | undefined, b: Body, o: Options = {}): Promise<Result> {
  const { price = 1000, maxTries = 10, maxFree = 8 } = o
  const userRef = db.doc(`users/${uid}`)

  if (b.action === 'download') {
    const docId = typeof b.docId === 'string' ? b.docId.slice(0, 64) : ''
    if (!docId) return fail(400, 'bad_request')
    return db.runTransaction(async tx => {
      const u = (await tx.get(userRef)).data() ?? {}
      if (u.paid) return ok({ paid: true })
      if (!u.freeDocId) {
        tx.set(userRef, { freeDocId: docId, freeUses: 1, email: email ?? null }, { merge: true })
        return ok({ free: true })
      }
      if (u.freeDocId === docId) {
        // l'identifiant du document vient du navigateur : on plafonne les retéléchargements
        const n = (typeof u.freeUses === 'number' ? u.freeUses : 0) + 1
        if (n > maxFree) return fail(402, 'free_used')
        tx.set(userRef, { freeUses: n }, { merge: true })
        return ok({ free: true })
      }
      return fail(402, 'free_used')
    })
  }

  if (b.action === 'activate') {
    const txid = typeof b.txid === 'string' ? b.txid.trim().toUpperCase() : ''
    if (!TXID.test(txid)) return fail(400, 'invalid_txid')

    // 1) déjà payé ? sinon on compte la tentative (anti-devinette : plafond par compte)
    const gate = await db.runTransaction<Result | null>(async tx => {
      const u = (await tx.get(userRef)).data() ?? {}
      if (u.paid) return ok({ paid: true })
      const tries = typeof u.activateTries === 'number' ? u.activateTries : 0
      if (tries >= maxTries) return fail(429, 'too_many_attempts')
      tx.set(userRef, { activateTries: tries + 1 }, { merge: true })
      return null
    })
    if (gate) return gate

    const txRef = db.doc(`txids/${txid}`)

    // 2a) vérification automatique auprès du prestataire
    if (o.verify) {
      let p: Payment | null
      try { p = await o.verify(txid) } catch { return fail(502, 'verify_unavailable') }
      if (!p) return fail(402, 'payment_not_found')
      if (!(p.amount >= price) || (p.currency && p.currency !== 'XOF')) return fail(402, 'amount_too_low')
      const amount = p.amount
      return db.runTransaction(async tx => {
        const used = await tx.get(txRef)
        const u = (await tx.get(userRef)).data() ?? {}
        if (u.paid) return ok({ paid: true })
        if (used.exists) return fail(409, 'txid_used')
        const at = Date.now()
        tx.set(txRef, { uid, email: email ?? null, at, status: 'verified', amount })
        tx.set(userRef, { paid: true, paidAt: at, txid, email: email ?? null }, { merge: true })
        return ok({ paid: true })
      })
    }

    // 2b) sans vérificateur : jamais d'activation automatique. La demande attend la validation du propriétaire.
    return db.runTransaction(async tx => {
      const used = await tx.get(txRef)
      const u = (await tx.get(userRef)).data() ?? {}
      if (u.paid) return ok({ paid: true })
      const prev = used.data()
      if (used.exists && prev?.uid !== uid) return fail(409, 'txid_used')
      if (!used.exists) {
        const at = Date.now()
        tx.set(txRef, { uid, email: email ?? null, at, status: 'pending' })
        tx.set(userRef, { pendingTxid: txid, pendingAt: at, email: email ?? null }, { merge: true })
      }
      return { status: 202, body: { ok: true, pending: true } }
    })
  }

  return fail(400, 'bad_request')
}
