# mondocpro

Texte collé → document Word (et PDF) prêt à rendre : page de garde, sommaire automatique, pagination, tableaux, pages paysage.
**Gratuit pour le moment**, sans compte. Application installable (Chrome / Android, écran d'accueil iPhone) et utilisable hors connexion.

- `src/` : site (Vite + React + TypeScript). Le Word est fabriqué dans le navigateur (`docx`), le PDF aussi (voir plus bas).
- `src/lib/parse.ts` : reconnaissance des titres, listes et tableaux (tabulations, `|`, colonnes alignées par espaces, `;`, tableaux « aplatis »).
- `src/storage.ts` : « Mes documents », enregistrés dans le navigateur (enregistrement automatique + bouton Enregistrer).
- `public/manifest.webmanifest`, `public/sw.js` : application installable et mode hors connexion.

## Parcours

1. Coller le texte (document vierge au départ, aucun exemple).
2. Modèle en un geste (Complet / Standard / Simple) puis réglages si besoin.
3. **Télécharger** → choix **Word** ou **PDF**.

Le PDF est créé sans serveur : les pages de l'aperçu (celles du Word) sont envoyées à l'impression du navigateur (« Enregistrer au format PDF »). Si `VITE_PDF_URL` est renseigné, le Word est converti par le serveur `server/` (LibreOffice) à la place : `docker build -t mondocpro-pdf server`, l'héberger, puis mettre son adresse dans `VITE_PDF_URL` (`ALLOW_ORIGIN`, `TRUST_PROXY=1`, `RATE_PER_MIN`, `TIMEOUT_S`, `QUEUE_MAX` côté serveur). Dans ce cas le texte quitte l'appareil : adapter la FAQ du site.

## Paiement : en pause

Tout est gratuit pour le moment : le site n'appelle plus le paiement (la connexion, elle, est facultative et sert à la synchronisation). Le code est conservé pour la suite, sans être utilisé : `src/account.ts` et `src/Modal.tsx` (connexion Firebase, ID de transaction Wave), `api/claim.ts` (vérification du 1er document gratuit et de l'accès à vie, `npm test` vérifie sa logique) et `firestore.rules`. Voir `.env.example` pour les variables (`WAVE_TXID_MODE`, `FREE_EMAILS`…). Pour relancer un tarif : rebrancher `Modal` dans `src/App.tsx` au moment du téléchargement.

## Mise en route

1. Vercel : importer ce dépôt (aucune variable obligatoire).
2. Local : `npm install`, `npm run dev`. Tests : `npm test`.
3. Application : le service worker (`public/sw.js`) n'est actif qu'en production. Pour publier une nouvelle version du cache, changer `VERSION` dans `public/sw.js`.

## Connexion facultative et synchronisation

Sans compte, tout marche et les documents restent sur l'appareil. Connecté (Google ou lien par e-mail), chaque document est aussi gardé dans Firestore (`users/{uid}/docs/{id}`) et retrouvé sur tous les appareils : la modification la plus récente gagne (`src/sync.ts`, testé par `npm test`), une suppression est propagée aux autres appareils.

**À faire une fois dans la console Firebase** : Firestore > Règles > coller le contenu de `firestore.rules` > Publier (sans cela, la synchronisation affiche « synchronisation impossible » mais le site reste utilisable). Vérifier aussi, dans Authentication > Paramètres > Domaines autorisés, que le domaine du site est présent.
