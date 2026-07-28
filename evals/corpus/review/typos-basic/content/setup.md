---
title: Environment Setup
weight: 20
---

# Environment Setup

Before starting, install teh required tools on your workstation. If an
error occured during installation, check the troubleshooting section at
the end of this page.

## Required tools

- kubectl version 1.29 or later
- helm version 3.14 or later
- jq for parsing command output

## Troubleshooting

Most installation failures are caused by missing permissions on the
package directories. Verify you can write to the installation prefix
before retrying.
