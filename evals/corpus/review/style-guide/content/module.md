---
title: Deploying to the Cluster
weight: 30
---

# Deploying to the Cluster

This module shows you how to deploy the sample application to your k8s
cluster. Some resources (e.g. namespaces and quotas) were created for
you during environment setup.

Open the console and click on the Deployments tab to watch the rollout
progress while you run the commands below.

```bash
kubectl apply -f manifests/
kubectl rollout status deployment/sample-app -n workloads
```

When the rollout completes, the application is ready for the next
module.
