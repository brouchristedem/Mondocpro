import assert from 'node:assert/strict'
import { extractCover } from './cover'

// « Présenté par : Awa » : le deux-points ne doit JAMAIS se retrouver dans le nom (ancien bug : « : Awa »)
const a = extractCover('Thème : Optimisation logistique\nPrésenté par : Awa Koné\nSous la direction de : Dr Yao\n2025-2026\n\nINTRODUCTION\n\nTexte.')
assert.equal(a.cover.author, 'Awa Koné')
assert.equal(a.cover.supervisor, 'Dr Yao')
assert.equal(a.cover.title, 'Optimisation logistique')
assert.equal(a.cover.year, '2025-2026')
assert.ok(a.body.startsWith('INTRODUCTION'))
// sans deux-points
const b = extractCover('Thème : Étude\nRéalisé par Awa Koné\nSous la direction de Dr Yao\n\nINTRODUCTION\n\nTexte.')
assert.equal(b.cover.author, 'Awa Koné')
assert.equal(b.cover.supervisor, 'Dr Yao')
console.log('page de garde (détection) : OK')
