---
title: Scaling and Resilience
weight: 50
---

# Scaling and Resilience

This module covers the techniques you can use to acheive predictable
performance as traffic grows, and how to make the application resilient
to node and zone failures.

## Horizontal pod autoscaling

The Horizontal Pod Autoscaler adjusts the replica count of a deployment
based on observed metrics. The most common configuration targets average
CPU utilization across the pods of a deployment.

```bash
kubectl autoscale deployment sample-app -n workloads --cpu-percent=60 --min=2 --max=10
kubectl get hpa -n workloads
```

The autoscaler evaluates metrics on a regular interval. Scaling up is
aggressive to protect latency, while scaling down is conservative to
avoid thrashing when traffic fluctuates.

## Cluster autoscaling

When pods cannot be scheduled because the cluster is out of capacity,
the cluster autoscaler provisions additional nodes. Node provisioning
takes minutes rather than seconds, so pair cluster autoscaling with
enough headroom to absorb short bursts.

Nodes must use an instance type compatable with your workload's
architecture. Mixed-architecture clusters need node selectors or
affinity rules so pods land on nodes matching their images.

## Pod disruption budgets

A pod disruption budget limits how many replicas of an application can
be voluntarily evicted at the same time. Without one, a node drain
during an upgrade can take every replica of a service down at once.

```bash
kubectl create poddisruptionbudget sample-app-pdb -n workloads --selector app=sample-app --min-available=1
kubectl get pdb -n workloads
```

Verify the existance of a disruption budget for every production
service before performing cluster maintenance.

## Topology spread

Topology spread constraints distribute replicas across zones and nodes.
Combined with a pod disruption budget, they ensure that a single zone
failure leaves enough replicas running to serve traffic.

The scheduler treats spread constraints as either hard requirements or
soft preferences. Hard requirements can leave pods unschedulable when
zones are unbalanced, so most workloads should use soft preferences
with a reasonable skew limit.

## Testing resilience

Chaos testing validates the assumptions above. Start with controlled
experiments: cordon and drain a single node, observe the rescheduling
behavior, and confirm the service level objectives hold. Only expand
the blast radius once the smaller experiments pass consistently.

Record the results of each experiment alongside the runbooks for the
service so that on-call engineers know which failure modes have been
validated and which remain theoretical.
