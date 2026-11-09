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

// colonnes alignées par des espaces (copie d'un PDF) : reconnues comme un tableau si une colonne est chiffrée
assert.deepEqual(tables('Poste        Montant      Part\nTransport    1 200 000    40 %\nStockage       900 000    30 %\nDouane         900 000    30 %')[0],
  [['Poste', 'Montant', 'Part'], ['Transport', '1 200 000', '40 %'], ['Stockage', '900 000', '30 %'], ['Douane', '900 000', '30 %']])
// CSV à points-virgules
assert.deepEqual(tables('Nom;Ville;Âge\nAya;Abidjan;24\nIbrahim;Bouaké;31')[0], [['Nom', 'Ville', 'Âge'], ['Aya', 'Abidjan', '24'], ['Ibrahim', 'Bouaké', '31']])
// jamais un paragraphe : double espace après un point, énumération à points-virgules
assert.equal(tables('Première phrase.  Deuxième phrase.\nTroisième phrase.  Quatrième phrase.\nCinquième phrase.  Sixième phrase.').length, 0)
assert.equal(tables('Il faut :\n\n- les flux physiques ;\n- les flux d’information ;\n- les flux financiers.').length, 0)
assert.equal(tables('les routes ; les ports ;\nles rails ; les airs ;\nles mers ; les lacs ;').length, 0)
// deux lignes seulement : pas assez pour affirmer que c'est un tableau
assert.equal(tables('Poste        Montant\nTransport    1 200').length, 0)

// hiérarchie EXERCICE > A. > 1. (devoir type atelier) : niveaux 1, 2, 3 jamais aplatis
const hd = (src: string) => (parse(src) as (Any & { level?: number })[]).filter(b => b.t === 'h').map(b => `${b.level}:${b.text}`)
assert.deepEqual(hd('EXERCICE 1 : DÉFINITIONS\n\nA. Complétez\n\nTexte.\n\nB. QCM\n\nTexte.\n\nEXERCICE 2 : COMPARAISON\n\n1. Logistique militaire\n\nTexte.\n\n2. Logistique civile\n\nTexte.\n\nCONCLUSION\n\nFin.'),
  ['1:EXERCICE 1 : DÉFINITIONS', '2:A. Complétez', '2:B. QCM', '1:EXERCICE 2 : COMPARAISON', '2:1. Logistique militaire', '2:2. Logistique civile', '1:CONCLUSION'])
// questions suivies de « Réponse : » : énoncé en gras, jamais un titre ; étiquettes « Finalité : » en gras
assert.deepEqual(kinds('1. Quelle est la bonne réponse ?\nRéponse : b)\nJustification : parce que.\n\n2. Autre question ?\nRéponse : a)'), ['p', 'p', 'p', 'p', 'p'])
assert.deepEqual((parse('A. Titre\n\nFinalité : sauver des vies.\nContexte : urgence.') as Any[]).map(b => b.text).slice(1), ['**Finalité :** sauver des vies.', '**Contexte :** urgence.'])
// « 1.la » collé sans espace : paragraphe, pas de texte perdu
assert.deepEqual((parse('Services :\n1.la nourriture ;\n2.les soins.') as Any[]).map(b => b.text), ['Services :', '1. la nourriture ;', '2. les soins.'])
console.log('parseur hiérarchie : OK')

// ===== Reconnaissance universelle des titres : quelle que soit la façon de numéroter, tout titre est reconnu au bon niveau =====
const P = (l: string) => 'Texte du paragraphe assez long pour être clairement un paragraphe complet.' + l
const H = (src: string) => (parse(src) as (Any & { level?: number })[]).filter(b => b.t === 'h').map(b => `${b.level}:${b.text}`)
// « 1 » puis « 1.1 », sans point après le chiffre
assert.deepEqual(H(`1 Introduction\n\n${P('')}\n\n1.1 Contexte\n\n${P('')}\n\n1.2 Objectifs\n\n${P('')}\n\n2 Analyse\n\n${P('')}\n\n2.1 Méthode\n\n${P('')}\n\n2.1.1 Outils\n\n${P('')}`),
  ['1:1 Introduction', '2:1.1 Contexte', '2:1.2 Objectifs', '1:2 Analyse', '2:2.1 Méthode', '3:2.1.1 Outils'])
// avec points, avec tirets, avec parenthèses
assert.deepEqual(H(`1. Cadre\n\n${P('')}\n\n1.1. Définition\n\n${P('')}\n\n1.1.1. Détail\n\n${P('')}\n\n2. Méthode\n\n${P('')}`), ['1:1. Cadre', '2:1.1. Définition', '3:1.1.1. Détail', '1:2. Méthode'])
assert.deepEqual(H(`1 - Cadre\n\n${P('')}\n\n1.1 - Définition\n\n${P('')}\n\n2 - Méthode\n\n${P('')}`), ['1:1 - Cadre', '2:1.1 - Définition', '1:2 - Méthode'])
assert.deepEqual(H(`1) Cadre\n\n${P('')}\n\n2) Méthode\n\n${P('')}`), ['1:1) Cadre', '1:2) Méthode'])
// I. > A. > 1.
assert.deepEqual(H(`I. LE CADRE\n\n${P('')}\n\nA. Définitions\n\n${P('')}\n\n1. Logistique\n\n${P('')}\n\n2. Transport\n\n${P('')}\n\nB. Enjeux\n\n${P('')}\n\nII. LA MÉTHODE\n\n${P('')}\n\nA. Outils\n\n${P('')}`),
  ['1:I. LE CADRE', '2:A. Définitions', '3:1. Logistique', '3:2. Transport', '2:B. Enjeux', '1:II. LA MÉTHODE', '2:A. Outils'])
