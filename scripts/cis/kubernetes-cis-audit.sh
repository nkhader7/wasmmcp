#!/usr/bin/env bash
set -u

OUT_DIR="${1:-audit-results/cis-kubernetes}"
MANIFEST_DIR="${KUBE_MANIFEST_DIR:-/etc/kubernetes/manifests}"
KUBELET_CONFIG="${KUBELET_CONFIG:-/var/lib/kubelet/config.yaml}"
mkdir -p "$OUT_DIR"

JSONL="$OUT_DIR/cis-kubernetes-results.jsonl"
MD="$OUT_DIR/cis-kubernetes-summary.md"
: > "$JSONL"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
}

emit() {
  id="$1"
  title="$2"
  status="$3"
  severity="$4"
  evidence="$5"
  remediation="$6"
  printf '{"benchmark":"CIS Kubernetes Benchmark v2.0.1","id":"%s","title":"%s","status":"%s","severity":"%s","evidence":"%s","remediation":"%s"}\n' \
    "$(json_escape "$id")" "$(json_escape "$title")" "$(json_escape "$status")" "$(json_escape "$severity")" "$(json_escape "$evidence")" "$(json_escape "$remediation")" >> "$JSONL"
}

write_markdown() {
  {
    echo "# CIS Kubernetes Benchmark Audit"
    echo
    echo "Benchmark: CIS Kubernetes Benchmark v2.0.1"
    echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo
    echo "| Control | Status | Severity | Evidence |"
    echo "|---|---|---|---|"
  } > "$MD"

  while IFS= read -r line; do
    id="$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
    title="$(printf '%s' "$line" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p')"
    status="$(printf '%s' "$line" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
    severity="$(printf '%s' "$line" | sed -n 's/.*"severity":"\([^"]*\)".*/\1/p')"
    evidence="$(printf '%s' "$line" | sed -n 's/.*"evidence":"\([^"]*\)".*/\1/p')"
    printf '| `%s` %s | %s | %s | %s |\n' "$id" "$title" "$status" "$severity" "$evidence" >> "$MD"
  done < "$JSONL"
}

check_manifest_flag() {
  id="$1"
  title="$2"
  file="$3"
  pass_pattern="$4"
  severity="$5"
  remediation="$6"
  if [ ! -f "$file" ]; then
    emit "$id" "$title" "MANUAL" "$severity" "$file not found" "Mount or run on a control-plane node with access to static pod manifests."
  elif grep -Eq -- "$pass_pattern" "$file"; then
    emit "$id" "$title" "PASS" "$severity" "$file contains expected setting" "$remediation"
  else
    emit "$id" "$title" "FAIL" "$severity" "$file missing expected setting" "$remediation"
  fi
}

report_items() {
  id="$1"
  title="$2"
  items="$3"
  severity="$4"
  remediation="$5"
  if [ -z "$(printf '%s' "$items" | tr -d '[:space:]')" ]; then
    emit "$id" "$title" "PASS" "$severity" "No offenders found" "$remediation"
  else
    emit "$id" "$title" "FAIL" "$severity" "$(printf '%s' "$items" | tr '\n' ' ')" "$remediation"
  fi
}

check_control_plane_manifests() {
  api="$MANIFEST_DIR/kube-apiserver.yaml"
  cm="$MANIFEST_DIR/kube-controller-manager.yaml"
  scheduler="$MANIFEST_DIR/kube-scheduler.yaml"

  check_manifest_flag "k8s-apiserver-anonymous-auth" "API server anonymous auth disabled" "$api" "--anonymous-auth=false" "high" "Set --anonymous-auth=false."
  check_manifest_flag "k8s-apiserver-authorization-mode" "API server authorization mode includes Node/RBAC" "$api" "--authorization-mode=.*(Node|RBAC)" "critical" "Use Node and RBAC authorization modes."
  check_manifest_flag "k8s-apiserver-node-restriction" "NodeRestriction admission plugin enabled" "$api" "--enable-admission-plugins=.*NodeRestriction" "high" "Enable NodeRestriction admission plugin."
  check_manifest_flag "k8s-apiserver-audit-log" "API server audit log enabled" "$api" "--audit-log-path=" "medium" "Configure --audit-log-path and audit log rotation."
  check_manifest_flag "k8s-apiserver-profiling" "API server profiling disabled" "$api" "--profiling=false" "medium" "Set --profiling=false."
  check_manifest_flag "k8s-apiserver-encryption-provider" "Encryption provider configured" "$api" "--encryption-provider-config=" "high" "Configure envelope encryption for Kubernetes secrets."
  check_manifest_flag "k8s-apiserver-service-account-lookup" "Service account lookup enabled" "$api" "--service-account-lookup=true" "medium" "Set --service-account-lookup=true."

  check_manifest_flag "k8s-controller-service-account-creds" "Controller manager uses service account credentials" "$cm" "--use-service-account-credentials=true" "high" "Set --use-service-account-credentials=true."
  check_manifest_flag "k8s-controller-profiling" "Controller manager profiling disabled" "$cm" "--profiling=false" "medium" "Set --profiling=false."
  check_manifest_flag "k8s-controller-bind-address" "Controller manager binds to loopback" "$cm" "--bind-address=127\\.0\\.0\\.1" "medium" "Bind controller manager metrics to loopback or protect the endpoint."

  check_manifest_flag "k8s-scheduler-profiling" "Scheduler profiling disabled" "$scheduler" "--profiling=false" "medium" "Set --profiling=false."
  check_manifest_flag "k8s-scheduler-bind-address" "Scheduler binds to loopback" "$scheduler" "--bind-address=127\\.0\\.0\\.1" "medium" "Bind scheduler metrics to loopback or protect the endpoint."
}

check_kubelet_config() {
  file="$KUBELET_CONFIG"
  if [ ! -f "$file" ]; then
    emit "k8s-kubelet-config" "Kubelet config file available" "MANUAL" "medium" "$file not found" "Set KUBELET_CONFIG or run on a worker/control-plane node."
    return
  fi

  grep -Eq 'anonymous:[[:space:]]*$' "$file" && grep -Eq 'enabled:[[:space:]]*false' "$file" \
    && emit "k8s-kubelet-anonymous-auth" "Kubelet anonymous auth disabled" "PASS" "high" "$file anonymous.enabled=false" "Keep anonymous auth disabled." \
    || emit "k8s-kubelet-anonymous-auth" "Kubelet anonymous auth disabled" "FAIL" "high" "$file does not clearly disable anonymous auth" "Set authentication.anonymous.enabled=false."

  grep -Eq 'mode:[[:space:]]*Webhook' "$file" \
    && emit "k8s-kubelet-authz-webhook" "Kubelet authorization mode is Webhook" "PASS" "high" "$file mode=Webhook" "Keep authorization.mode=Webhook." \
    || emit "k8s-kubelet-authz-webhook" "Kubelet authorization mode is Webhook" "FAIL" "high" "$file missing mode=Webhook" "Set authorization.mode=Webhook."

  grep -Eq 'readOnlyPort:[[:space:]]*0' "$file" \
    && emit "k8s-kubelet-readonly-port" "Kubelet read-only port disabled" "PASS" "high" "$file readOnlyPort=0" "Keep readOnlyPort disabled." \
    || emit "k8s-kubelet-readonly-port" "Kubelet read-only port disabled" "FAIL" "high" "$file missing readOnlyPort=0" "Set readOnlyPort: 0."

  grep -Eq 'protectKernelDefaults:[[:space:]]*true' "$file" \
    && emit "k8s-kubelet-protect-kernel-defaults" "Kubelet protects kernel defaults" "PASS" "medium" "$file protectKernelDefaults=true" "Keep protectKernelDefaults enabled." \
    || emit "k8s-kubelet-protect-kernel-defaults" "Kubelet protects kernel defaults" "WARN" "medium" "$file missing protectKernelDefaults=true" "Set protectKernelDefaults: true after validating node sysctls."

  grep -Eq 'rotateCertificates:[[:space:]]*true' "$file" \
    && emit "k8s-kubelet-rotate-certs" "Kubelet rotates certificates" "PASS" "medium" "$file rotateCertificates=true" "Keep rotateCertificates enabled." \
    || emit "k8s-kubelet-rotate-certs" "Kubelet rotates certificates" "WARN" "medium" "$file missing rotateCertificates=true" "Set rotateCertificates: true."
}

check_cluster_workloads() {
  if ! command -v kubectl >/dev/null 2>&1; then
    emit "k8s-kubectl" "kubectl available for workload checks" "ERROR" "critical" "kubectl command not found" "Run with kubectl configured for the target cluster."
    return
  fi

  if ! kubectl auth can-i get pods -A >/dev/null 2>&1; then
    emit "k8s-kubectl-auth" "kubectl can read cluster workloads" "ERROR" "critical" "kubectl cannot read pods cluster-wide" "Use a read-only audit service account with cluster-wide view permissions."
    return
  fi

  emit "k8s-kubectl-auth" "kubectl can read cluster workloads" "PASS" "info" "kubectl can read pods" "Continue workload checks."

  privileged="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{range .spec.containers[*]}{.securityContext.privileged}{" "}{end}{"\n"}{end}' 2>/dev/null | awk '$0 ~ /true/ {print $1}')"
  host_network="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{.spec.hostNetwork}{"\n"}{end}' 2>/dev/null | awk '$2=="true"{print $1}')"
  host_pid="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{.spec.hostPID}{"\n"}{end}' 2>/dev/null | awk '$2=="true"{print $1}')"
  host_ipc="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{.spec.hostIPC}{"\n"}{end}' 2>/dev/null | awk '$2=="true"{print $1}')"
  privilege_escalation="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{range .spec.containers[*]}{.securityContext.allowPrivilegeEscalation}{" "}{end}{"\n"}{end}' 2>/dev/null | awk '$0 !~ /false/ {print $1}')"
  automount="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{.spec.automountServiceAccountToken}{"\n"}{end}' 2>/dev/null | awk '$2!="false"{print $1}')"

  report_items "k8s-pods-no-privileged" "Pods do not run privileged containers" "$privileged" "critical" "Set securityContext.privileged=false and enforce with admission policy."
  report_items "k8s-pods-no-host-network" "Pods avoid hostNetwork" "$host_network" "high" "Avoid hostNetwork except for justified system workloads."
  report_items "k8s-pods-no-host-pid" "Pods avoid hostPID" "$host_pid" "high" "Avoid hostPID except for justified system workloads."
  report_items "k8s-pods-no-host-ipc" "Pods avoid hostIPC" "$host_ipc" "high" "Avoid hostIPC except for justified system workloads."
  report_items "k8s-pods-no-privilege-escalation" "Pods disable privilege escalation" "$privilege_escalation" "high" "Set allowPrivilegeEscalation=false by default."
  report_items "k8s-pods-no-default-token" "Pods avoid automatic service account token mounts" "$automount" "medium" "Set automountServiceAccountToken=false unless the workload needs API access."

  cluster_admin_sas="$(kubectl get clusterrolebindings -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.roleRef.name}{" "}{range .subjects[*]}{.kind}:{.namespace}:{.name}{" "}{end}{"\n"}{end}' 2>/dev/null | awk '$2=="cluster-admin" && $0 ~ /ServiceAccount/ {print $0}')"
  report_items "k8s-rbac-cluster-admin-sa" "ServiceAccounts are not bound to cluster-admin" "$cluster_admin_sas" "critical" "Replace cluster-admin bindings with least-privilege ClusterRoles."

  namespaces="$(kubectl get ns -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true)"
  missing_np=""
  for ns in $namespaces; do
    case "$ns" in
      kube-system|kube-public|kube-node-lease) continue ;;
    esac
    count="$(kubectl get networkpolicy -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')"
    [ "$count" = "0" ] && missing_np="$missing_np $ns"
  done
  report_items "k8s-network-policies" "Namespaces define NetworkPolicies" "$missing_np" "medium" "Add default-deny and workload-specific NetworkPolicies."
}

check_control_plane_manifests
check_kubelet_config
check_cluster_workloads
write_markdown

echo "Wrote $JSONL"
echo "Wrote $MD"
