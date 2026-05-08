# CIS Docker and Kubernetes Audit

This project includes MCP skills for CIS-style Docker and Kubernetes review.

The provided spreadsheets were inspected locally:

| Benchmark | Workbook profiles |
|---|---|
| `CIS_Docker_Benchmark_v1.8.0.xlsx` | License, Level 1 Docker Linux, Level 2 Docker Linux, Level 1 Docker Swarm, Combined Profiles |
| `CIS_Kubernetes_Benchmark_v2.0.1.xlsx` | License, Level 1 Master Node, Level 2 Master Node, Level 1 Worker Node, Level 2 Worker Node, Combined Profiles |

The skills below map workspace evidence to benchmark rule families. They do not claim full CIS certification coverage.

## Docker Host Audit

Rule reference: `cis/docker-benchmark`.

Checks include Docker daemon configuration, debug mode, live restore, Swarm state, default bridge ICC, privileged containers, host namespace use, Docker socket mounts, root users, read-only root filesystems, dangerous capabilities, `no-new-privileges`, log rotation, and `latest` image tags.

## Kubernetes Cluster Audit

Rule reference: `cis/kubernetes-benchmark`.

Checks include API server flags, audit logging, encryption provider configuration, controller manager flags, scheduler flags, kubelet authentication and authorization settings, privileged pods, host namespaces, privilege escalation, service account token mounting, cluster-admin bindings to service accounts, and namespace NetworkPolicy coverage.

## MCP Skills

The MCP skills do not run Docker, Kubernetes, or shell commands. They dispatch local module references with rule identifiers:

| Skill | Purpose |
|---|---|
| `cis__docker_benchmark_audit` | Map Docker configuration evidence to `cis/docker-benchmark`. |
| `cis__kubernetes_benchmark_audit` | Map Kubernetes manifest evidence to `cis/kubernetes-benchmark`. |

The combined rule is `cis-benchmark`.

## Boundary

- MCP only dispatches skills and returns module refs.
- The IDE-local plugin reads workspace evidence through `fs:read`.
- No Docker socket, kubeconfig, or cluster credentials are exposed to the MCP server.

## Reference

MITRE `cis-bench` is a CLI for downloading, validating, managing, and exporting CIS benchmark content, including structured benchmark models and JSON/YAML/CSV/Markdown/XCCDF export flows. Its project guidance emphasizes config-driven XCCDF mapping and avoiding hard-coded benchmark transformations; this repo keeps benchmark-derived audit output structured and local.
