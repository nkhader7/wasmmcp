---
name: cis__kubernetes_benchmark_audit
category: cis
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Collects Kubernetes configuration evidence for CIS Kubernetes Benchmark rule families covering control plane, etcd, kubelet, RBAC, pod security, network policy, and secrets handling.
when: cis-benchmark, cis-kubernetes, kubernetes-audit, k8s-audit, audit, scheduled-scan
args:
  path: /workspace
  rules: cis/kubernetes-benchmark
  query: "kube-apiserver|kube-controller-manager|kube-scheduler|kubelet|etcd|RBAC|RoleBinding|ClusterRoleBinding|NetworkPolicy|PodSecurity|hostNetwork|hostPID|hostIPC|privileged|runAsNonRoot|readOnlyRootFilesystem|automountServiceAccountToken"
  maxMatches: 3000
  focus: cis-kubernetes-benchmark-rules
caps:
  - fs:read
export: grep
---

# CIS Kubernetes Benchmark Audit

Collects Kubernetes evidence for CIS Kubernetes Benchmark rule families. Coverage includes API server, controller manager, scheduler, etcd, kubelet, RBAC, pod security, network policy, admission controls, and secrets handling.

Report findings with the CIS rule or section, severity, affected Kubernetes control, `path`, `line`, and `redactedSnippet`. Do not describe the MCP server as running Kubernetes checks; it only dispatches the local module reference and capability set.
