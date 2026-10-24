# mondocpro

Texte collé → document Word (et PDF) prêt à rendre : page de garde, sommaire automatique, pagination, tableaux, pages paysage.

- `src/` : site (Vite + React + TypeScript). Le Word est fabriqué dans le navigateur (`docx`).
- `api/claim.ts` : fonction Vercel. Vérifie le 1er document gratuit et gère l'accès à vie. `npm test` vérifie cette logique.
- `server/` : conversion Word → PDF (LibreOffice). `docker build -t mondocpro-pdf server`, puis l'héberger et mettre son adresse dans `VITE_PDF_URL`. Variables du serveur : `ALLOW_ORIGIN` (adresse(s) du site, obligatoire si le domaine change), `TRUST_PROXY=1` derrière un proxy, `RATE_PER_MIN`, `TIMEOUT_S`, `QUEUE_MAX`.

## Paiement : comment l'accès à vie est activé

Parcours Wave comme MON CV PRO CI : le client paie par Wave, copie l'ID de transaction (`T_…`) et le colle sur le site. Réglages (variables Vercel, serveur uniquement, toutes facultatives) :

- **`WAVE_TXID_MODE`** — par défaut (variable absente), un ID au bon format **active l'accès tout de suite, sans preuve de paiement** : n'importe qui peut inventer un ID valide. Un ID ne sert qu'à un seul compte et chaque compte a 10 essais au plus, mais ce n'est pas une vérification. Mets `WAVE_TXID_MODE=manual` pour que l'ID soit seulement mis « en attente » (`txids/<ID>` avec `status: pending`) : tu vérifies alors le paiement dans Wave Business et tu mets `paid: true` dans `users/<uid>` (console Firebase > Firestore) ; le site détecte le changement et reprend le téléchargement.
- **`FREE_EMAILS`** — comptes qui téléchargent toujours gratuitement, sans limite, séparés par des virgules. Par défaut : `brouchristedem@gmail.com`. L'adresse vient du jeton Firebase (e-mail vérifié), pas du navigateur.
- Pour une vraie vérification automatique plus tard : passer une fonction `verify(txid)` à `handle()` dans `api/claim.ts` (elle renvoie `{ amount, currency }` du paiement réussi, ou `null`).

Limites connues : le Word est fabriqué dans le navigateur, donc le blocage « premier document gratuit » reste contournable par un utilisateur technique (le serveur plafonne les retéléchargements à 8 par compte). Seule une génération du fichier côté serveur le rendrait étanche.
- `firestore.rules` : règles à publier dans la console Firebase.

## Mise en route

1. Firebase : créer un projet dédié, activer Authentication (Google + « Lien envoyé par e-mail »), créer Firestore, publier `firestore.rules`, ajouter le domaine du site dans Authentication > Paramètres > Domaines autorisés.
2. Vercel : importer ce dépôt, renseigner les variables de `.env.example`.
3. La config Firebase publique est dans `.env` (projet `mondoc-pro`). Si on la retire, le site fonctionne sans compte ni limite (utile en local seulement).

Local : `npm install`, `npm run dev`, et `python3 server/convert.py` pour tester le PDF.
