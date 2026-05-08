---
name: cis__kubernetes_benchmark_audit
category: cis
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Collects CIS Kubernetes Benchmark audit outputs and related Kubernetes manifest evidence from the workspace. Runtime checks are produced by scripts/cis/kubernetes-cis-audit.sh outside the MCP server on a control-plane node or read-only kubectl context.
when: cis-benchmark, cis-kubernetes, kubernetes-audit, k8s-audit, audit, scheduled-scan
args:
  path: /workspace
  query: "CIS Kubernetes Benchmark"
  maxMatches: 3000
  focus: cis-kubernetes-runtime-audit-results-and-manifest-review
caps:
  - fs:read
export: grep
---

# CIS Kubernetes Benchmark Audit

Collects local Kubernetes CIS audit outputs from `/workspace/audit-results/cis-kubernetes`, static pod manifests, kubelet configuration, and policy evidence for agent review. Run `scripts/cis/kubernetes-cis-audit.sh` in the Kubernetes environment first when runtime findings are needed.
