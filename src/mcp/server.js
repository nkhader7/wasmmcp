import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, loadSkills } from "./catalog.js";
import { SkillDispatcher } from "./dispatcher.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dispatcher = new SkillDispatcher({
  skills: await loadSkills(path.join(root, "catalog/skills")),
  rules:  await loadRules(path.join(root, "catalog/rules"))
});

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handleLine(line);
  }
});

function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  // Notifications have no id and require no response
  if (request.id === undefined || request.method === "notifications/initialized") return;

  try {
    const result = route(request.method, request.params ?? {});
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (err) {
    const code = err.code ?? -32000;
    write({ jsonrpc: "2.0", id: request.id, error: { code, message: err.message } });
  }
}

function route(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "wasmmcp-dispatcher", version: "0.3.0" },
        capabilities: { tools: { listChanged: true } }
      };

    case "tools/list":
      return { tools: dispatcher.listTools() };

    case "tools/call": {
      if (!params.name) throw Object.assign(new Error("params.name is required"), { code: -32602 });
      const result = dispatcher.resolveToolCall(params.name, params.arguments ?? {});
      // Echo back progressToken in _meta so the IDE plugin can correlate notifications
      if (params._meta?.progressToken) {
        result._meta = { ...result._meta, progressToken: params._meta.progressToken };
      }
      return result;
    }

    case "resources/read":
    case "resources/list":
      // Findings resources are embedded inline in tools/call results (type: "resource").
      // This endpoint is a no-op for this dispatcher.
      return { resources: [] };

    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
