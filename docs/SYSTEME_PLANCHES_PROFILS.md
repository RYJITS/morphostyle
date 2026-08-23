# Systeme de production des planches profils

Ce systeme sert a produire les bases statiques de MorphoStyle pour chaque profil demo.

## Regle principale

Une planche correspond toujours a une selection exacte:

`profil + longueur + entretien + univers`

Exemple:

`Ilia + medium + low + modern`

Une planche ne doit jamais etre reutilisee pour une autre selection. Si la selection n'existe pas encore, l'application doit revenir au mode non prepare.

## Matrice complete par profil

Pour un profil complet, il faut 36 planches:

- 4 longueurs: `short`, `medium`, `long`, `any`
- 3 niveaux d'entretien: `low`, `medium`, `high`
- 3 univers: `classic`, `modern`, `bold`

Chaque planche produit ensuite:

- 4 miniatures de recommandations
- 4 fiches resultat final
- 16 vues finales separees

Total par profil complet:

- 36 planches sources
- 144 miniatures
- 144 fiches resultat
- 576 vues finales

## Profil modele valide

Ilia est le premier profil enfant complet.
Elena est le premier profil senior complet.
Mark est le premier profil homme mur complet.
Sam est le premier profil garcon enfant complet.
Les anciens essais Alibaba de Mark ont ete remplaces dans `public/demo-profiles/marc` par une base non-Alibaba et archives hors du dossier public.
Mark peut rester un profil de test Alibaba uniquement si les nouveaux fichiers generes ne sont pas actives dans l'application avant validation.

Etat valide:

- 36 planches sources presentes
- 144 miniatures de recommandations
- 144 fiches resultat final
- 576 vues finales separees

Les prochains profils doivent reprendre exactement ce systeme avant d'etre marques comme complets dans l'application.

## Extension locale de matrice statique

Quand le quota API est bloque mais qu'une base demo doit fonctionner sur toutes les selections, utiliser:

`python scripts\expand-static-profile-matrix.py marc sam`

Ce script conserve les planches deja validees, genere les cles manquantes jusqu'a 36 planches par profil, puis il faut lancer:

`python scripts\slice-profile-boards.py marc --strict`

`python scripts\slice-profile-boards.py sam --strict`

Une matrice ne doit etre activee en `all` dans `services/profileLookDatabase.ts` qu'apres obtention des volumes complets:

- 36 planches
- 144 miniatures
- 144 fiches resultat
- 576 vues finales

## Generation directe Alibaba API

Pour tester une planche generee directement par Alibaba/Qwen Image:

`npm run generate:alibaba-board -- --profile marc --length short --maintenance low --lifestyle classic --force`

Le script lit `D:\00_Cerveau_IA\API\env.Local`, utilise `Alibaba_API_KEY`, envoie la photo source du profil, sauvegarde la planche dans `combination-boards`, puis lance `scripts/slice-profile-boards.py --strict`.

Mode haute qualite recommande:

`npm run generate:alibaba-board -- --profile marc --length short --maintenance low --lifestyle classic --mode variant-sheets --force`

Ce mode genere 4 planches 2x2 dans `variant-sheets`, une par proposition, puis lance `scripts/slice-variant-sheets.py --strict`. La taille par defaut est `1360*2040`: chaque cellule source mesure environ 680x1020 au lieu de 256x384 dans une planche 4x4 en 1024x1536.

Pour corriger une seule variante:

`npm run generate:alibaba-board -- --profile marc --length short --maintenance low --lifestyle classic --mode variant-sheets --variant signature --force`

Regle de validation:

- si le controle strict detecte un bord blanc exterieur ou des profils gauche/droite trop miroir, la planche doit etre rejetee et regeneree;
- seule une selection validee doit etre ajoutee dans `preparedCombinationCoverage`;
- une base partielle ne doit jamais etre presentee comme complete.
- si le quota Alibaba bloque une variante, conserver les variantes validees et reprendre avec `--variant <nom>` quand le quota est disponible.

## Upload utilisateur dans l'application

