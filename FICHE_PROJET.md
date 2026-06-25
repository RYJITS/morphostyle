# Morphostyle

## Liens vers l'application
- Lien public: lien detecte mais masque par securite orchestrateur
- GitHub: non detecte

## A quoi sert le projet
Morphostyle est une application IA de conseil visuel pour coiffure et style. Elle part d'une photo, recueille un profil de consultation, analyse la morphologie, propose des styles et genere des apercus realistes.

## Fonctionnement de l'application ou du projet
L'utilisateur charge une image, renseigne le genre, l'age, le niveau d'entretien, le style de vie et la longueur souhaitee. Gemini analyse ensuite la morphologie avec un schema JSON strict et renvoie la forme du visage, le conseil professionnel et une liste de styles recommandes. L'utilisateur selectionne jusqu'a quatre styles, genere les looks, puis peut demander des angles supplementaires gauche, droite ou dos.

## Comment le projet a ete construit
Le projet a ete concu comme un assistant de consultation: il combine analyse structuree, recommandations lisibles et generation image-to-image. Les prompts insistent sur la conservation de l'identite, du fond, des vetements et de la lumiere afin de modifier surtout la coiffure ou la barbe.

## Fonctions disponibles dans l'application
- Uploader une photo
- Renseigner un profil de consultation
- Analyser la morphologie
- Recevoir des conseils professionnels
- Proposer des styles adaptes
- Selectionner jusqu'a quatre looks
- Generer des apercus realistes
- Demander des angles supplementaires
- Eviter les suggestions barbe pour enfant/bebe

## Outils, IA et moteurs en arriere-plan
- Gemini pour analyse morphologique
- Gemini image-to-image
- Schema JSON strict
- Prompts de conservation identite/fond/lumiere
- Generation quick preview
- Generation multi-angle
- Retry automatique
- Gestion saturation service

## Automatisations integrees
- Retry automatique avec delai exponentiel
- Analyse morphologique en JSON strict
- Regles age enfant/bebe sans barbe
- Generation rapide de previews
- Generation des looks selectionnes
- Conservation automatique de l'identite et du contexte dans le prompt
- Generation des angles front/left/right/back
- Messages de chargement et erreurs service sature

## Captures d'ecran
- Aucune capture validee pour cette fiche.

## Mises a jour
- Fiche actualisee depuis le registre orchestrateur et le catalogue projet.
- Changements locaux detectes: relire la fiche apres validation des modifications.
- Derniere mise a jour registre connue: 2026-06-21T21:46:02.186Z.

## Derniere mise a jour
2026-06-21T21:46:02.193Z

> Fichier genere par l'orchestrateur pour le hub Site Ma Methode.
