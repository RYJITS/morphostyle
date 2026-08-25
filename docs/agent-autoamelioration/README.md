# Agent d'amelioration - MorphoStyle Studio

Ce dossier indique au futur agent externe comment intervenir sur MorphoStyle sans casser l'application publiee.

## Principe

MorphoStyle sert de cas pilote pour un ajout reutilisable: **PWA + multi-utilisateur + Hostinger Node.js + MySQL + credits + historique**.

L'agent doit:

1. lire `docs/memoire/REPRISE_RAPIDE.md`;
2. lire `docs/memoire/DECISIONS.md`;
3. lire `docs/architecture/AJOUT_MULTI_UTILISATEUR_HOSTINGER.md`;
4. verifier l'etat reel du code et de la production;
5. preparer un dry-run de schema, routes et migration;
6. executer les tests `npm run lint` et `npm run build`;
7. demander validation avant toute connexion base, publication ou changement de quota reel.

## Interdictions

- Ne pas modifier les secrets Hostinger ou OpenAI sans validation.
- Ne pas publier automatiquement.
- Ne pas supprimer d'images ou historiques existants.
- Ne pas remplacer le mode demo statique par des appels API.
- Ne pas exposer une photo personnelle dans la vitrine sans action utilisateur.

## Sortie attendue d'un dry-run

Le futur agent doit produire:

- schema MySQL propose;
- routes API proposees;
- plan de migration;
- risques securite;
- tests a executer;
- points qui exigent une decision utilisateur.

## Lien avec 02_AGENT_AMELIORATION

Le prototype reusable est documente dans:

`D:/00_Cerveau_IA/Projet/02_AGENT_AMELIORATION/missions/prototypes/006_SYSTEME_MULTI_UTILISATEUR_HOSTINGER.md`
