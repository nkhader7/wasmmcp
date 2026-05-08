import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadRules, loadSkills } from "../src/mcp/catalog.js";
import { SkillDispatcher } from "../src/mcp/dispatcher.js";
import { PluginDispatcher } from "../src/plugin/dispatcher.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureWorkspace = path.join(root, "test/fixtures/gitleaks-workspace");

test("scan_secrets resolves gitleaks locally and reports redacted findings", async () => {
  const mcpDispatcher = new SkillDispatcher({
    skills: await loadSkills(path.join(root, "catalog/skills")),
    rules: await loadRules(path.join(root, "catalog/rules"))
  });
  const plugin = await PluginDispatcher.create({ rootDir: root, workspaceRoot: fixtureWorkspace });

  const resolved = mcpDispatcher.resolveToolCall("scan_secrets", { path: "/workspace" });
  const result = await plugin.invokeLocal(resolved._meta.invokeLocal);

  assert.equal(resolved._meta.invokeLocal.module, "gitleaks@8.21");
  assert.equal(result.summary, "2 potential secret finding(s)");
  assert.deepEqual(
    result.findings.map((finding) => finding.path),
    ["/workspace/app.env", "/workspace/app.env"]
  );
  assert.ok(result.findings.every((finding) => finding.redactedSnippet.includes("[REDACTED]")));
});
