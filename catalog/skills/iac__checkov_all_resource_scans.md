---
name: iac__checkov_all_resource_scans
category: iac
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Collects IaC evidence for the Checkov all-resource-scans rule set across Terraform, Kubernetes, CloudFormation, ARM/Bicep, Ansible, Dockerfile, Helm, and serverless configurations.
when: audit, iac-scan, checkov-audit, open-pr, branch-push, scheduled-scan
args:
  path: /workspace
  rules: checkov/all-resource-scans
  query: "CKV_|resource |provider |module |apiVersion:|kind:|AWSTemplateFormatVersion|FROM |hosts:|tasks:|serverless|Chart.yaml|values.yaml"
  ruleIds: CKV_*, CKV2_*
  iacTypes: Terraform, Kubernetes, CloudFormation, ARM, Bicep, Ansible, Dockerfile, Helm, Serverless
  ruleCount: 7972
  maxMatches: 20000
  focus: iac-checkov-all-resource-scans
caps:
  - fs:read
export: grep
---

# Checkov All Resource Scans IaC Audit

Collects IaC evidence for the `checkov/all-resource-scans` rule set. The skill covers Checkov `CKV_*` and `CKV2_*` policy IDs across Terraform, Kubernetes, CloudFormation, ARM/Bicep, Ansible, Dockerfile, Helm, and serverless configurations.

## Rule Coverage

The plugin rule engine embeds the full all-resource-scans metadata for 7,972 Checkov policy rows. Each rule is represented in code with `Id`, `Type`, `Entity`, `Policy`, `IaC`, and `Resource Link` fields; the skill only names the rule set as `checkov/all-resource-scans`.

## Agent Guidance

Group findings by IaC type and Checkov ID. Include `path`, `line`, `rule`, `policy`, `resourceLink`, and `redactedSnippet`, and mark heuristic matches as candidates when the local module did not execute a dedicated Checkov engine.

This skill does not run Checkov, Python, Docker, Kubernetes commands, shell scripts, or remote fetches. It dispatches a read-only local `ripgrep@14` invocation through the IDE WASM plugin, and the MCP server returns only the module reference, pinned hash, args, and `fs:read` capability.
