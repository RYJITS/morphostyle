# Brouillon contenu fiche - MorphoStyle AI - Assistant de conseil coiffure et style par IA

## Resume
Application web qui analyse une photo de visage et propose des styles de coiffure ou barbe adaptés à la morphologie, avec génération d'aperçus réalistes et angles supplémentaires.

## A quoi sert le projet
Démocratiser l'accès à des conseils professionnels en coiffure et style en combinant analyse morphologique automatisée et génération d'images réalistes, pour fournir des recommandations personnalisées et immédiates.

## Fonctionnement
L'application suit un workflow en cinq étapes : 1) L'utilisateur charge une photo de son visage et remplit un formulaire de profil (âge, type de visage, préférences). 2) L'IA analyse la morphologie du visage via un schéma JSON strict et génère des recommandations de styles adaptés. 3) L'utilisateur sélectionne jusqu'à quatre styles parmi les propositions générées. 4) L'IA génère des aperçus réalistes en conservant l'identité, la lumière, les vêtements et le contexte de la photo originale. 5) L'utilisateur peut demander des angles supplémentaires (profil gauche/droit, dos) pour une visualisation complète. Le système gère automatiquement les erreurs et les retries en cas de saturation du service.

## Construction
Le projet a été conçu comme un assistant de consultation en coiffure, combinant analyse structuree, recommandations lisibles et génération d'images réalistes. Les choix clés incluent : l'utilisation d'un schéma JSON strict pour l'analyse morphologique afin d'assurer la précision des recommandations, des prompts optimisés pour conserver l'identité et le contexte de la photo dans les aperçus générés, une gestion automatique des retries avec délai exponentiel pour améliorer la robustesse, et une interface utilisateur intuitive pour faciliter l'expérience. L'architecture modulaire sépare clairement le frontend (React avec Vite) du backend (Node.js), avec une gestion centralisée des erreurs et des validations. Le responsive design permet une utilisation optimale sur mobile et desktop.

## Installation
[object Object]

## Utilisation
Après installation, l'utilisateur accède à l'application via un navigateur web. Il commence par charger une photo de son visage, puis remplit un formulaire de profil (âge, type de visage, préférences). L'application analyse automatiquement la morphologie et propose des styles adaptés. L'utilisateur sélectionne jusqu'à quatre styles, puis l'IA génère des aperçus réalistes en conservant ses caractéristiques uniques. Il peut ensuite demander des angles supplémentaires (profil gauche/droit, dos) pour une visualisation complète. Le système gère automatiquement les erreurs et les retries en cas de saturation du service.

## Fonctions
- Analyse morphologique automatique du visage à partir d'une photo
- Génération de recommandations de styles de coiffure ou barbe adaptés
- Création d'aperçus réalistes en conservant l'identité, la lumière et le contexte de la photo originale
- Génération d'angles supplémentaires (profil gauche/droit, dos)
- Conservation automatique des vêtements, du fond et de l'éclairage
- Gestion des erreurs et retries automatiques en cas de saturation du service
- Validation stricte des âges pour éviter les suggestions inappropriées
