import assert from "node:assert/strict";
import test from "node:test";
import { parseSkill } from "../src/mcp/catalog.js";

test("skill frontmatter resolves module ref and invocation metadata", () => {
  const skill = parseSkill(
    "scan_secrets.md",
    `---
module: gitleaks@8.21
sha256: abc
when: pre-commit, audit
args:
  redact: true
caps:
  - fs:read
export: scan_repo
---
# Scan Secrets
`
  );

  assert.equal(skill.name, "scan_secrets");
  assert.equal(skill.module, "gitleaks");
  assert.equal(skill.version, "8.21");
  assert.deepEqual(skill.when, ["pre-commit", "audit"]);
  assert.deepEqual(skill.args, { redact: true });
  assert.deepEqual(skill.caps, ["fs:read"]);
});
