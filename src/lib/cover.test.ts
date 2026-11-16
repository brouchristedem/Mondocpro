import assert from 'node:assert/strict'
import { extractCover, adoptCover } from './cover'
import { DEFAULTS } from './types'

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

// un nouveau texte SANS page de garde ne doit pas hériter des infos de l'ancien document (logo et gabarit gardés)
const old = { ...DEFAULTS, cover: { ...DEFAULTS.cover, enabled: true, title: 'Ancien titre', author: 'Ancien Auteur', supervisor: 'Dr Ancien', year: '2020-2021', extras: ['Module : Ancien'], logo: { url: 'data:image/png;base64,AA', w: 10, h: 10 }, template: 'colonne' } }
const f = adoptCover('Atelier 2\n\nPARTIE A\n\nTexte.', old, true)
assert.equal(f.s.cover.title, '')
assert.equal(f.s.cover.author, '')
assert.equal(f.s.cover.supervisor, '')
assert.deepEqual(f.s.cover.extras, [])
assert.equal(f.s.cover.template, 'colonne')
assert.ok(f.s.cover.logo)
// hors remplacement (ajout au texte, ouverture d'un document enregistré) : rien n'est effacé
assert.equal(adoptCover('Texte.', old).s.cover.author, 'Ancien Auteur')
// et si le nouveau texte a sa propre page de garde, elle s'applique
const g = adoptCover('Thème : Nouveau\nPrésenté par : Awa Koné\n\nINTRODUCTION\n\nTexte.', old, true)
assert.equal(g.s.cover.title, 'Nouveau')
assert.equal(g.s.cover.author, 'Awa Koné')
assert.equal(g.s.cover.supervisor, '')
console.log('page de garde (remplacement du texte) : OK')
