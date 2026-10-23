# mondocpro

Texte collé → document Word (et PDF) prêt à rendre : page de garde, sommaire automatique, pagination, tableaux, pages paysage.

- `src/` : site (Vite + React + TypeScript). Le Word est fabriqué dans le navigateur (`docx`).
- `api/claim.ts` : fonction Vercel. Vérifie le 1er document gratuit et gère l'accès à vie. `npm test` vérifie cette logique.
- `server/` : conversion Word → PDF (LibreOffice). `docker build -t mondocpro-pdf server`, puis l'héberger et mettre son adresse dans `VITE_PDF_URL`. Variables du serveur : `ALLOW_ORIGIN` (adresse(s) du site, obligatoire si le domaine change), `TRUST_PROXY=1` derrière un proxy, `RATE_PER_MIN`, `TIMEOUT_S`, `QUEUE_MAX`.

## Paiement : comment l'accès à vie est activé

Un ID de transaction collé par le client **n'active jamais l'accès tout seul** (n'importe qui pouvait en inventer un). Deux modes :

1. **Validation manuelle (mode actuel).** Le client colle son ID `T_…` : la demande passe « en attente » (`txids/<ID>` avec `status: pending`, et `users/<uid>.pendingTxid`). Tu ouvres ton compte Wave Business, tu vérifies que l'ID existe et que le montant est de 1 000 F, puis dans la console Firebase > Firestore tu mets `paid: true` dans `users/<uid>` (et `status: "verified"` dans `txids/<ID>`). Le site détecte le changement en direct : la fenêtre se ferme et le téléchargement reprend.
2. **Automatique.** Brancher une vérification auprès du prestataire : passer une fonction `verify(txid)` à `handle()` dans `api/claim.ts` (elle renvoie `{ amount, currency }` du paiement réussi, ou `null`). Le code vérifie alors le montant (≥ 1 000 F, en XOF), refuse un ID déjà utilisé et n'active que sur preuve. Le plus simple est de réutiliser l'intégration CinetPay de Moncvproci (webhook vérifié côté serveur).

Limites connues : le Word est fabriqué dans le navigateur, donc le blocage « premier document gratuit » reste contournable par un utilisateur technique (le serveur plafonne les retéléchargements à 8 par compte). Seule une génération du fichier côté serveur le rendrait étanche.
- `firestore.rules` : règles à publier dans la console Firebase.

## Mise en route

1. Firebase : créer un projet dédié, activer Authentication (Google + « Lien envoyé par e-mail »), créer Firestore, publier `firestore.rules`, ajouter le domaine du site dans Authentication > Paramètres > Domaines autorisés.
2. Vercel : importer ce dépôt, renseigner les variables de `.env.example`.
3. La config Firebase publique est dans `.env` (projet `mondoc-pro`). Si on la retire, le site fonctionne sans compte ni limite (utile en local seulement).

Local : `npm install`, `npm run dev`, et `python3 server/convert.py` pour tester le PDF.