La page d'accueil permet aussi de charger une photo utilisateur. Ce mode n'utilise pas les bases statiques `demo-profiles`.

Flux:

1. L'utilisateur charge une image depuis la tuile `Charger une photo`.
2. L'application ouvre le profil de consultation.
3. L'utilisateur choisit genre, tranche d'age, entretien, univers et longueur.
4. Au clic sur `Afficher les recommandations`, le front appelle:

`POST /api/alibaba-upload-recommendations`

5. Le serveur lit `Alibaba_API_KEY`, genere les planches 2x2 haute qualite par variante, decoupe les vues avec Sharp, sauvegarde les fichiers dans:

`public/generated-alibaba/<session>/`

6. Le front recoit les 4 recommandations pretes a afficher:
   - `previewUrl`
   - `resultImageUrl`
   - `additionalViews.left`
   - `additionalViews.right`
   - `additionalViews.back`

Regles:

- la cle Alibaba reste uniquement cote serveur;
- l'utilisateur ne peut selectionner qu'une proposition dans ce mode;
- le resultat final affiche la vue de face + les vues gauche/droite/dos cliquables;
- si Alibaba bloque le quota, l'application doit afficher l'erreur sans revenir au mode demo.
- l'erreur `AllocationQuota.FreeTierOnly` doit etre traduite en message utilisateur clair: quota gratuit epuise, attendre le renouvellement ou configurer le paiement/desactiver `free tier only`.

## Structure obligatoire d'une planche

Chaque planche source est une grille portrait 4x4 en ratio 2:3, idealement 1024x1536.

- Ligne 1: vue de face
- Ligne 2: profil gauche
- Ligne 3: profil droit
- Ligne 4: vue de dos
- Colonne 1: proposition `primary`
- Colonne 2: proposition `soft`
- Colonne 3: proposition `structured`
- Colonne 4: proposition `signature`

Les cellules doivent etre proches du format photo d'identite: tete et epaules, fond studio neutre, cadrage portrait propre.

## Regles visuelles obligatoires

- Les 4 propositions doivent respecter la selection exacte.
- Les propositions 2 et 3 doivent etre nettement differentes au premier coup d'oeil.
- Les vues gauche et droite ne doivent pas etre de simples miroirs.
- Le profil droit doit etre une vraie photo differente: angle, oreille, meches, epaule et chute des cheveux doivent varier.
- Le profil enfant ne doit pas recevoir de style adulte, glamour, maquillage ou coiffage trop mature.
- Aucune bordure blanche exterieure ne doit apparaitre.
- Les separateurs internes peuvent etre fins, uniquement pour permettre la decoupe.
- Les fichiers decoupes ne doivent pas contenir de bandes parasites provenant d'une cellule voisine.

## Controle avant integration

Avant d'activer une planche dans l'application:

1. Verifier le ratio portrait de la planche source.
2. Verifier que la planche correspond bien a sa cle de selection.
3. Verifier visuellement les colonnes 2 et 3.
4. Verifier visuellement les profils gauche et droit.
5. Decouper avec `scripts/slice-profile-boards.py`.
6. Verifier les dimensions:
   - miniatures: 768x1152
   - vues finales: 768x1152
   - fiches resultat: grille 2x2 portrait
7. Tester dans l'application:
   - la selection exacte affiche la planche preparee
   - une autre selection ne reutilise pas cette planche
   - le resultat final affiche face, gauche, droite et dos

## Convention de fichiers

Planche source:

`public/demo-profiles/<profil>/combination-boards/<longueur>-<entretien>-<univers>.png`

Miniatures:

`public/demo-profiles/<profil>/recommendation-previews/<longueur>-<entretien>-<univers>-<variant>.png`

Fiches resultat:

`public/demo-profiles/<profil>/final-selections/<longueur>-<entretien>-<univers>-<variant>.png`

Vues finales:

`public/demo-profiles/<profil>/final-views/<longueur>-<entretien>-<univers>-<variant>-<vue>.png`

Variants:

- `primary`
- `soft`
- `structured`
- `signature`

Vues:

- `front`
- `left`
- `right`
- `back`
