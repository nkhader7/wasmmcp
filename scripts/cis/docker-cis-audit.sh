#!/usr/bin/env bash
set -u

OUT_DIR="${1:-audit-results/cis-docker}"
mkdir -p "$OUT_DIR"

JSONL="$OUT_DIR/cis-docker-results.jsonl"
MD="$OUT_DIR/cis-docker-summary.md"
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
  printf '{"benchmark":"CIS Docker Benchmark v1.8.0","id":"%s","title":"%s","status":"%s","severity":"%s","evidence":"%s","remediation":"%s"}\n' \
    "$(json_escape "$id")" "$(json_escape "$title")" "$(json_escape "$status")" "$(json_escape "$severity")" "$(json_escape "$evidence")" "$(json_escape "$remediation")" >> "$JSONL"
}

report_list() {
  id="$1"
  title="$2"
  offenders="$3"
  severity="$4"
  remediation="$5"
  if [ -z "$(printf '%s' "$offenders" | tr -d '[:space:]')" ]; then
    emit "$id" "$title" "PASS" "$severity" "No offenders found" "$remediation"
  else
    emit "$id" "$title" "FAIL" "$severity" "Offenders:$offenders" "$remediation"
  fi
}

docker_value() {
  docker info --format "$1" 2>/dev/null || true
}

docker_inspect() {
  docker inspect --format "$2" "$1" 2>/dev/null || true
}

