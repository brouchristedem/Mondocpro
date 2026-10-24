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
// filets Markdown : supprimés, jamais imprimés comme texte
assert.deepEqual((parse('Avant.\n\n---\n\nAprès.\n\n***\n\n- - -\n\nFin.') as Any[]).map(b => b.text), ['Avant.', 'Après.', 'Fin.'])
assert.equal(tables('Poste\tN\n-\t-\nA\t1').length, 1) // une ligne de tirets en tabulations reste une ligne de tableau
// liste numérotée sur des lignes qui se suivent : un paragraphe par ligne (avec ou sans point final), jamais un titre
assert.deepEqual((parse('On distingue :\n\n1. **A** : un.\n2. **B** : deux.\n3. **C** : trois.\n\nSuite.') as Any[]).map(b => b.text),
  ['On distingue :', '1. **A** : un.', '2. **B** : deux.', '3. **C** : trois.', 'Suite.'])
assert.deepEqual(kinds('Étapes :\n\n1. Collecte\n2. Calcul\n3. Classement\n\nSuite.'), ['p', 'p', 'p', 'p', 'p'])
// de vrais titres numérotés, séparés par du texte, restent des titres
assert.deepEqual(kinds('1. Introduction\n\nTexte.\n\n2. Analyse du besoin\n\nTexte.'), ['h', 'p', 'h', 'p'])
// énumération avec « ; » en fin de ligne : un paragraphe par élément
assert.deepEqual((parse('Le client souhaite :\n\n10 conteneurs de 20 pieds ;\n8 conteneurs de 40 pieds.\n\nSuite.') as Any[]).map(b => b.text),
  ['Le client souhaite :', '10 conteneurs de 20 pieds ;', '8 conteneurs de 40 pieds.', 'Suite.'])
// saut de ligne perdu entre l'en-tête et la 1re ligne : la 1re ligne n'est plus fondue dans l'en-tête
assert.deepEqual(tables("Type de conteneur\tTarif unitaireConteneur vide 20'\t45,5 €\nConteneur vide 40'\t91 €")[0],
  [['Type de conteneur', 'Tarif unitaire'], ["Conteneur vide 20'", '45,5 €'], ["Conteneur vide 40'", '91 €']])
assert.deepEqual(tables("| **Désignation** | **Quantité** | **Tarif unitaire** | **MontantTransfert conteneur vide 20' sur parc externe** | **10** | **45,5 €** | **455 €** |\n| --- | --- | --- | --- | --- | --- | --- |\n| Transfert conteneur vide 40' | 8 | 91 € | 728 € |\n| TOTAL HT |  |  | 1 183 € |")[0],
  [['**Désignation**', '**Quantité**', '**Tarif unitaire**', '**Montant**'], ["Transfert conteneur vide 20' sur parc externe", '**10**', '**45,5 €**', '**455 €**'], ["Transfert conteneur vide 40'", '8', '91 €', '728 €'], ['TOTAL HT', '', '', '1 183 €']])
// un tableau normal n'est jamais touché
assert.equal(tables('Poste\tN\tN-1\nTransport\t10\t8\nTotal\t10\t8')[0].length, 3)
// tableau « aplati » (une cellule par ligne, copié depuis une application) sous sa légende : reconstitué
const flat = parse('Intro.\n\nTableau 1 : Effectif par service\n\nService\n\nEffectif\n\nPart du total\n\nProduction\n\n55\n\n46 %\n\nLogistique\n\n12\n\n10 %\n\nTotal\n\n67\n\n100 %\n\nPartie 2 : Analyse\n\nTexte.') as Any[]
assert.deepEqual(flat.map(b => b.t), ['p', 'table', 'h', 'p'])
assert.equal(flat[1].caption, 'Effectif par service')
assert.deepEqual(flat[1].rows!.slice(0, 2), [['Service', 'Effectif', 'Part du total'], ['Production', '55', '46 %']])
assert.equal(flat[1].rows!.length, 4)
// une légende suivie d'un vrai paragraphe, ou une simple liste de lignes courtes sans légende : jamais transformés en tableau
assert.equal(tables('Tableau 1 : Coûts\n\nCe tableau montre les coûts de transport par zone.\n\nSuite.').length, 0)
assert.equal(tables('Les gammes :\n\nJus de fruits\n\nConserves\n\nCéréales\n\nSuite du texte.').length, 0)
console.log('parseur : OK')
