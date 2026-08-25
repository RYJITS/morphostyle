# Changelog - morphostyle

## Evolutions documentees

- Ajout d'un point d'entree `AGENTS.md` et d'une memoire projet Markdown
- Ajout d'un cahier multi-utilisateur Hostinger
- Ajout d'une phase 1 serveur: session invite, quota lisible et historique personnel du jour
- Les generations OpenAI personnelles creent maintenant une fiche historique serveur en plus du cache navigateur
- Le frontend fusionne l'historique local et l'historique serveur au chargement
- Optimisation des prompts pour une meilleure conservation de l'identité et du contexte dans les aperçus générés
- Ajout de la gestion automatique des retries avec délai exponentiel en cas de saturation du service d'IA
- Validation stricte des âges pour exclure les suggestions inappropriées (ex : barbe pour enfants)
- Amélioration de la robustesse des schémas JSON pour l'analyse morphologique
- Ajout du mode OpenAI Image avec quota d'un essai complet par jour
- Passage du parcours photo personnelle a deux planches: recommandations puis resultat final
