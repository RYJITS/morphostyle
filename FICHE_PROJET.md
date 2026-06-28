# MorphoStyle AI - Assistant de conseil coiffure et style par IA

## Liens vers l'application
- Lien public: [https://morphostyle.c2rdesign.com](https://morphostyle.c2rdesign.com)
- GitHub: [https://github.com/RYJITS/morphostyle](https://github.com/RYJITS/morphostyle)

## A quoi sert le projet
MorphoStyle AI est une application web qui permet aux utilisateurs de recevoir des conseils personnalisés en coiffure et style grâce à l'analyse morphologique automatisée de leur visage. L'application combine une interface intuitive avec des modèles d'IA spécialisés pour générer des aperçus réalistes de styles adaptés, tout en conservant les caractéristiques uniques de chaque utilisateur. Elle s'adresse aussi bien aux particuliers qu'aux professionnels souhaitant visualiser rapidement des propositions créatives.

## Fonctionnement de l'application ou du projet
L'application suit un workflow en cinq étapes : 1) L'utilisateur charge une photo de son visage et remplit un formulaire de profil (âge, type de visage, préférences). 2) L'IA analyse la morphologie du visage via un schéma JSON strict et génère des recommandations de styles adaptés. 3) L'utilisateur sélectionne jusqu'à quatre styles parmi les propositions générées. 4) L'IA génère des aperçus réalistes en conservant l'identité, la lumière, les vêtements et le contexte de la photo originale. 5) L'utilisateur peut demander des angles supplémentaires (profil gauche/droit, dos) pour une visualisation complète. Le système gère automatiquement les erreurs et les retries en cas de saturation du service.

## Comment le projet a ete construit
Le projet a été conçu comme un assistant de consultation en coiffure, combinant analyse structuree, recommandations lisibles et génération d'images réalistes. Les choix clés incluent : l'utilisation d'un schéma JSON strict pour l'analyse morphologique afin d'assurer la précision des recommandations, des prompts optimisés pour conserver l'identité et le contexte de la photo dans les aperçus générés, une gestion automatique des retries avec délai exponentiel pour améliorer la robustesse, et une interface utilisateur intuitive pour faciliter l'expérience. L'architecture modulaire sépare clairement le frontend (React avec Vite) du backend (Node.js), avec une gestion centralisée des erreurs et des validations. Le responsive design permet une utilisation optimale sur mobile et desktop.

## Installation et utilisation
### Installation
[object Object]

### Utilisation
Après installation, l'utilisateur accède à l'application via un navigateur web. Il commence par charger une photo de son visage, puis remplit un formulaire de profil (âge, type de visage, préférences). L'application analyse automatiquement la morphologie et propose des styles adaptés. L'utilisateur sélectionne jusqu'à quatre styles, puis l'IA génère des aperçus réalistes en conservant ses caractéristiques uniques. Il peut ensuite demander des angles supplémentaires (profil gauche/droit, dos) pour une visualisation complète. Le système gère automatiquement les erreurs et les retries en cas de saturation du service.

## Fonctions disponibles dans l'application
- Analyse morphologique automatique du visage à partir d'une photo
- Génération de recommandations de styles de coiffure ou barbe adaptés
- Création d'aperçus réalistes en conservant l'identité, la lumière et le contexte
- Génération d'angles supplémentaires (face, profil gauche/droit, dos)
- Conservation automatique des vêtements, du fond et de l'éclairage
- Gestion des erreurs et retries automatiques avec délai exponentiel
- Validation automatique des âges pour éviter les suggestions inappropriées
- Interface responsive adaptée aux mobiles et desktop

## Outils, IA et moteurs en arriere-plan
- React pour l'interface utilisateur
- Vite comme serveur de développement et outil de build
- Node.js pour le backend et la gestion des scripts
- @google/genai pour l'interaction avec les modèles d'IA
- Tailwind CSS pour le style et la mise en page
- TypeScript pour le typage statique
- ES Modules pour la gestion des dépendances
- Git pour le versionnage du code

## Automatisations integrees
- Analyse morphologique automatique via un schéma JSON strict
- Génération rapide de prévisualisations réalistes
- Génération des angles supplémentaires (face, profil gauche/droit, dos)
- Retries automatiques en cas de saturation du service avec délai exponentiel
- Validation automatique des âges pour éviter les suggestions inappropriées
- Conservation automatique de l'identité, de la lumière et du contexte dans les prompts

## Captures d'ecran
![Capture 1 - morphostyle](docs/captures/20-morphostyle-2026-06-25_03-17-30-desktop.png)

![Capture 2 - morphostyle](docs/captures/20-morphostyle-2026-06-25_03-17-30-mobile.png)

## Mises a jour
- Optimisation des prompts pour une meilleure conservation de l'identité et du contexte dans les aperçus générés
- Ajout de la gestion automatique des retries avec délai exponentiel en cas de saturation du service d'IA
- Validation stricte des âges pour exclure les suggestions inappropriées (ex : barbe pour enfants)
- Amélioration de la robustesse des schémas JSON pour l'analyse morphologique
- Passage en statut PUBLIC_READY avec validation de sécurité OK_PUBLIC
- Optimisation des prompts pour une meilleure conservation de l'identité et du contexte dans les aperçus générés
- Ajout de la gestion automatique des retries avec délai exponentiel en cas de saturation du service d'IA
- Validation stricte des âges pour exclure les suggestions inappropriées (ex : barbe pour enfants)
- Amélioration de la robustesse des schémas JSON pour l'analyse morphologique
- Passage en statut PUBLIC_READY avec validation de sécurité OK_PUBLIC

> Fichier genere par l'orchestrateur pour le hub Site Ma Methode.
