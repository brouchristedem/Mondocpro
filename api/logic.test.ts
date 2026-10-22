import assert from 'node:assert/strict'
import { handle, type Db } from './_logic.js'

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
const db = fake()

// 1er document gratuit, redéchargeable (Word puis PDF = même document)
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'download', docId: 'd1' })).status, 200)
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'download', docId: 'd1' })).status, 200)
// 2e document refusé
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'download', docId: 'd2' })).status, 402)
// mauvaise requête
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'download' })).status, 400)
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'nope' })).status, 400)
// ID de transaction invalide
for (const bad of ['', 'abc', 'T_123', 'T_ABCDEFGH1234567!', 42, null]) assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'activate', txid: bad })).status, 400, String(bad))
// activation, insensible à la casse et aux espaces
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'activate', txid: ` ${T1.toLowerCase()} ` })).status, 200)
assert.equal((await handle(db, 'u1', 'a@x.ci', { action: 'download', docId: 'd2' })).status, 200)
assert.equal(db.store.get('users/u1')?.paid, true)
// le même ID ne sert pas à un 2e compte
assert.equal((await handle(db, 'u2', 'b@x.ci', { action: 'activate', txid: T1 })).status, 409)
assert.equal(db.store.get('users/u2')?.paid, undefined)
// un autre ID active l'autre compte ; ré-activer un compte déjà payé ne consomme pas un 2e ID
assert.equal((await handle(db, 'u2', 'b@x.ci', { action: 'activate', txid: T2 })).status, 200)
assert.equal((await handle(db, 'u2', 'b@x.ci', { action: 'activate', txid: 'T_QQQQQQQQ00000000' })).status, 200)
assert.equal(db.store.has('txids/T_QQQQQQQQ00000000'), false)
console.log('logique serveur : OK')
