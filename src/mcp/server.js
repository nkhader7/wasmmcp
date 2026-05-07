import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, loadSkills } from "./catalog.js";
import { SkillDispatcher } from "./dispatcher.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dispatcher = new SkillDispatcher({
  skills: await loadSkills(path.join(root, "catalog/skills")),
  rules: await loadRules(path.join(root, "catalog/rules"))
});

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  for (;;) {
    const newline = input.indexOf("\n");
    if (newline < 0) break;
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (line) handleLine(line);
  }
});

function handleLine(line) {
  try {
    const request = JSON.parse(line);
    const result = route(request.method, request.params ?? {});
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: error.message }
    });
  }
}

function route(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion ?? "2025-06-18",
      serverInfo: { name: "wasmmcp-dispatcher", version: "0.1.0" },
      capabilities: { tools: { listChanged: true } }
    };
  }

  if (method === "tools/list") {
    return { tools: dispatcher.listTools() };
  }

  if (method === "tools/call") {
    return dispatcher.resolveToolCall(params.name, params.arguments ?? {});
  }

  throw new Error(`Unsupported method: ${method}`);
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
