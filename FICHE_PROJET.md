# MorphoStyle AI - Assistant de conseil coiffure et style par IA

## Liens vers l'application
- Lien public: [https://morphostyle.c2rdesign.com](https://morphostyle.c2rdesign.com)
- GitHub: [https://github.com/RYJITS/morphostyle](https://github.com/RYJITS/morphostyle)

## A quoi sert le projet
MorphoStyle AI est une application web qui permet de tester une consultation coiffure/visagisme. Elle combine cinq profils demo prepares en base statique et un parcours photo personnelle utilisant OpenAI Image cote serveur. L'objectif est de montrer des recommandations morphologiques realistes sans multiplier les appels API inutiles.

## Fonctionnement de l'application ou du projet
L'application suit deux parcours. Les profils demo chargent des planches statiques deja preparees et decoupees localement. Pour une photo personnelle, l'utilisateur charge son portrait, choisit ses reglages, puis OpenAI genere une premiere planche 4x4 avec quatre propositions. L'utilisateur selectionne une proposition et une seconde planche finale est generee puis decoupee en face, profil gauche, profil droit et dos. Le serveur applique une limite d'un essai complet OpenAI par jour et conserve uniquement des empreintes de session pour le quota.

## Comment le projet a ete construit
Le projet a ete reconstruit autour d'une logique economique et controlable: les exemples restent statiques, les images personnelles utilisent deux appels OpenAI maximum par essai, et le serveur garde les cles API hors du navigateur. Les planches sont decoupees avec Sharp pour afficher des portraits independants et agrandissables. L'interface React garde un parcours simple: selection d'un profil ou upload, reglages, choix d'une proposition, resultat final avec vues complementaires.

## Installation et utilisation
### Installation
[object Object]

### Utilisation
Après installation, l'utilisateur accède à l'application via un navigateur web. Il commence par charger une photo de son visage, puis remplit un formulaire de profil (âge, type de visage, préférences). L'application analyse automatiquement la morphologie et propose des styles adaptés. L'utilisateur sélectionne jusqu'à quatre styles, puis l'IA génère des aperçus réalistes en conservant ses caractéristiques uniques. Il peut ensuite demander des angles supplémentaires (profil gauche/droit, dos) pour une visualisation complète. Le système gère automatiquement les erreurs et les retries en cas de saturation du service.

## Fonctions disponibles dans l'application
- Selection de profils demo statiques
- Upload d'une photo personnelle
- Generation OpenAI d'une planche 4x4 de recommandations
- Generation OpenAI d'une planche finale pour la coupe selectionnee
- Quota serveur: un essai complet photo personnelle par jour
- Decoupage local des planches en portraits face, profils et dos
- Validation des ages pour eviter les suggestions inappropriees
- Interface responsive adaptee aux mobiles et desktop

## Outils, IA et moteurs en arriere-plan
- React pour l'interface utilisateur
- Vite comme serveur de développement et outil de build
- Node.js pour le backend et la gestion des scripts
- OpenAI Image API cote serveur pour les essais photo personnelle
- @google/genai conserve pour les anciens modes/fallbacks
- Tailwind CSS pour le style et la mise en page
- TypeScript pour le typage statique
- ES Modules pour la gestion des dépendances
- Git pour le versionnage du code

## Automatisations integrees
- Generation OpenAI limitee a un essai complet par jour
- Creation d'une session entre la planche recommandations et la planche finale
- Decoupage automatique des planches avec Sharp
- Blocage du deuxieme essai journalier cote serveur
- Validation automatique des ages pour eviter les suggestions inappropriees
- Conservation automatique de l'identite, de la lumiere et du contexte dans les prompts
- Memoire projet Markdown dans `docs/memoire/`
- Cahier d'ajout multi-utilisateur Hostinger dans `docs/architecture/AJOUT_MULTI_UTILISATEUR_HOSTINGER.md`

## Captures d'ecran
![Capture 1 - morphostyle](docs/captures/20-morphostyle-2026-06-25_03-17-30-desktop.png)

![Capture 2 - morphostyle](docs/captures/20-morphostyle-2026-06-25_03-17-30-mobile.png)

## Mises a jour
- Optimisation des prompts pour une meilleure conservation de l'identité et du contexte dans les aperçus générés
- Ajout de la gestion automatique des retries avec délai exponentiel en cas de saturation du service d'IA
- Validation stricte des âges pour exclure les suggestions inappropriées (ex : barbe pour enfants)
- Amélioration de la robustesse des schémas JSON pour l'analyse morphologique
- Ajout du mode OpenAI Image avec quota d'un essai complet par jour
- Passage du parcours photo personnelle a deux planches: recommandations puis resultat final
