---
title: Debugging Workloads
weight: 40
---

# Debugging Workloads

This module shows you how to diagnoze failing pods. First retreive the
list of pods for the service component:

```bash
kubectl get po --selector app.kubernetes.io/component=service -n orders -o json | jq -r '.items[0].metadata.name'
kubectl describe pod $POD_NAME -n orders
```

If the pod is stuck in a pending state, inspect the scheduling events.
The most common cause is an unsatisfiable resource request like this one:

```yaml
resources:
  requests:
    cpu: "16"
    memory: 64Gi
```

Reduce the request to fit the available node capacity and reapply the
manifest.
