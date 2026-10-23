import assert from 'node:assert/strict'
import { handle, type Body, type Db, type Options } from './_logic.js'

// Faux Firestore en mémoire : mêmes règles que le vrai (toutes les lectures avant les écritures)
function fake(): Db & { store: Map<string, Record<string, unknown>> } {
  const store = new Map<string, Record<string, unknown>>()
  return {
    store,
    doc: p => p,
    async runTransaction(fn) {
      const writes: [string, Record<string, unknown>, boolean][] = []
      let wrote = false
      const tx = {
        async get(r: unknown) { assert(!wrote, 'lecture après écriture'); const d = store.get(r as string); return { exists: !!d, data: () => d } },
        set(r: unknown, d: Record<string, unknown>, o?: { merge: boolean }) { wrote = true; writes.push([r as string, d, !!o?.merge]) },
      }
      const out = await fn(tx)
      for (const [p, d, m] of writes) store.set(p, m ? { ...store.get(p), ...d } : d)
      return out
    },
  }
}

const T1 = 'T_ABCDEFGH12345678', T2 = 'T_ZZZZZZZZ99999999'

/* ---------- 1er document gratuit ---------- */
{
  const db = fake()
  const h = (b: Body, o?: Options) => handle(db, 'u1', 'a@x.ci', b, o)
  assert.equal((await h({ action: 'download', docId: 'd1' })).status, 200)
  assert.equal((await h({ action: 'download', docId: 'd1' })).status, 200) // Word puis PDF = même document
  assert.equal((await h({ action: 'download', docId: 'd2' })).status, 402) // 2e document refusé
  assert.equal((await h({ action: 'download' })).status, 400)
  assert.equal((await h({ action: 'nope' })).status, 400)
  // le même identifiant ne sert pas à télécharger sans fin des textes différents
  for (let i = 0; i < 6; i++) assert.equal((await h({ action: 'download', docId: 'd1' })).status, 200)
  assert.equal((await h({ action: 'download', docId: 'd1' })).status, 402)
}

/* ---------- activation SANS vérificateur : jamais d'accès automatique ---------- */
{
  const db = fake()
  const h = (uid: string, b: Body) => handle(db, uid, `${uid}@x.ci`, b)
  for (const bad of ['', 'abc', 'T_123', 'T_ABCDEFGH1234567!', 42, null]) assert.equal((await h('u1', { action: 'activate', txid: bad })).status, 400, String(bad))
  const r = await h('u1', { action: 'activate', txid: ` ${T1.toLowerCase()} ` })
  assert.equal(r.status, 202)
  assert.equal(db.store.get('users/u1')?.paid, undefined, 'un ID inventé ne doit jamais activer le compte')
  assert.equal(db.store.get(`txids/${T1}`)?.status, 'pending')
  assert.equal((await h('u1', { action: 'download', docId: 'd9' })).status, 200) // 1er doc gratuit seulement
  assert.equal((await h('u1', { action: 'download', docId: 'd10' })).status, 402)
  assert.equal((await h('u1', { action: 'activate', txid: T1 })).status, 202) // même compte, même ID : idempotent
  assert.equal((await h('u2', { action: 'activate', txid: T1 })).status, 409) // l'ID est déjà réservé par un autre compte
  // plafond de tentatives
  let last = 0
  for (let i = 0; i < 12; i++) last = (await h('u3', { action: 'activate', txid: `T_AAAAAAAA${String(10000000 + i)}` })).status
  assert.equal(last, 429)
}

/* ---------- activation AVEC vérificateur (API du prestataire) ---------- */
{
  const db = fake()
  const calls: string[] = []
  const verify: Options['verify'] = async txid => { calls.push(txid); return txid === T1 ? { amount: 1000, currency: 'XOF' } : txid === T2 ? { amount: 100, currency: 'XOF' } : null }
  const h = (uid: string, txid: string, o: Options = { verify }) => handle(db, uid, `${uid}@x.ci`, { action: 'activate', txid }, o)
  assert.equal((await h('u1', 'T_QQQQQQQQ00000000')).status, 402) // paiement introuvable
  assert.equal(db.store.get('users/u1')?.paid, undefined)
  assert.equal((await h('u1', T2)).status, 402) // montant trop faible
  assert.equal((await h('u1', T1)).status, 200)
  assert.equal(db.store.get('users/u1')?.paid, true)
  assert.equal((await h('u2', T1)).status, 409) // un paiement ne sert qu'une fois
  assert.equal(db.store.get('users/u2')?.paid, undefined)
  const before = calls.length
  assert.equal((await h('u1', 'T_ZZZZZZZZ00000001')).status, 200) // déjà payé : on ne rappelle pas le prestataire
  assert.equal(calls.length, before)
  // prestataire en panne : on n'active rien
  const down = fake()
  const r = await handle(down, 'u9', 'u9@x.ci', { action: 'activate', txid: T1 }, { verify: async () => { throw new Error('réseau') } })
  assert.equal(r.status, 502)
  assert.equal(down.store.get('users/u9')?.paid, undefined)
}
console.log('logique serveur : OK')