// PARTIE > Chapitre > 1.1
assert.deepEqual(H(`PARTIE I : CADRE\n\nChapitre 1 : Concepts\n\n1.1 Définitions\n\n${P('')}\n\nChapitre 2 : Modèles\n\n${P('')}\n\nPARTIE II : PRATIQUE\n\nChapitre 3 : Étude\n\n${P('')}`),
  ['1:PARTIE I : CADRE', '2:Chapitre 1 : Concepts', '3:1.1 Définitions', '2:Chapitre 2 : Modèles', '1:PARTIE II : PRATIQUE', '2:Chapitre 3 : Étude'])
// titres sans numéro, en gras, avec point final, sans lignes vides, Markdown mélangé
assert.deepEqual(H(`Introduction\n\n${P('')}\n\nLe contexte du projet\n\n${P('')}\n\nConclusion\n\n${P('')}`), ['1:Introduction', '1:Le contexte du projet', '1:Conclusion'])
assert.deepEqual(H(`**Introduction**\n\n${P('')}\n\n**1. Le cadre**\n\n${P('')}\n\n**1.1 Définition**\n\n${P('')}`), ['1:Introduction', '1:1. Le cadre', '2:1.1 Définition'])
assert.deepEqual(H(`1. Introduction.\n\n${P('')}\n\n2. Analyse du besoin.\n\n${P('')}`), ['1:1. Introduction.', '1:2. Analyse du besoin.'])
assert.deepEqual(H('1. Introduction\nTexte de l’introduction.\n1.1 Contexte\nTexte du contexte.\n2. Analyse\nTexte.'), ['1:1. Introduction', '2:1.1 Contexte', '1:2. Analyse'])
assert.deepEqual(H(`# Cadre\n\n${P('')}\n\n1.1 Définition\n\n${P('')}`), ['1:Cadre', '2:1.1 Définition'])
// jamais de faux titres : phrase commençant par un nombre, date, liste à puces, options a) b)
assert.deepEqual(H(`${P('')}\n\n10 conteneurs de 20 pieds ont été commandés pour la livraison.\n\n3 Mars 2024\n\n${P('')}`), [])
assert.deepEqual(H(`Les gammes :\n\nJus de fruits\n\nConserves\n\nCéréales\n\nSuite du texte.`), [])
assert.deepEqual(H(`${P('')}\n\na) première option\n\nb) seconde option\n\n${P('')}`), [])
assert.deepEqual(H(`Il a dit que C. Ader avait raison dans son livre sur la logistique militaire ancienne.\n\n${P('')}`), [])
// « I. » : lettre ou chiffre romain selon le contexte
assert.deepEqual(H(`H. Huit\n\n${P('')}\n\nI. Neuf\n\n${P('')}\n\nJ. Dix\n\n${P('')}`), ['1:H. Huit', '1:I. Neuf', '1:J. Dix'])
// aucun texte perdu : tous les mots du texte collé se retrouvent dans le résultat
const words2 = (t: string) => t.replace(/\*\*/g, '').split(/\s+/).filter(Boolean)
const mix = `1 Cadre\n\nTexte un deux trois.\n\n**Gras seul**\n\nRéponse : oui.\nFinalité : sauver.\n\n- puce\n\n1.la nourriture ;\n2.les soins.\n\nPoste\tN\nA\t1\nB\t2`
const outW = parse(mix).flatMap(b => b.t === 'table' ? b.rows.flat().flatMap(words2) : words2((b as { text: string }).text)).join(' ')
for (const w of words2(mix.replace(/\t/g, ' '))) assert.ok(outW.includes(w.replace(/[:]/g, '')) || /^[-1.2.]/.test(w), `mot perdu : ${w}`)
// questions numérotées finissant par un point, texte collé directement dessous
assert.deepEqual(H('QUESTIONS\n\n1. Pourquoi parle-t-on de dernière minute ?\nOn parle ainsi car les crises sont imprévisibles et rapides.\n\n2. Citez les étapes de la chaîne logistique communes à l’industrie.\nLes étapes sont : approvisionnement, stockage, transport.\n\n3. Quel est le point commun entre les deux ?\nLe point commun est la rapidité.'),
  ['1:QUESTIONS', '2:1. Pourquoi parle-t-on de dernière minute ?', '2:2. Citez les étapes de la chaîne logistique communes à l’industrie.', '2:3. Quel est le point commun entre les deux ?'])
console.log('reconnaissance universelle : OK')
