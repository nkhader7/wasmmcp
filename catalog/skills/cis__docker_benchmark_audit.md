---
name: cis__docker_benchmark_audit
category: cis
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Collects Docker configuration evidence for CIS Docker Benchmark rule families covering host configuration, daemon settings, container runtime controls, images, logging, and audit policy.
when: cis-benchmark, cis-docker, docker-audit, audit, scheduled-scan
args:
  path: /workspace
  rules: cis/docker-benchmark
  query: "dockerd|daemon.json|Dockerfile|docker-compose|privileged|userns-remap|no-new-privileges|live-restore|icc|authorization-plugin|log-driver|seccomp|apparmor|SELinux"
  maxMatches: 3000
  focus: cis-docker-benchmark-rules
caps:
  - fs:read
export: grep
---

# CIS Docker Benchmark Audit

Collects Docker evidence for CIS Docker Benchmark rule families. Coverage includes Docker host hardening, daemon configuration, container runtime restrictions, image and build controls, logging, audit policy, and secure defaults.

Report findings with the CIS rule or section, severity, affected Docker control, `path`, `line`, and `redactedSnippet`. Do not describe the MCP server as running Docker checks; it only dispatches the local module reference and capability set.
