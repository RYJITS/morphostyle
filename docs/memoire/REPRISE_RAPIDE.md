# Reprise rapide - MorphoStyle Studio

Derniere mise a jour: 2026-08-25

## Mission

MorphoStyle Studio est une application web/PWA de conseil coiffure et visage. Elle propose des profils demo statiques et un parcours photo personnelle avec generation de planches, historique, telechargement et vitrine publique.

## Etat actuel

- Lien public: `https://morphostyle.c2rdesign.com`.
- Stack: React, Vite, TypeScript, Node.js, Express-like serveur natif, Sharp.
- Point d'entree agent local: `AGENTS.md`.
- Production verifiee le 2026-08-25: `/api/health` repond `ok`, cle image serveur active et `sharpAvailable: true`.
- Parcours demo: profils Sofia, Ilia, Elena, Mark et Sam avec bibliotheque statique.
- Parcours photo personnelle: une planche recommandations 4x4 puis une planche finale pour la coupe selectionnee.
- Limite actuelle: un essai complet image par jour cote serveur.
- Historique personnel phase 1: mode invite anonyme et memoire serveur JSON privee dans `server/data/user-memory.json` en attendant MySQL.
- Vitrine publique: expose les generations publiees quand elles sont marquees comme publiques.

## Decisions actives

- La PWA reste le chemin prioritaire avant une app Play Store.
- La gestion multi-utilisateur doit etre cote serveur, pas uniquement dans le navigateur.
- Les cles API restent cote serveur et ne doivent jamais etre exposees au frontend.
- Hostinger est la cible d'hebergement: Node.js pour l'API, MySQL pour comptes, credits, quotas et historiques.
- Les photos personnelles doivent rester privees par defaut; publication publique seulement apres action explicite.
- Les resultats doivent rester telechargeables depuis l'historique personnel et depuis une fiche publique.
- Toute evolution importante doit mettre a jour cette memoire Markdown et la memoire centrale.

## Priorites de reprise

1. Remplacer le stockage JSON phase 1 par une base MySQL Hostinger avec le meme contrat fonctionnel.
2. Ajouter la migration invite vers compte email.
3. Ajouter une fiche historique serveur detaillee avec photo d'origine, recommandations, resultat final, vues et actions de telechargement.
4. Ajouter la publication depuis une fiche historique vers la vitrine publique avec statut serveur synchronise.
5. Ajouter credits persistants et journal transactionnel.
6. Preparer la PWA installable: manifeste, icones, service worker simple et contraintes de cache.

## Garde-fous

- Ne pas stocker de cle API, token paiement ou secret dans Git.
- Ne pas publier automatiquement une photo personnelle dans la vitrine publique.
- Ne pas compter un essai comme consomme si la premiere planche echoue avant resultat exploitable.
- Ne pas perdre l'historique apres un retour navigation ou un rafraichissement.
- Ne pas supprimer les images generees tant qu'une fiche historique les reference.

## Pour approfondir

- Etat projet: `ETAT_PROJET.md`
- Decisions: `DECISIONS.md`
- Prochaines actions: `PROCHAINES_ACTIONS.md`
- Regles metier: `REGLES_METIER.md`
- Ajout multi-utilisateur: `../architecture/AJOUT_MULTI_UTILISATEUR_HOSTINGER.md`
- Agent local: `../agent-autoamelioration/README.md`
- Sessions: `sessions/`
