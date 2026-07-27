---
title: Deployment Guide
weight: 10
---

# Deployment Guide

This guide shows you how to deploy the sample application to your
cluster. The deployment uses declarative manifests so the process is
repeatable across environments.

Run the following commands to deploy:

```bash
kubectl apply -f manifests/
# Wait for the rollout to finish before continuing
kubectl rollout status deployment/sample-app -n workloads
```

When the rollout completes, the application is available inside the
cluster and you can continue to the next module.
