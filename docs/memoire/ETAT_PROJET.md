# Etat du projet - MorphoStyle Studio

Derniere verification: 2026-08-25

## Objectif du produit

Permettre a un utilisateur de visualiser des recommandations de coupe adaptees a sa morphologie, a partir de profils demo ou de sa photo personnelle, avec une experience mobile simple et une logique de credits controlable.

## Architecture actuelle

| Partie | Etat | Emplacement |
| --- | --- | --- |
| Frontend | Actif | `App.tsx`, `components/`, `services/` |
| Build | Vite + TypeScript | `npm run build` |
| Serveur API | Actif en production | `server/index.mjs`, `server.js` |
| Generation image | Cote serveur | `/api/openai-upload-recommendations`, `/api/openai-selected-result` |
| Decoupage planches | Actif | Sharp cote serveur |
| Profils statiques | Actifs | `public/demo-profiles/` |
| Historique public | Actif, a renforcer | `server/data/public-generations.json` et API |
| Session invite | Phase 1 active | `/api/session/guest`, `server/user-memory.mjs` |
| Historique personnel | Phase 1 active | `/api/me/generations`, `server/data/user-memory.json` |
| Memoire projet | Active | `docs/memoire/` |
| Ajout multi-utilisateur | Cadre documente | `docs/architecture/AJOUT_MULTI_UTILISATEUR_HOSTINGER.md` |

## Fonctions deja presentes

- Selection de profils demo.
- Chargement d'une photo personnelle.
- Consultation avec criteres longueur, entretien, univers et style.
- Generation d'une planche recommandations 4x4.
- Generation d'une planche finale pour la proposition selectionnee.
- Decoupage en portraits independants.
- Historique du jour cote navigateur.
- Historique du jour cote serveur pour les photos personnelles en mode invite.
- Recuperation de l'historique serveur au chargement de l'application.
- Vitrine publique de generations publiees.
- Telechargement depuis les fiches de generation.
- Boutons retour et accueil dans le parcours.

## Points a surveiller

- Les credits et quotas ne doivent pas dependre uniquement du navigateur.
- Le stockage JSON `server/data/user-memory.json` est une phase de transition; la source durable cible reste MySQL Hostinger.
- Une personne ne doit pas pouvoir consommer des essais illimites en vidant le localStorage.
- Les photos personnelles doivent etre traitees comme donnees sensibles.
- La vitrine publique ne doit pas exposer une image sans validation volontaire.
- Le serveur doit eviter les noms de fichiers predictibles pour les images personnelles.
- Les generations doivent rester reliables a une fiche historique afin que le bouton retour ne fasse pas perdre le resultat.

## Commandes utiles

| Besoin | Commande |
| --- | --- |
| Lancer le frontend local | `npm run dev` |
| Lancer l'API locale | `npm run dev:api` |
| Lancer production locale | `npm run start` |
| Verifier TypeScript | `npm run lint` |
| Compiler | `npm run build` |
| Valider recettes statiques | `npm run validate:recipes` |
| Tester session invite | `POST /api/session/guest` |
| Tester historique personnel | `GET /api/me/generations?clientId=...&scope=today` |

## Verification production recente

Le 2026-08-25, `https://morphostyle.c2rdesign.com/api/health` repond avec:

- `ok: true`
- `hasOpenAiKey: true`
- `openAiUploadRecommendations: true`
- `sharpAvailable: true`

Cette verification confirme que MorphoStyle peut s'appuyer sur une couche serveur Hostinger, pas seulement sur un hebergement statique pur.
