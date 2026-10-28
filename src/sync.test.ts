import assert from 'node:assert/strict'
import { planSync, type CloudDoc } from './sync'
import { DEFAULTS } from './lib/types'
import type { Doc } from './storage'

const L = (id: string, at: number): Doc => ({ id, name: id, text: id, s: DEFAULTS, preset: 'standard', updatedAt: at })
const C = (id: string, at: number, deleted = false): CloudDoc => ({ id, name: id, text: id, s: '{}', preset: 'standard', updatedAt: at, deleted })
const ids = (a: { id: string }[]) => a.map(x => x.id).sort()

// nouvel appareil : tout vient du compte
let p = planSync([], [C('a', 5), C('b', 6)], {})
assert.deepEqual(ids(p.pull), ['a', 'b']); assert.equal(p.push.length, 0)
// premier envoi : tout part vers le compte
p = planSync([L('a', 5)], [], {})
assert.deepEqual(ids(p.push), ['a']); assert.equal(p.pull.length, 0)
// le plus récent gagne, dans les deux sens
p = planSync([L('a', 5), L('b', 9)], [C('a', 8), C('b', 7)], {})
assert.deepEqual(ids(p.pull), ['a']); assert.deepEqual(ids(p.push), ['b'])
// égalité : rien à faire
p = planSync([L('a', 5)], [C('a', 5)], {})
assert.equal(p.pull.length + p.push.length + p.removeLocal.length, 0)
// supprimé ailleurs : retiré ici ; mais gardé si modifié ici après
p = planSync([L('a', 5), L('b', 20)], [C('a', 10, true), C('b', 10, true)], {})
assert.deepEqual(p.removeLocal, ['a']); assert.deepEqual(ids(p.push), ['b'])
// supprimé ici : signalé au compte, ne revient pas
p = planSync([], [C('a', 5)], { a: 9 })
assert.deepEqual(p.pushDeleted, [{ id: 'a', updatedAt: 9 }]); assert.equal(p.pull.length, 0)
// supprimé ici, mais modifié ailleurs ensuite : il revient
p = planSync([], [C('a', 12)], { a: 9 })
assert.deepEqual(ids(p.pull), ['a'])
// suppression locale d'un document que le compte ne connaît pas : on le signale quand même
p = planSync([], [], { z: 3 })
assert.deepEqual(p.pushDeleted, [{ id: 'z', updatedAt: 3 }])
console.log('sync : OK')
