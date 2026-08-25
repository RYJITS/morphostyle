# Ajout - Systeme multi-utilisateur Hostinger

Date: 2026-08-25

Statut: **cadre a implementer**

Mise a jour 2026-08-25: une phase 1 JSON est active pour tester le contrat invite/historique sans attendre MySQL. Le fichier `server/data/user-memory.json` est prive et ignore par Git. MySQL reste la cible durable.

## Objectif

Transformer MorphoStyle Studio en PWA utilisable avec:

- mode invite;
- comptes utilisateurs optionnels;
- credits;
- essai gratuit quotidien;
- historique personnel;
- vitrine publique;
- telechargement durable des resultats.

## Principe d'architecture

```text
PWA React
  -> API Node.js Hostinger
    -> MySQL Hostinger
    -> Stockage images serveur
    -> Service image cote serveur
```

La PWA garde l'ergonomie mobile. Le serveur devient la source de verite pour les quotas, credits, comptes et historiques.

## Tables minimales proposees

### `users`

Compte permanent.

- `id`
- `email`
- `display_name`
- `created_at`
- `last_login_at`
- `status`

### `guest_sessions`

Mode invite.

- `id`
- `guest_token_hash`
- `created_at`
- `last_seen_at`
- `converted_user_id`

### `credit_wallets`

Solde courant.

- `id`
- `owner_type`: `guest` ou `user`
- `owner_id`
- `balance`
- `updated_at`

### `credit_ledger`

Journal immuable des mouvements.

- `id`
- `wallet_id`
- `amount`
- `reason`
- `generation_id`
- `payment_ref`
- `created_at`

### `generations`

Fiche principale.

- `id`
- `owner_type`
- `owner_id`
- `source_image_id`
- `status`: `draft`, `recommendations_ready`, `final_ready`, `failed`, `published`
- `consultation_json`
- `selected_proposal_key`
- `created_at`
- `updated_at`

### `generation_images`

Images liees a une generation.

- `id`
- `generation_id`
- `kind`: `source`, `recommendation_primary`, `recommendation_soft`, `recommendation_structured`, `recommendation_signature`, `final_front`, `final_left`, `final_right`, `final_back`
- `storage_path`
- `public_url`
- `width`
- `height`
- `created_at`

### `public_generations`

Vitrine publique.

- `id`
- `generation_id`
- `published_by_user_id`
- `title`
- `slug`
- `published_at`
- `status`

## Routes API a prevoir

| Route | Role |
| --- | --- |
| `POST /api/session/guest` | Creer ou retrouver un invite |
| `POST /api/auth/request-code` | Envoyer un code de connexion email |
| `POST /api/auth/verify-code` | Connecter ou creer un utilisateur |
| `GET /api/me` | Lire session, credits et limites |
| `GET /api/me/generations` | Historique personnel |
| `POST /api/generations/recommendations` | Generer la planche 4 propositions |
| `POST /api/generations/:id/final` | Generer le resultat final selectionne |
| `POST /api/generations/:id/publish` | Publier dans la vitrine |
| `GET /api/public-generations` | Lire la vitrine publique |
| `GET /api/generations/:id/download/:kind` | Telecharger une image autorisee |

## Politique credits

- Un invite recoit `1` essai gratuit par jour.
- Un essai complet reserve le credit avant generation.
- Si la generation recommandations echoue sans image exploitable, le credit est restaure.
- Si la finale echoue apres recommandations, la fiche reste consultable et peut proposer une relance.
- Les codes bonus ajoutent des credits via le serveur.

## Politique images

- Stocker les images dans un dossier non public direct si possible, puis servir par route controlee.
- Si Hostinger impose un dossier public, utiliser des noms opaques et une table d'autorisation.
- Ne jamais exposer la photo d'origine en vitrine publique sans choix explicite.
- Prevoir une future purge: suppression apres delai pour invites, conservation pour comptes.

## Etapes d'implementation

1. Remplacer le stockage JSON phase 1 par le schema MySQL et un module serveur `server/db`.
2. Garder le contrat actuel de session invite: `/api/session/guest`.
3. Migrer quota journalier vers table serveur.
4. Enregistrer les generations existantes dans `generations` et `generation_images`.
5. Garder le contrat actuel d'historique: `/api/me/generations`.
6. Brancher la publication publique sur `public_generations`.
7. Ajouter compte email sans mot de passe.
8. Ajouter credits, codes bonus et journal.
9. Ajouter PWA manifest + service worker minimal.

## Phase 1 deja posee

- `server/user-memory.mjs`: stockage invite/historique JSON remplacable par MySQL.
- `POST /api/session/guest`: cree ou retrouve l'invite anonyme.
- `GET /api/me`: lit invite, quota et generations.
- `GET /api/me/generations`: lit l'historique personnel du jour.
- Generation recommandations OpenAI: cree une fiche `recommendations_ready`.
- Generation finale OpenAI: met la fiche en `final_ready`.
- Frontend: fusionne historique local et historique serveur au chargement.

## Tests attendus

- Un invite peut faire un essai du jour et le retrouver apres retour navigation.
- Un deuxieme essai le meme jour est bloque proprement.
- Une fiche historique contient photo d'origine, propositions, finale et vues.
- Une fiche privee n'apparait pas dans la vitrine.
- Une fiche publiee apparait dans la vitrine et reste telechargeable.
- Un compte email retrouve ses credits et historiques sur un autre navigateur.

## Blocages avant implementation

- Confirmer le type exact de base Hostinger disponible pour ce domaine.
- Choisir la methode email: code manuel au debut, SMTP Hostinger, ou service transactionnel.
- Confirmer la duree de conservation des photos invitees.
- Confirmer si les credits sont gratuits/codes au debut ou lies a paiement des maintenant.
