# mondocpro

Texte collé → document Word (et PDF) prêt à rendre : page de garde, sommaire automatique, pagination, tableaux, pages paysage.

- `src/` : site (Vite + React + TypeScript). Le Word est fabriqué dans le navigateur (`docx`).
- `api/claim.ts` : fonction Vercel. Vérifie le 1er document gratuit et active l'accès à vie (ID Wave unique). `npm test` vérifie cette logique.
- `server/` : conversion Word → PDF (LibreOffice). `docker build -t mondocpro-pdf server`, puis l'héberger et mettre son adresse dans `VITE_PDF_URL`.
- `firestore.rules` : règles à publier dans la console Firebase.

## Mise en route

1. Firebase : créer un projet dédié, activer Authentication (Google + « Lien envoyé par e-mail »), créer Firestore, publier `firestore.rules`, ajouter le domaine du site dans Authentication > Paramètres > Domaines autorisés.
2. Vercel : importer ce dépôt, renseigner les variables de `.env.example`.
3. Sans les variables `VITE_FIREBASE_*`, le site fonctionne sans compte ni limite (utile en local seulement).

Local : `npm install`, `npm run dev`, et `python3 server/convert.py` pour tester le PDF.
