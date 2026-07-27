---
title: Guide de déploiement
weight: 10
tmdTranslationSourceHash: 0000000000000000000000000000stale
---

# Guide de déploiement

Ce guide vous montre comment déployer l'application d'exemple sur votre
cluster. Le déploiement utilise des manifestes déclaratifs afin que le
processus soit reproductible dans tous les environnements.

Exécutez les commandes suivantes pour déployer :

```bash
kubectl apply -f manifests/
# Attendez la fin du déploiement avant de continuer
kubectl rollout status deployment/sample-app -n workloads
```

Une fois le déploiement terminé, l'application est disponible dans le
cluster et vous pouvez passer au module suivant.
