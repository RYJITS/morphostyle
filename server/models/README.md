# Modèle local de détourage des portraits

`modnet-fp32.onnx` est utilisé uniquement côté serveur par `server/portrait-background.mjs`. Il produit un masque alpha ; les couleurs du portrait viennent du résultat déjà généré. Le remplacement du décor par le gris `#D4D4D4` n'appelle aucun service de génération et ne consomme aucun crédit image supplémentaire.

- Source : [Xenova/modnet](https://huggingface.co/Xenova/modnet).
- Révision figée : `fa2fa546052fba4c08921230a26cc69a333fca12`.
- Fichier source : `onnx/model.onnx`, Float32, 25 888 640 octets.
- SHA-256 : `07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9`.
- Licence déclarée : Apache-2.0, également appliquée aux modèles dans le [dépôt des auteurs](https://github.com/ZHKKKe/MODNet#license). La [licence complète](./LICENSE-MODNET.txt) et la [notice d'attribution](./NOTICE-MODNET.md) accompagnent le modèle et doivent rester dans toute archive qui le redistribue.
- [Configuration du préprocesseur](https://huggingface.co/Xenova/modnet/blob/fa2fa546052fba4c08921230a26cc69a333fca12/preprocessor_config.json) : RGB, normalisation `(v / 255 - 0.5) / 0.5`, petit côté 512, dimensions divisibles par 32. L'intégration borne le grand côté à 1024 pour limiter les coûts de calcul.

Exécuter `node scripts/prepare-portrait-matting.mjs` pendant la préparation du déploiement/build. Le script vérifie le fichier existant ou télécharge la révision ci-dessus, vérifie taille et SHA-256, puis renomme son temporaire. Un fichier existant invalide doit être archivé avant nouvelle préparation ; il n'est pas écrasé automatiquement. Le runtime ne télécharge jamais de modèle. Ce dossier doit être inclus dans l'archive serveur ; il ne doit pas être copié dans `public` ni servi comme asset web.

Les temporaires propres au téléchargement suivent le motif `*.onnx.*.download` et sont exclus de Git. Le script ne nettoie que le temporaire unique qu'il a lui-même créé.

Le CPU Linux x64/arm64 est pris en charge par [`onnxruntime-node`](https://onnxruntime.ai/docs/get-started/with-javascript/node.html). L'intégration garde une seule session et exécute un lot à la fois avec un thread CPU. Pour éviter de télécharger les bibliothèques CUDA inutiles pendant l'installation CPU, définir `ONNXRUNTIME_NODE_INSTALL=skip`. La mémoire et la durée réelles restent à vérifier dans l'environnement Hostinger.

Le `.npmrc` du projet configure actuellement `onnxruntime-node-install=skip`. npm 11 signale cette clé personnalisée par un avertissement sans faire échouer l'installation. Avant une migration vers npm 12, vérifier sa prise en charge ; la variable d'environnement `ONNXRUNTIME_NODE_INSTALL=skip`, lue directement par l'installateur ONNX Runtime, est la solution explicite à conserver si les clés personnalisées ne sont plus acceptées.

La session du modèle reste allouée jusqu'à l'arrêt du processus afin d'éviter de recharger 25 Mo de poids pour chaque vue. Chaque tenseur d'entrée et de sortie est libéré dans un bloc `finally`. Les buffers des portraits ne sont pas mis en cache. L'allocateur natif ONNX Runtime peut conserver sa mémoire de travail pour les inférences suivantes ; un lot terminé ne signifie donc pas que la mémoire RSS doit revenir immédiatement au niveau initial. Le préflight mémorise aussi un échec de chargement jusqu'au redémarrage, d'où la préparation du modèle avant le démarrage serveur.

`PORTRAIT_BACKGROUND_MODE=original` désactive le traitement et la préparation du modèle. Par défaut, le fond gris est tenté. Si le runtime manque, si un masque est dégénéré ou si une vue échoue, le lot entier conserve ses buffers d'origine, sans nouvelle génération. Le préflight renvoie son état de disponibilité. Les avertissements serveur ne contiennent ni photo ni erreur de décodeur susceptible d'exposer un chemin ou des données personnelles.

Les pixels dont le masque vaut 255 restent strictement identiques avant la compression finale des assets. Les contours utilisent une alpha douce. Les cheveux fins, halos et vues de dos demandent une validation visuelle ; le masque ne garantit pas un détourage parfait. Les anciennes fiches ne sont pas retraitées par ce module.
