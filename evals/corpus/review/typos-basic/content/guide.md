---
title: Getting Started Guide
weight: 10
---

# Getting Started Guide

This guide walks you through deploying the sample application. When you
complete each step you will recieve a confirmation message in the console.

It is important to keep your configuration files in a seperate directory
from your application code so that deployments remain reproducible.

## Deploy the application

Run the following commands to deploy:

```bash
kubectl apply -f manifests/
kubectl rollout status deployment/sample-app -n workloads
```

Once the rollout completes, the application is available inside the cluster.
