---
title: Opérations
weight: 70
tmdTranslationSourceHash: 0000000000000000000000000000stale
---

# Opérations

Ce court module présente une seule pratique : consulter les événements
du cluster.

```bash
kubectl get events -n workloads --sort-by=.lastTimestamp
```

Lisez d'abord les événements les plus récents.
