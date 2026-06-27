# Morphostyle

## Rapport complet

Ce depot public presente le concept, les fonctions, les choix de conception, les outils utilises, les commandes locales et les captures d'ecran de l'application. Il est genere par l'orchestrateur uniquement apres validation de publication publique.

## Concept

Application IA de conseil coiffure et style. Elle analyse une photo, propose des styles adaptes puis genere des apercus et angles supplementaires.

Transformer une photo et un besoin de style en recommandations visuelles exploitables.

Public vise: Design, conseil visuel, coiffure, experimentation IA et outil creatif.


## Fonctionnement de l'application

L'utilisateur charge une image, renseigne le genre, l'age, le niveau d'entretien, le style de vie et la longueur souhaitee. Gemini analyse ensuite la morphologie avec un schema JSON strict et renvoie la forme du visage, le conseil professionnel et une liste de styles recommandes. L'utilisateur selectionne jusqu'a quatre styles, genere les looks, puis peut demander des angles supplementaires gauche, droite ou dos.

## Fonctions de l'application

- Analyse la morphologie a partir d'une image.
- Propose des styles recommandes selon le profil.
- Genere des apercus et variantes de coiffure.
- Garde l'identite, la lumiere et le contexte pendant les transformations.
- Uploader une photo
- Renseigner un profil de consultation
- Analyser la morphologie
- Recevoir des conseils professionnels
- Proposer des styles adaptes
- Selectionner jusqu'a quatre looks
- Generer des apercus realistes
- Demander des angles supplementaires
- Eviter les suggestions barbe pour enfant/bebe

## Actualisations et evolution

- Statut courant: PUBLIC_READY.
- Securite: OK_PUBLIC.
- Fonctionnement: FONCTIONNEL.

## Options et conception

Le projet a ete concu comme un assistant de consultation: il combine analyse structuree, recommandations lisibles et generation image-to-image. Les prompts insistent sur la conservation de l'identite, du fond, des vetements et de la lumiere afin de modifier surtout la coiffure ou la barbe.

### Outils, IA et moteurs utilises

- Gemini pour analyse morphologique
- Gemini image-to-image
- Schema JSON strict
- Prompts de conservation identite/fond/lumiere
- Generation quick preview
- Generation multi-angle
- Retry automatique
- Gestion saturation service
- React
- Vite
- TypeScript
- @google/genai
- Gemini pour analyse JSON
- Upload base64
- Schemas stricts
- Gestion d'erreurs et retry

### Options techniques detectees

- Type de projet: node
- Gestionnaire: npm
- Nom package: morphostyle-ai
- Version: 1.0.0
- Lien public: https://morphostyle.c2rdesign.com
- Statut securite: OK_PUBLIC

### Stack et dependances principales

- Vite/Dev server
- React
- Node.js
- Vite
- TypeScript
- @google/genai
- Gemini pour analyse JSON
- Gemini image-to-image
- Upload base64
- Schemas stricts
- Generation multi-angle
- Gestion d'erreurs et retry

### Scripts disponibles

- build: tsc && vite build
- dev: vite
- dev:api: node server/index.mjs
- lint: tsc --noEmit
- preview: vite preview
- start: node server/index.mjs
- validate:recipes: node scripts/validate-preview-recipes.mjs

### Dependances applicatives

- @google/genai ^1.34.0
- lucide-react ^0.462.0
- react ^19.0.0
- react-dom ^19.0.0

### Dependances de developpement

- @types/node ^22.10.2
- @types/react ^19.0.0
- @types/react-dom ^19.0.0
- @vitejs/plugin-react ^6.0.2
- autoprefixer ^10.4.20
- postcss ^8.4.49
- tailwindcss ^3.4.16
- typescript ^5.7.2
- vite ^8.0.16

## Automatisations et comportements internes

- Retry automatique avec delai exponentiel
- Analyse morphologique en JSON strict
- Regles age enfant/bebe sans barbe
- Generation rapide de previews
- Generation des looks selectionnes
- Conservation automatique de l'identite et du contexte dans le prompt
- Generation des angles front/left/right/back
- Messages de chargement et erreurs service sature

## Installation locale

```powershell
npm install
```

## Lancement

```powershell
npm run dev
npm run start
npm run build
```

## Captures d'ecran

![Capture desktop](docs/github-captures/20-morphostyle-2026-06-28_01-34-42-desktop.png)

![Capture mobile](docs/github-captures/20-morphostyle-2026-06-28_01-34-42-mobile.png)

## Variables d'environnement

Copier `.env.example` vers `.env` en local puis remplir les valeurs privees.

## Securite

Ne jamais publier `.env`, tokens, sessions, logs sensibles, cles privees ou donnees personnelles.
