# mondocpro

Texte collé → document Word (et PDF) prêt à rendre : page de garde, sommaire automatique, pagination, tableaux, pages paysage.

- `src/` : site (Vite + React + TypeScript). Le Word est fabriqué dans le navigateur (`docx`).
- `api/claim.ts` : fonction Vercel. Vérifie le 1er document gratuit et gère l'accès à vie. `npm test` vérifie cette logique.
- `server/` : conversion Word → PDF (LibreOffice). `docker build -t mondocpro-pdf server`, puis l'héberger et mettre son adresse dans `VITE_PDF_URL`. Variables du serveur : `ALLOW_ORIGIN` (adresse(s) du site, obligatoire si le domaine change), `TRUST_PROXY=1` derrière un proxy, `RATE_PER_MIN`, `TIMEOUT_S`, `QUEUE_MAX`.

## Paiement : comment l'accès à vie est activé

Un ID de transaction collé par le client **n'active jamais l'accès tout seul** (n'importe qui pouvait en inventer un). Deux parcours :

1. **Automatique avec CinetPay (recommandé, aucune validation à la main).** Le client clique sur « Payer 1 000 F » : le serveur crée la commande (`payments/<id>`, montant décidé côté serveur), le client paie sur la page CinetPay, puis le serveur redemande le **statut réel** à CinetPay (webhook `/api/pay-notify` + vérification au retour sur le site) et n'active `users/<uid>.paid` que sur `SUCCESS`. Fonctionne aussi si le webhook tarde. Pour l'activer, dans Vercel > Settings > Environment Variables :
   - `CINETPAY_BASE_URL`, `CINETPAY_API_KEY`, `CINETPAY_API_PASSWORD` (mêmes valeurs que Moncvproci si c'est le même compte marchand, serveur uniquement) ;
   - `SITE_URL` = adresse complète du site en `https://…` (utilisée pour le retour et le webhook) ;
   - `PRICE_FCFA` (facultatif, 1000 par défaut ; mets le montant frais compris si tu veux les répercuter, et change le texte du site en conséquence) ;
   - puis en dernier `VITE_CINETPAY_ENABLED=1`, et redéploie.
2. **Validation manuelle (tant que `VITE_CINETPAY_ENABLED` n'est pas à 1).** Le client colle son ID `T_…` : la demande passe « en attente » (`txids/<ID>` avec `status: pending`). Tu vérifies le paiement dans Wave Business, puis tu mets `paid: true` dans `users/<uid>` (console Firebase > Firestore). C'est le mode de secours, à ne garder que le temps de configurer CinetPay.

Limites connues : le Word est fabriqué dans le navigateur, donc le blocage « premier document gratuit » reste contournable par un utilisateur technique (le serveur plafonne les retéléchargements à 8 par compte). Seule une génération du fichier côté serveur le rendrait étanche.
- `firestore.rules` : règles à publier dans la console Firebase.

## Mise en route

1. Firebase : créer un projet dédié, activer Authentication (Google + « Lien envoyé par e-mail »), créer Firestore, publier `firestore.rules`, ajouter le domaine du site dans Authentication > Paramètres > Domaines autorisés.
2. Vercel : importer ce dépôt, renseigner les variables de `.env.example`.
3. La config Firebase publique est dans `.env` (projet `mondoc-pro`). Si on la retire, le site fonctionne sans compte ni limite (utile en local seulement).

Local : `npm install`, `npm run dev`, et `python3 server/convert.py` pour tester le PDF.
