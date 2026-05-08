# Standard MCP Skill Template

Copy this file to `catalog/skills/<skill_name>.md`, then fill in every placeholder. This template is skipped by the MCP catalog loader.

```markdown
---
name: <category>__<skill_name>
category: <category>
module: <module-name>@<version>
sha256: <module-sha256>
description: <one sentence description returned to MCP clients>
when: <event-or-intent>, <event-or-intent>
args:
  path: /workspace
  language: auto
  rules: <ruleset-or-query>
  severity: medium+
  focus: <short-purpose-token>
caps:
  - fs:read
export: <module-export>
---

# <Skill Title>

Describe the local scan or context-gathering task in one or two sentences.
Mention what the agent should do with the returned findings, but do not imply that the MCP server runs code or reads workspace bytes.
```

## Required Fields

| Field | Meaning |
|---|---|
| `name` | Tool name exposed by MCP. Use `category__snake_case_name`. |
| `category` | Skill family such as `analysis`, `context`, `secrets`, `cis`, or `review`. |
| `module` | Local module reference as `name@version`. |
| `sha256` | Pinned module hash from `modules/index.json`. |
| `description` | Tool description used by MCP clients. |
| `when` | Comma-separated triggers or user intents. |
| `args` | Structured arguments marshalled into the module export. |
| `caps` | Capability set requested for the invocation. |
| `export` | Module export to call, such as `scan`, `grep`, or `parse_ast`. |

## Examples

Semgrep security scan:

```yaml
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
args:
  language: auto
  rules: p/security-audit
  severity: high+
caps:
  - fs:read
export: scan
```

Tree-sitter context collection:

```yaml
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
args:
  language: auto
  output: call-graph
  focus: cross-file-context
caps:
  - fs:read
export: parse_ast
```

Ripgrep discovery:

```yaml
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
args:
  query: <search-term>
  maxMatches: 1000
caps:
  - fs:read
export: grep
```
