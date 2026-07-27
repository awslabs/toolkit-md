---
title: Core Concepts
weight: 20
---

# Core Concepts

A pod is the smallest deployable unit in Kubernetes. Pods host one or
more containers that share networking and storage. Deployments manage
replica sets of pods and provide declarative rollout and rollback.

Services expose pods behind a stable network identity. A ClusterIP
service is reachable only inside the cluster, while a LoadBalancer
service provisions an external endpoint.

Namespaces partition cluster resources between teams and environments.
Resource quotas and limit ranges apply per namespace, which makes them
the primary isolation boundary for multi-tenant clusters.