write_markdown() {
  {
    echo "# CIS Docker Benchmark Audit"
    echo
    echo "Benchmark: CIS Docker Benchmark v1.8.0"
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

check_daemon_config_file() {
  file="/etc/docker/daemon.json"
  if [ ! -e "$file" ]; then
    emit "docker-daemon-config" "Docker daemon config file exists" "WARN" "medium" "$file not found" "Create $file and manage daemon security settings explicitly."
    return
  fi

  owner="$(stat -c '%U:%G' "$file" 2>/dev/null || stat -f '%Su:%Sg' "$file" 2>/dev/null || echo unknown)"
  mode="$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || echo unknown)"
  if [ "$owner" = "root:root" ] && [ "$mode" -le 644 ] 2>/dev/null; then
    emit "docker-daemon-config" "Docker daemon config ownership and mode" "PASS" "medium" "$file owner=$owner mode=$mode" "Keep daemon config root-owned and no more permissive than 0644."
  else
    emit "docker-daemon-config" "Docker daemon config ownership and mode" "FAIL" "high" "$file owner=$owner mode=$mode" "Set owner root:root and permissions 0644 or stricter."
  fi
}

check_daemon_settings() {
  debug="$(docker_value '{{.Debug}}')"
  live_restore="$(docker_value '{{.LiveRestoreEnabled}}')"
  swarm="$(docker_value '{{.Swarm.LocalNodeState}}')"

  [ "$debug" = "false" ] \
    && emit "docker-daemon-debug" "Docker daemon debug mode disabled" "PASS" "medium" "debug=$debug" "Keep debug mode disabled." \
    || emit "docker-daemon-debug" "Docker daemon debug mode disabled" "FAIL" "medium" "debug=${debug:-unknown}" "Set debug=false in daemon configuration."

  [ "$live_restore" = "true" ] \
    && emit "docker-live-restore" "Docker live-restore enabled" "PASS" "low" "liveRestore=$live_restore" "Keep live-restore enabled where operationally supported." \
    || emit "docker-live-restore" "Docker live-restore enabled" "WARN" "low" "liveRestore=${live_restore:-unknown}" "Set live-restore=true where compatible with your operations."

  [ "$swarm" = "inactive" ] \
    && emit "docker-swarm-mode" "Docker Swarm disabled when unused" "PASS" "medium" "swarm=$swarm" "Keep Swarm disabled unless required." \
    || emit "docker-swarm-mode" "Docker Swarm disabled when unused" "WARN" "medium" "swarm=${swarm:-unknown}" "Disable Swarm or harden Swarm controls if it is required."
}

check_default_bridge() {
  icc="$(docker network inspect bridge --format '{{index .Options "com.docker.network.bridge.enable_icc"}}' 2>/dev/null || true)"
  if [ "$icc" = "false" ]; then
    emit "docker-bridge-icc" "Default bridge inter-container communication disabled" "PASS" "medium" "enable_icc=$icc" "Keep inter-container communication disabled on the default bridge."
  else
    emit "docker-bridge-icc" "Default bridge inter-container communication disabled" "WARN" "medium" "enable_icc=${icc:-unset}" "Set icc=false or avoid default bridge networking for sensitive workloads."
  fi
}

check_containers() {
  containers="$(docker ps -q 2>/dev/null || true)"
  if [ -z "$containers" ]; then
    emit "docker-containers-running" "Running containers inspected" "PASS" "info" "No running containers found" "No runtime container findings to inspect."
    return
  fi

  privileged=""
  host_network=""
  host_pid=""
  host_ipc=""
  docker_socket=""
  root_user=""
  writable_rootfs=""
  dangerous_caps=""
  missing_no_new_privs=""
  unbounded_logs=""

  for c in $containers; do
    name="$(docker_inspect "$c" '{{.Name}}' | sed 's#^/##')"
    [ "$(docker_inspect "$c" '{{.HostConfig.Privileged}}')" = "true" ] && privileged="$privileged $name"
    [ "$(docker_inspect "$c" '{{.HostConfig.NetworkMode}}')" = "host" ] && host_network="$host_network $name"
    [ "$(docker_inspect "$c" '{{.HostConfig.PidMode}}')" = "host" ] && host_pid="$host_pid $name"
    [ "$(docker_inspect "$c" '{{.HostConfig.IpcMode}}')" = "host" ] && host_ipc="$host_ipc $name"
    mounts="$(docker_inspect "$c" '{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}')"
    printf '%s' "$mounts" | grep -q '/var/run/docker.sock' && docker_socket="$docker_socket $name"
    user="$(docker_inspect "$c" '{{.Config.User}}')"
    { [ -z "$user" ] || [ "$user" = "0" ] || [ "$user" = "root" ]; } && root_user="$root_user $name"
    [ "$(docker_inspect "$c" '{{.HostConfig.ReadonlyRootfs}}')" != "true" ] && writable_rootfs="$writable_rootfs $name"
    caps="$(docker_inspect "$c" '{{range .HostConfig.CapAdd}}{{.}} {{end}}')"
    printf '%s' "$caps" | grep -Eq 'SYS_ADMIN|NET_ADMIN|SYS_MODULE|SYS_PTRACE|DAC_READ_SEARCH' && dangerous_caps="$dangerous_caps $name:$caps"
    secopts="$(docker_inspect "$c" '{{range .HostConfig.SecurityOpt}}{{.}} {{end}}')"
    printf '%s' "$secopts" | grep -q 'no-new-privileges' || missing_no_new_privs="$missing_no_new_privs $name"
    log_max="$(docker_inspect "$c" '{{index .HostConfig.LogConfig.Config "max-size"}}')"
    [ -z "$log_max" ] && unbounded_logs="$unbounded_logs $name"
  done

  report_list "docker-container-privileged" "No running containers are privileged" "$privileged" "critical" "Run containers without --privileged."
  report_list "docker-container-host-network" "No running containers use host network" "$host_network" "high" "Avoid --network host unless explicitly justified."
  report_list "docker-container-host-pid" "No running containers use host PID namespace" "$host_pid" "high" "Avoid --pid host."
  report_list "docker-container-host-ipc" "No running containers use host IPC namespace" "$host_ipc" "high" "Avoid --ipc host."
  report_list "docker-container-socket" "Docker socket is not mounted into containers" "$docker_socket" "critical" "Do not mount /var/run/docker.sock into application containers."
  report_list "docker-container-non-root" "Containers run as non-root users" "$root_user" "high" "Set USER in images or --user at runtime."
  report_list "docker-container-readonly-rootfs" "Containers use read-only root filesystems" "$writable_rootfs" "medium" "Run with --read-only and explicit writable volumes."
  report_list "docker-container-dangerous-caps" "Containers do not add dangerous Linux capabilities" "$dangerous_caps" "high" "Drop capabilities and avoid adding privileged capabilities."
  report_list "docker-container-no-new-privileges" "Containers set no-new-privileges" "$missing_no_new_privs" "medium" "Run with --security-opt no-new-privileges."
  report_list "docker-container-log-rotation" "Containers define log max-size" "$unbounded_logs" "low" "Set log-driver options such as max-size and max-file."
}

check_images() {
  latest="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep ':latest$' | tr '\n' ' ' || true)"
  report_list "docker-images-no-latest" "Images avoid the latest tag" "$latest" "medium" "Pin immutable image tags or digests."
}

if ! command -v docker >/dev/null 2>&1; then
  emit "docker-cli" "Docker CLI available" "ERROR" "critical" "docker command not found" "Run this audit on a Docker host or install the Docker CLI."
elif ! docker info >/dev/null 2>&1; then
  emit "docker-daemon" "Docker daemon reachable" "ERROR" "critical" "docker info failed" "Run as a user authorized to inspect Docker or point DOCKER_HOST at the target."
else
  emit "docker-daemon" "Docker daemon reachable" "PASS" "info" "$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)" "Continue collecting daemon and container checks."
  check_daemon_config_file
  check_daemon_settings
  check_default_bridge
  check_containers
  check_images
fi

write_markdown
echo "Wrote $JSONL"
echo "Wrote $MD"
