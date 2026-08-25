# Decisions du projet - MorphoStyle Studio

Ce fichier conserve les decisions encore applicables. Une decision remplacee doit rester visible avec son statut et le lien vers la nouvelle decision.

## M-001 - Memoire Markdown projet

- Date: 2026-08-25
- Statut: Active
- Decision: conserver une memoire projet dans `docs/memoire/`, lisible par Codex, l'utilisateur et le futur agent d'amelioration.
- Raison: la reprise doit rester possible sans relire tout l'historique de conversation.

## M-002 - Point d'entree agent

- Date: 2026-08-25
- Statut: Active
- Decision: utiliser `AGENTS.md` comme point d'entree local, puis `docs/memoire/REPRISE_RAPIDE.md` comme resume courant.
- Raison: les futures sessions doivent retrouver automatiquement les regles MorphoStyle, le cahier Hostinger et les garde-fous de donnees personnelles.

## M-003 - PWA avant Play Store

- Date: 2026-08-25
- Statut: Active
- Decision: privilegier une PWA installable avant une application Play Store.
- Raison: le Play Store ajoute validation, testeurs, politiques de paiement et complexite de publication; la PWA permet de tester le marche plus vite.

## M-004 - Gestion multi-utilisateur cote serveur

- Date: 2026-08-25
- Statut: Active
- Decision: les comptes, credits, quotas et historiques persistants doivent etre geres cote serveur.
- Application: utiliser une API Hostinger Node.js et une base MySQL Hostinger.
- Limite: le localStorage peut garder un cache ou un mode invite, mais il ne doit pas etre la source de verite des credits.

## M-005 - Mode invite puis compte optionnel

- Date: 2026-08-25
- Statut: Active
- Decision: autoriser un mode invite pour reduire la friction, puis proposer un compte optionnel pour sauvegarder credits et historique entre appareils.
- Application: creer un `guest_id` anonyme signe ou opaque, migrable vers un compte email.

## M-006 - Photos privees par defaut

- Date: 2026-08-25
- Statut: Active
- Decision: une photo personnelle, sa planche et son resultat final restent prives tant que l'utilisateur ne clique pas sur publier.
- Application: la vitrine publique doit copier ou exposer seulement les images marquees explicitement publiques.

## M-007 - Credits et essais

- Date: 2026-08-25
- Statut: Active
- Decision: un essai complet consomme deux generations maximum: planche recommandations et planche finale selectionnee.
- Application: le debit de credits doit etre transactionnel; en cas d'echec avant image exploitable, le credit doit etre restaure ou marque `failed_refunded`.

## M-008 - Historique telechargeable

- Date: 2026-08-25
- Statut: Active
- Decision: chaque fiche historique doit conserver la photo d'origine, les quatre recommandations, le resultat final, les vues associees et les boutons de telechargement.
- Raison: l'utilisateur doit pouvoir retrouver tous ses resultats du jour, puis ses resultats permanents s'il cree un compte.

## M-009 - Agent reusable multi-projets

- Date: 2026-08-25
- Statut: Active
- Decision: l'ajout multi-utilisateur Hostinger de MorphoStyle sert de cas pilote pour un futur agent capable de generer ce socle dans d'autres projets.
- Document: `docs/agent-autoamelioration/README.md` et `D:/00_Cerveau_IA/Projet/02_AGENT_AMELIORATION/missions/prototypes/006_SYSTEME_MULTI_UTILISATEUR_HOSTINGER.md`.
