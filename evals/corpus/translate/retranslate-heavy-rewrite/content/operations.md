---
title: Day Two Operations
weight: 70
---

# Day Two Operations

Operating an application in production means observing it, responding
to incidents, and applying changes safely. This module introduces the
three practices that matter most in the first months of operation.

## Observe before you act

Cluster events are the fastest way to understand what the scheduler
and controllers are doing:

```bash
kubectl get events -n workloads --sort-by=.lastTimestamp
```

Read the most recent events first. Most operational surprises, from
failed image pulls to unsatisfiable resource requests, appear here
minutes before they show up as user-visible symptoms.

## Change one thing at a time

Apply configuration changes through the same manifests you deployed
from, never with imperative edits. A change that exists only in the
live cluster is invisible to review and impossible to roll back
reliably.

## Rehearse failure

Do not wait for an incident to discover that your runbooks are stale.
Schedule a monthly exercise where the team responds to a simulated
failure using only the documented procedures.
