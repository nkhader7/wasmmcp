# Skills Catalog

This folder contains MCP skill definitions. Each runnable skill is a markdown file with YAML-like frontmatter that resolves user intent to a local WASM module reference.

The MCP server is only a dispatcher. It reads these files, exposes each runnable skill through `tools/list`, and returns `_meta.invokeLocal` from `tools/call`. Workspace files are still read only by the IDE-local WASM plugin.

## Folder Structure

```text
catalog/skills/
  README.md                  # this guide, not exposed as a tool
  SKILL_TEMPLATE.md          # standard authoring template, not exposed as a tool
  scan_secrets.md            # runnable skill
  scan_diff.md               # runnable skill
  tob_insecure_defaults.md   # runnable skill
```

Runnable skill files should:

- use `snake_case.md` names
- include complete frontmatter
- reference modules as `name@version`
- include the pinned `sha256`
- include `args.path: /workspace`
- request only declared capabilities
- keep workspace paths under `/workspace`

Documentation and templates are skipped by the catalog loader when the file name is `README.md`, `SKILL_TEMPLATE.md`, or begins with `_`.

## Standard Shape

```yaml
---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, open-pr
args:
  language: auto
  rules: p/security-audit
  severity: medium+
  focus: short-purpose-token
caps:
  - fs:read
export: scan
---

# Skill Title

Short human-readable description of what the local module should do.
```

## Module Choices

Use only modules already present in `modules/index.json`.

| Module | Common Exports | Typical Use |
|---|---|---|
| `gitleaks@8.21` | `scan_repo`, `scan_diff` | secret scanning |
| `gitleaks@8.30` | `scan_repo`, `scan_diff` | newer secret scanning recipes |
| `semgrep@1.45` | `scan`, `find_dead_code` | static security scans |
| `ripgrep@14` | `grep` | text and manifest discovery |
| `tree-sitter@0.22` | `parse_ast` | symbol, call graph, and evidence context |

## Capability Rules

All current skills should use:

```yaml
caps:
  - fs:read
```

Do not add network, write, shell, or ambient environment access in a skill file. A new capability must be added to the module manifest and enforced by the plugin capability broker first.

## Validation

Run the standard structure check after adding or editing skills:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/validate-skills.ps1
```

The validator checks required frontmatter fields, `args.path: /workspace`, `fs:read`, H1 titles, and module hash consistency with `modules/index.json`.

## Converted Skill Packs

The `tob_*` files adapt the public Trail of Bits skills marketplace into local MCP dispatcher recipes. They are original mappings to this project's local module registry, not copies of the upstream skill bodies. See [../../docs/trailofbits-skill-map.md](../../docs/trailofbits-skill-map.md) for the coverage map and scoped-down capabilities.

The `pytm_threat_model` skill gathers local context for an agent-generated OWASP pytm model. See [../../docs/pytm-threat-model-workflow.md](../../docs/pytm-threat-model-workflow.md).
