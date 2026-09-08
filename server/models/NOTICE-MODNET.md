# Attribution du modèle MODNet

Cette notice accompagne `modnet-fp32.onnx` et ne modifie pas sa licence.

MODNet : **Real-Time Trimap-Free Portrait Matting via Objective Decomposition**, AAAI 2022.

Auteurs : Zhanghan Ke, Jiayu Sun, Kaican Li, Qiong Yan et Rynson W. H. Lau.

- [Dépôt original ZHKKKe/MODNet](https://github.com/ZHKKKe/MODNet).
- [Déclaration de licence des auteurs](https://github.com/ZHKKKe/MODNet/blob/28165a451e4610c9d77cfdf925a94610bb2810fb/README.md#license) : les modèles, le code et les démos du dépôt sont publiés sous Apache-2.0 ; les GIF de `doc/gif` sont exclus et ne sont pas inclus dans MorphoStyle.
- [Copie complète de la licence](./LICENSE-MODNET.txt), reproduite sans modification depuis le [fichier LICENSE original](https://github.com/ZHKKKe/MODNet/blob/28165a451e4610c9d77cfdf925a94610bb2810fb/LICENSE).
- Distribution des poids ONNX : [Xenova/modnet sur Hugging Face](https://huggingface.co/Xenova/modnet/tree/fa2fa546052fba4c08921230a26cc69a333fca12). Sa fiche déclare également `apache-2.0`.

Le modèle distribué dans MorphoStyle est le fichier `onnx/model.onnx` de la révision Xenova `fa2fa546052fba4c08921230a26cc69a333fca12`. Il est conservé sans modification des poids, sous le nom local `modnet-fp32.onnx`.

Taille : 25 888 640 octets. SHA-256 : `07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9`.

L'intégration Node.js, le prétraitement Sharp, les contrôles du masque et la composition sur gris sont propres à MorphoStyle. Cette utilisation n'implique aucune approbation du produit par les auteurs de MODNet ou par Xenova. Conserver cette notice et `LICENSE-MODNET.txt` dans toute archive redistribuant les poids.
