---
title: Scaling the Application
weight: 40
---

# Scaling the Application

In this module you scale the sample application to handle more
traffic. Start by listing the nodes in your cluster to see the
capacity available:

```bash
kubectl get nodes
```

Each worker node reports its allocatable CPU and memory. The scheduler
places new replicas on any worker node with sufficient free capacity.

Scale the deployment to four replicas:

```bash
kubectl scale deployment/sample-app -n workloads --replicas=4
```

Watch the new replicas start. If some remain pending, your cluster
does not have enough free capacity and you should revisit the resource
requests from the previous module.
