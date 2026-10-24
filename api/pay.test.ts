import assert from 'node:assert/strict'
import type { Db } from './_logic.js'
import { handleNotify, isPayId, settlePayment, splitName, startPayment, type Gateway, type InitInput } from './_pay.js'

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

// Faux prestataire : on décide du statut « réel » de chaque commande
function gateway() {
  const remote = new Map<string, { status: string; amount?: number }>()
  const inits: InitInput[] = []
  let down = false
  const gw: Gateway = {
    async init(i) { if (down) throw new Error('hors service'); inits.push(i); return { paymentUrl: `https://pay.exemple/${i.id}`, notifyToken: `nt_${i.id}` } },
    async status(id) { if (down) throw new Error('hors service'); return remote.get(id) ?? null },
  }
  return { gw, remote, inits, setDown(v: boolean) { down = v } }
}

const mk = () => { let n = 0; return () => `mp${(++n).toString(16).padStart(24, '0')}` }
const P = (uid: string, newId = mk()) => ({ uid, email: `${uid}@x.ci`, name: 'Awa Koné', price: 1000, siteUrl: 'https://site.ci', newId })

// --- démarrage : le montant est celui du serveur, la commande est enregistrée avant le paiement
{
  const db = fake(), g = gateway()
  const r = await startPayment(db, g.gw, P('u1'))
  assert.equal(r.status, 200)
  const id = String(r.body.id)
  assert.ok(isPayId(id) && String(r.body.paymentUrl).includes(id))
  assert.equal(db.store.get(`payments/${id}`)?.amount, 1000)
  assert.equal(db.store.get(`payments/${id}`)?.status, 'INITIATED')
  assert.equal(g.inits[0].successUrl, `https://site.ci/?pay=${id}`)
  assert.equal(g.inits[0].notifyUrl, 'https://site.ci/api/pay-notify')
  assert.equal(db.store.get('users/u1')?.paid, undefined, 'démarrer un paiement n’active rien')

  // --- le webhook ne suffit pas : mauvais jeton refusé, bon jeton mais paiement non réussi = rien
  assert.equal((await handleNotify(db, g.gw, { merchant_transaction_id: id, notify_token: 'faux' })).status, 403)
  assert.equal((await handleNotify(db, g.gw, { merchant_transaction_id: id, notify_token: `nt_${id}` })).status, 200)
  assert.equal(db.store.get('users/u1')?.paid, undefined, 'bon jeton mais paiement non confirmé : pas d’accès')
  g.remote.set(id, { status: 'PENDING' })
  await handleNotify(db, g.gw, { merchant_transaction_id: id, notify_token: `nt_${id}` })
  assert.equal(db.store.get('users/u1')?.paid, undefined)

  // --- le prestataire confirme : accès activé, une seule fois
  g.remote.set(id, { status: 'SUCCESS', amount: 1000 })
  assert.equal((await handleNotify(db, g.gw, { merchant_transaction_id: id, notify_token: `nt_${id}` })).status, 200)
  assert.equal(db.store.get('users/u1')?.paid, true)
  const at = db.store.get('users/u1')?.paidAt
  assert.deepEqual(await settlePayment(db, g.gw, id, 'u1'), { status: 'SUCCESS', paid: true })
  assert.equal(db.store.get('users/u1')?.paidAt, at, 'un 2e signal ne ré-active pas')

  // --- un autre compte ne peut pas consulter cette commande
  assert.equal(await settlePayment(db, g.gw, id, 'u2'), null)
  // --- déjà payé : plus de nouvelle commande
  assert.equal((await startPayment(db, g.gw, P('u1'))).body.paid, true)
}

// --- montant insuffisant côté prestataire
{
  const db = fake(), g = gateway()
  const id = String((await startPayment(db, g.gw, P('u1'))).body.id)
  g.remote.set(id, { status: 'SUCCESS', amount: 100 })
  assert.deepEqual(await settlePayment(db, g.gw, id), { status: 'AMOUNT_MISMATCH', paid: false })
  assert.equal(db.store.get('users/u1')?.paid, undefined)
}

// --- échec, expiration, prestataire en panne, commande inconnue, requêtes mal formées
{
  const db = fake(), g = gateway()
  const id = String((await startPayment(db, g.gw, P('u1'))).body.id)
  g.remote.set(id, { status: 'FAILED' })
  assert.deepEqual(await settlePayment(db, g.gw, id), { status: 'FAILED', paid: false })
  assert.equal(db.store.get(`payments/${id}`)?.status, 'FAILED')
  g.setDown(true)
  assert.equal((await settlePayment(db, g.gw, id))?.paid, false)
  const down = await startPayment(db, g.gw, P('u2'))
  assert.equal(down.status, 502)
  assert.equal(db.store.get('users/u2')?.paid, undefined)
  assert.equal(await settlePayment(db, g.gw, 'mp' + 'f'.repeat(24)), null)
  assert.equal((await handleNotify(db, g.gw, { merchant_transaction_id: 'mp' + 'f'.repeat(24), notify_token: 'x' })).status, 200) // inconnue : ignorée
  for (const bad of [null, {}, { merchant_transaction_id: id }, { merchant_transaction_id: 42, notify_token: 'x' }, { merchant_transaction_id: 'x'.repeat(40), notify_token: 'x' }])
    assert.equal((await handleNotify(db, g.gw, bad)).status, 400, JSON.stringify(bad))
}

// --- plafond de démarrages, site mal configuré, compte sans e-mail
{
  const db = fake(), g = gateway(), id = mk()
  let last = 0
  for (let i = 0; i < 22; i++) last = (await startPayment(db, g.gw, P('u3', id))).status
  assert.equal(last, 429)
  assert.equal((await startPayment(db, g.gw, { ...P('u4'), siteUrl: 'http://site.ci' })).status, 503)
  assert.equal((await startPayment(db, g.gw, { ...P('u4'), email: undefined })).status, 400)
}

assert.deepEqual(splitName('Awa Koné', 'a@x.ci'), { first: 'Awa', last: 'Koné' })
assert.deepEqual(splitName(undefined, 'k@x.ci'), { first: 'Client', last: 'MonDocPro' })
console.log('paiement automatique : OK')
