import assert from 'node:assert/strict'
import { columnWidths, plan } from './plan'
import { DEFAULTS } from './types'

const W = 9072 // largeur utile A4 portrait, marges 2,5 cm
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

// la somme est exacte et aucune colonne n'est vide
for (const rows of [
  [['Poste', 'Montant', 'Part'], ['Transport', '1 200 000', '40 %']],
  [['A', 'B'], ['x', 'y']],
  [['Désignation', 'Quantité', 'Prix unitaire', 'Total', 'Observations', 'Fournisseur', 'Délai'], ['Ordinateur portable', '3', '450 000', '1 350 000', 'Livraison partielle acceptée avec réserves', 'Société Ivoirienne', '15 jours']],
]) {
  const w = columnWidths(rows, 10, W)
  assert.equal(sum(w), W)
  assert.ok(w.every(x => x > 400), JSON.stringify(w))
}

// un mot long garde la place nécessaire : « Responsabilités » ne doit pas être coupé quand c'est possible
const w = columnWidths([['N°', 'Responsabilités', 'Qté'], ['1', 'Gestion', '12']], 11, W)
assert.ok(w[1] >= 'Responsabilités'.length * 11 * 20 * 0.55, `colonne 2 trop étroite : ${w[1]}`)
// une colonne de petits nombres reste étroite
assert.ok(w[0] < w[1] && w[2] < w[1])

// trop de colonnes pour la page : on réduit proportionnellement, sans dépasser W
const many = Array.from({ length: 14 }, (_, i) => `Colonne${i}`)
const wm = columnWidths([many, many.map(() => '1')], 9, W)
assert.equal(sum(wm), W)
console.log('largeurs de colonnes : OK')

// un titre (et l'annonce) qui précède un grand tableau part avec lui sur la page paysage : jamais seul en bas de la page portrait
{
  const wide = { t: 'table' as const, rows: [['a', 'b', 'c', 'd', 'e', 'f'], ['1', '2', '3', '4', '5', '6']] }
  const P = plan([{ t: 'p', text: 'Du texte.' }, { t: 'h', level: 1, text: '8. PLANNING' }, { t: 'p', text: '**Titre**', keep: true, flush: true }, wide], DEFAULTS)
  assert.deepEqual(P.segs.map(g => `${g.landscape ? 'L' : 'P'}:${g.items.map(i => i.k).join(',')}`), ['P:p', 'L:h,p,table,gap', 'P:'].filter(x => x !== 'P:'))
}
console.log('plan : titre avec son grand tableau : OK')
