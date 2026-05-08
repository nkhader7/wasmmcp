# Checkov All Resource Scans IaC Skill

`iac__checkov_all_resource_scans` exposes a standard MCP skill for broad IaC policy review.

Rule reference: `checkov/all-resource-scans`.

The plugin rule engine embeds the full Checkov all-resource-scans policy set with 7,972 rows across `CKV_*` and `CKV2_*` IDs.

## Dispatch Model

- MCP tool name: `iac__checkov_all_resource_scans`
- Local module: `ripgrep@14`
- Pinned module hash: `2726000000000000000000000000000000000000000000000000000000000a14`
- Export: `grep`
- Capability: `fs:read`
- Rules: `checkov/all-resource-scans`

The skill returns only a local invocation request. The IDE plugin reads workspace bytes through the granted capability and streams evidence back to the agent. The MCP server does not receive workspace bytes and does not execute Checkov.

## Rule Logic

The rule logic is code-backed. The scanner loads `checkov/all-resource-scans` by rule-set name, matches IaC entities and Checkov IDs in workspace files, and returns candidate findings with policy metadata from the embedded rule definitions.

## Finding Shape

When summarizing results, the agent should prefer this structure:

```json
{
  "rule": "CKV_*",
  "policy": "Human-readable Checkov policy",
  "iac": "Terraform | Kubernetes | CloudFormation | ARM | Bicep | Ansible | Dockerfile | Helm | Serverless",
  "path": "/workspace/path/to/file",
  "line": 1,
  "redactedSnippet": "local evidence",
  "resourceLink": "catalog resource link",
  "confidence": "candidate | confirmed"
}
```

Use `candidate` when the evidence was mapped heuristically by the agent from ripgrep output rather than confirmed by a dedicated Checkov-compatible WASM scanner.
