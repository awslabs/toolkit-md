---
title: Network Policy Troubleshooting
weight: 60
---

# Network Policy Troubleshooting

When a network policy blocks traffic unexpectedly, inspect the policy
agent logs on the node hosting the affected pod.

```bash
POD_HOSTIP_1=$(kubectl get po --selector app.kubernetes.io/component=service -n orders -o json | jq -r '.items[0].spec.nodeName')
kubectl debug node/$POD_HOSTIP_1 -it --image=ubuntu
# Run these commands inside the pod
grep DENY /host/var/log/aws-routed-eni/network-policy-agent.log | tail -5
```

Each DENY entry records the source and destination of the blocked
connection, which tells you which policy rule needs to be adjusted.
