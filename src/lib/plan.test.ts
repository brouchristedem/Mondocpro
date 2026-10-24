import assert from 'node:assert/strict'
import { columnWidths } from './plan'

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
