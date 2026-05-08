# CIS Docker and Kubernetes Audit

This project includes local scripts and MCP skills for CIS-style Docker and Kubernetes review.

The provided spreadsheets were inspected locally:

| Benchmark | Workbook profiles |
|---|---|
| `CIS_Docker_Benchmark_v1.8.0.xlsx` | License, Level 1 Docker Linux, Level 2 Docker Linux, Level 1 Docker Swarm, Combined Profiles |
| `CIS_Kubernetes_Benchmark_v2.0.1.xlsx` | License, Level 1 Master Node, Level 2 Master Node, Level 1 Worker Node, Level 2 Worker Node, Combined Profiles |

The scripts below are practical audit scripts mapped to those benchmark areas. They do not claim full CIS certification coverage.

## Docker Host Audit

Run on a Docker host or a workstation with an authorized Docker CLI context:

```bash
bash scripts/cis/docker-cis-audit.sh audit-results/cis-docker
```

Outputs:

```text
audit-results/cis-docker/cis-docker-results.jsonl
audit-results/cis-docker/cis-docker-summary.md
```

Checks include Docker daemon reachability, daemon config ownership, debug mode, live restore, Swarm state, default bridge ICC, privileged containers, host namespace use, Docker socket mounts, root users, read-only root filesystems, dangerous capabilities, `no-new-privileges`, log rotation, and `latest` image tags.

## Kubernetes Cluster Audit

Run on a control-plane node or from a workstation/pod with read-only `kubectl` access. For static pod and kubelet checks, run on a node or mount the relevant host paths.

```bash
bash scripts/cis/kubernetes-cis-audit.sh audit-results/cis-kubernetes
```

Optional path overrides:

```bash
KUBE_MANIFEST_DIR=/etc/kubernetes/manifests \
KUBELET_CONFIG=/var/lib/kubelet/config.yaml \
bash scripts/cis/kubernetes-cis-audit.sh audit-results/cis-kubernetes
```

Outputs:

```text
audit-results/cis-kubernetes/cis-kubernetes-results.jsonl
audit-results/cis-kubernetes/cis-kubernetes-summary.md
```

Checks include API server flags, audit logging, encryption provider configuration, controller manager flags, scheduler flags, kubelet authentication and authorization settings, privileged pods, host namespaces, privilege escalation, service account token mounting, cluster-admin bindings to service accounts, and namespace NetworkPolicy coverage.

## MCP Skills

The MCP skills do not run Docker, Kubernetes, or shell commands. They expose the local output files and related configuration as read-only workspace artifacts:

| Skill | Purpose |
|---|---|
| `cis__docker_benchmark_audit` | Collect Docker CIS audit output and Docker config evidence. |
| `cis__kubernetes_benchmark_audit` | Collect Kubernetes CIS audit output and manifest evidence. |

The combined rule is `cis-benchmark`.

## Boundary

- Scripts run locally by an operator in the Docker/Kubernetes environment.
- Results are written into the workspace under `audit-results/`.
- MCP only dispatches skills and returns module refs.
- The IDE-local plugin reads the result files through `fs:read`.
- No Docker socket, kubeconfig, or cluster credentials are exposed to the MCP server.

## Reference

MITRE `cis-bench` is a CLI for downloading, validating, managing, and exporting CIS benchmark content, including structured benchmark models and JSON/YAML/CSV/Markdown/XCCDF export flows. Its project guidance emphasizes config-driven XCCDF mapping and avoiding hard-coded benchmark transformations; this repo keeps benchmark-derived audit output structured and local.
