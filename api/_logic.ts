type Snap = { exists: boolean; data(): Record<string, unknown> | undefined }
type Tx = { get(ref: unknown): Promise<Snap>; set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): unknown }
export interface Db {
  doc(path: string): unknown
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
}
export interface Result { status: number; body: Record<string, unknown> }
export interface Body { action?: string; docId?: unknown; txid?: unknown }

// Même format que MON CV PRO CI : T_ suivi de 16 caractères
const TXID = /^T_[A-Z0-9]{16}$/
const ok = (extra: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...extra } })

export async function handle(db: Db, uid: string, email: string | undefined, b: Body): Promise<Result> {
  const userRef = db.doc(`users/${uid}`)

  if (b.action === 'download') {
    const docId = typeof b.docId === 'string' ? b.docId.slice(0, 64) : ''
    if (!docId) return { status: 400, body: { error: 'bad_request' } }
    return db.runTransaction(async tx => {
      const u = (await tx.get(userRef)).data() ?? {}
      if (u.paid) return ok({ paid: true })
      if (!u.freeDocId) {
        tx.set(userRef, { freeDocId: docId, email: email ?? null }, { merge: true })
        return ok({ free: true })
      }
      if (u.freeDocId === docId) return ok({ free: true })
      return { status: 402, body: { error: 'free_used' } }
    })
  }

  if (b.action === 'activate') {
    const txid = typeof b.txid === 'string' ? b.txid.trim().toUpperCase() : ''
    if (!TXID.test(txid)) return { status: 400, body: { error: 'invalid_txid' } }
    const txRef = db.doc(`txids/${txid}`)
    return db.runTransaction(async tx => {
      const used = await tx.get(txRef)
      const u = (await tx.get(userRef)).data() ?? {}
      if (u.paid) return ok({ paid: true })
      if (used.exists) return { status: 409, body: { error: 'txid_used' } }
      const at = Date.now()
      tx.set(txRef, { uid, email: email ?? null, at })
      tx.set(userRef, { paid: true, paidAt: at, txid, email: email ?? null }, { merge: true })
      return ok({ paid: true })
    })
  }

  return { status: 400, body: { error: 'bad_request' } }
}
