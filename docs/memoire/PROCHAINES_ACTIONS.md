# Prochaines actions - MorphoStyle Studio

Derniere mise a jour: 2026-08-25

## Priorite haute

- [x] Ajouter un premier socle invite/historique serveur sans compte obligatoire.
- [ ] Creer le schema MySQL Hostinger pour utilisateurs, invites, credits, generations, images et publications.
- [ ] Ajouter une configuration serveur `DATABASE_URL` ou variables MySQL Hostinger sans secret dans Git.
- [x] Ajouter un `guest_id` serveur pour le mode invite.
- [ ] Remplacer le quota journalier global par un quota par invite/utilisateur.
- [x] Enregistrer chaque generation personnelle OpenAI dans une fiche historique serveur phase 1.
- [ ] Garantir le telechargement depuis l'historique personnel et public.
- [ ] Ajouter le bouton `Publier dans public` depuis la fiche historique personnelle.

## Priorite moyenne

- [ ] Ajouter compte email avec code magique ou lien de connexion sans mot de passe.
- [ ] Ajouter migration invite vers compte utilisateur.
- [ ] Ajouter portefeuille de credits et journal de mouvements.
- [x] Alimenter les resultats du jour avec l'historique serveur invite.
- [ ] Ajouter une page `Mes resultats` pour les resultats sauvegardes entre plusieurs jours.
- [ ] Ajouter politique de conservation des photos et suppression utilisateur.
- [ ] Ajouter manifeste PWA, icones et service worker minimal.

## Agent multi-projets

- [ ] Utiliser MorphoStyle comme cas pilote pour documenter un generateur de socle multi-utilisateur Hostinger.
- [ ] Dans `02_AGENT_AMELIORATION`, creer ensuite une commande qui lit la memoire projet et propose le schema utilisateurs/credits/historique adapte.
- [ ] Imposer un dry-run, un audit securite et une validation utilisateur avant tout ajout de base de donnees ou publication.

## Definition de termine

Une action est cochee uniquement si:

- le fichier ou la fonction existe;
- une verification locale ou production est notee;
- la memoire `REPRISE_RAPIDE.md` reste a jour;
- aucun secret n'est ajoute au depot.
