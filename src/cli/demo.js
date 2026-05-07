import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, loadSkills } from "../mcp/catalog.js";
import { SkillDispatcher } from "../mcp/dispatcher.js";
import { PluginDispatcher } from "../plugin/dispatcher.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;

const mcpDispatcher = new SkillDispatcher({
  skills: await loadSkills(path.join(root, "catalog/skills")),
  rules: await loadRules(path.join(root, "catalog/rules"))
});

const plugin = await PluginDispatcher.create({ rootDir: root, workspaceRoot });
const resolved = mcpDispatcher.resolveToolCall("scan_secrets", { path: "/workspace" });
const result = await plugin.invokeLocal(resolved._meta.invokeLocal);

console.log(JSON.stringify(result, null, 2));
