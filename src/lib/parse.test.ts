import assert from 'node:assert/strict'
import { parse, stripToc } from './parse'

type Any = { t: string; text?: string; rows?: string[][]; caption?: string }
const tables = (src: string) => (parse(src) as Any[]).filter(b => b.t === 'table').map(b => b.rows!)
const kinds = (src: string) => parse(src).map(b => b.t)

// dernière colonne = petit nombre : aucune ligne ne doit disparaître (ancien bug du filtre de sommaire)
assert.deepEqual(tables('Service\tAgents\tRang\nTransport\t12\t3\nStockage\t8\t12\nDouane\t5\t7')[0],
  [['Service', 'Agents', 'Rang'], ['Transport', '12', '3'], ['Stockage', '8', '12'], ['Douane', '5', '7']])
// une ligne de tirets en tabulations est une vraie ligne de données, pas un séparateur Markdown
assert.equal(tables('Poste\tN\tN-1\nTransport\t10\t8\nAutres\t-\t-\nTotal\t10\t8')[0].length, 4)
assert.equal(tables('Poste\tN\n-\t-\nA\t1')[0].length, 3)
// lignes d'un même tableau séparées par des lignes vides
assert.equal(tables('Poste\tMontant\n\nTransport\t1000\n\nStockage\t900')[0].length, 3)
// Markdown avec et sans barres externes
assert.deepEqual(tables('Poste | Montant\n--- | ---\nTransport | 1000')[0], [['Poste', 'Montant'], ['Transport', '1000']])
assert.deepEqual(tables('| Poste | Montant |\n|---|---|\n| Transport | 1000 |')[0], [['Poste', 'Montant'], ['Transport', '1000']])
// listes copiées de Word : pas de faux tableau
assert.equal(tables('Étapes :\n\n1.\tPréparer\n2.\tDéposer').length, 0)
assert.deepEqual((parse('1.\tPréparer\n2.\tDéposer') as Any[]).map(b => b.text), ['1. Préparer', '2. Déposer'])
assert.deepEqual(kinds('•\tun\n•\tdeux'), ['li', 'li'])
// paragraphes en retrait par tabulation : pas de tableau
assert.equal(tables('\tLa logistique regroupe.\n\tElle repose sur trois flux.').length, 0)
// un vrai sommaire collé est toujours retiré
assert.deepEqual(
  stripToc(['SOMMAIRE', 'Introduction ........ 3', 'CHAPITRE 1 : Cadre\t5', '1.1 Définitions\t7', 'Tableau 1 : Coûts\t9', 'INTRODUCTION', 'Texte.']),
  ['INTRODUCTION', 'Texte.'])
// légende avant le tableau
const t = (parse('Tableau : Coûts\nPoste\tMontant\nTransport\t1 200\nStockage\t900') as Any[]).find(b => b.t === 'table')!
assert.equal(t.caption, 'Coûts')
assert.equal(t.rows!.length, 3)
// deux tableaux séparés par du texte restent deux tableaux
assert.equal(tables('A\tB\n1\t2\n\nTexte entre les deux.\n\nC\tD\n3\t4').length, 2)
console.log('parseur : OK')
