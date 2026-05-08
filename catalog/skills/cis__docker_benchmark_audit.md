---
name: cis__docker_benchmark_audit
category: cis
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Collects CIS Docker Benchmark audit outputs and related Docker configuration evidence from the workspace. Runtime checks are produced by scripts/cis/docker-cis-audit.sh outside the MCP server on an authorized Docker host.
when: cis-benchmark, cis-docker, docker-audit, audit, scheduled-scan
args:
  path: /workspace
  query: "CIS Docker Benchmark"
  maxMatches: 3000
  focus: cis-docker-runtime-audit-results-and-docker-config-review
caps:
  - fs:read
export: grep
---

# CIS Docker Benchmark Audit

Collects local Docker CIS audit outputs from `/workspace/audit-results/cis-docker` and Docker configuration evidence for agent review. Run `scripts/cis/docker-cis-audit.sh` on a Docker host first when runtime findings are needed.
