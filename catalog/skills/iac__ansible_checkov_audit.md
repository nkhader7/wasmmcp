---
name: iac__ansible_checkov_audit
category: iac
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Scans Ansible playbooks and roles for IaC misconfigurations — disabled certificate validation, cleartext HTTP, unsigned packages, and missing error-handling blocks — aligned to Checkov CKV_ANSIBLE_1-6 and CKV2_ANSIBLE_1-6.
when: audit, iac-scan, open-pr, branch-push, scheduled-scan
args:
  path: /workspace
  language: yaml
  rules: r/yaml.ansible
  severity: medium+
  focus: iac-ansible-misconfiguration-audit
caps:
  - fs:read
export: scan
---

# Ansible IaC Misconfiguration Audit

Runs `semgrep@1.45` with `r/yaml.ansible` rules against every playbook, role task file, and vars file under `/workspace`. Findings are mapped to the Checkov Ansible policy index and streamed back as structured results the agent can summarize and triage.

## Checks covered

| Checkov ID | Module | What is flagged |
|---|---|---|
| CKV_ANSIBLE_1 | `uri` | `validate_certs: false` — TLS verification disabled |
| CKV_ANSIBLE_2 | `get_url` | `validate_certs: false` — TLS verification disabled |
| CKV_ANSIBLE_3 | `yum` | `validate_certs: false` — TLS verification disabled |
| CKV_ANSIBLE_4 | `yum` | `sslverify: false` / `sslverify: 0` — SSL verification disabled |
| CKV_ANSIBLE_5 | `apt` | `allow_unauthenticated: true` — unsigned packages permitted |
| CKV_ANSIBLE_6 | `apt` | `force: yes` — signature validation bypassed, downgrades allowed |
| CKV2_ANSIBLE_1 | `uri` | `url:` does not start with `https://` |
| CKV2_ANSIBLE_2 | `get_url` | `url:` does not start with `https://` |
| CKV2_ANSIBLE_3 | `block` | Missing `rescue:` or `always:` clause — errors not handled |
| CKV2_ANSIBLE_4 | `dnf` | `disable_gpg_check: true` — GPG signature check bypassed |
| CKV2_ANSIBLE_5 | `dnf` | `sslverify: false` — SSL verification disabled |
| CKV2_ANSIBLE_6 | `dnf` | `validate_certs: false` — TLS verification disabled |

## Severity guidance

| Severity | Examples |
|---|---|
| **HIGH** | Any `validate_certs: false`, `sslverify: false`, `disable_gpg_check: true` |
| **MEDIUM** | `allow_unauthenticated`, `force` on apt, missing block error handling |
| **LOW** | HTTP-only URLs without explicit TLS bypass |

## Agent guidance

Each finding includes `path`, `line`, `rule_id` (mapped to the Checkov ID above), and `redactedSnippet`. The agent should group findings by Checkov ID, surface HIGH severity first, and propose a remediation diff for each unique pattern (e.g., replace `validate_certs: false` with `validate_certs: true` or remove the key entirely since `true` is the default).
