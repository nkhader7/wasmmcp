// MCP Skill Dispatcher Server — JSON-RPC 2.0 over stdio
// Spec: MCP 2025-06-18  https://spec.modelcontextprotocol.io
//
// Trust model: this server is a THIN DISPATCHER.
// It resolves skill names to { module, args, caps } for the IDE plugin.
// It NEVER receives workspace source bytes and NEVER runs WASM.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, loadSkills } from "./catalog.js";
import { SkillDispatcher } from "./dispatcher.js";
import { SidecarExecutor } from "./sidecar.js";

const root       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dispatcher = new SkillDispatcher({
  skills: await loadSkills(path.join(root, "catalog/skills")),
  rules:  await loadRules(path.join(root, "catalog/rules"))
});

// Sidecar mode: active when SIDECAR_WORKSPACE is set.
// The server process is a local stdio child of the IDE — workspace bytes stay on-machine.
const sidecar = SidecarExecutor.fromEnv();

// Log startup summary to stderr (never stdout — stdout is the JSON-RPC channel)
const summary = dispatcher.categorySummary();
process.stderr.write(
  `[wasmmcp] loaded ${dispatcher.skills.size} skills: ` +
  Object.entries(summary).map(([c, n]) => `${c}(${n})`).join(", ") + "\n"
);
if (sidecar) {
  process.stderr.write(`[wasmmcp] sidecar mode ACTIVE — workspace: ${sidecar.workspaceRoot}\n`);
}

// ── stdio JSON-RPC transport ──────────────────────────────────────────────────

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  for (;;) {
    const nl = buffer.indexOf("\n");
    if (nl < 0) break;
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line) handleLine(line);
  }
});

async function handleLine(line) {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  // Notifications (no `id`) require no response
  if (req.id === undefined) return;

  try {
    const result = await route(req.method, req.params ?? {});
    send({ jsonrpc: "2.0", id: req.id, result });
  } catch (err) {
    send({ jsonrpc: "2.0", id: req.id, error: { code: err.code ?? -32000, message: err.message } });
  }
}

// ── Method router ─────────────────────────────────────────────────────────────

async function route(method, params) {
  switch (method) {

    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "wasmmcp-dispatcher", version: "0.4.0" },
        capabilities: {
          tools: { listChanged: true }
        },
        // Non-standard extension: category summary for IDE UIs that can group tools
        _meta: {
          categories:   dispatcher.categorySummary(),
          totalSkills:  dispatcher.skills.size,
          dataPath:     "workspace bytes never leave the IDE process"
        }
      };

    case "tools/list": {
      // Optional cursor-based pagination (MCP 2025-06-18)
      const tools  = dispatcher.listTools();
      const cursor = Number(params.cursor ?? 0);
      const limit  = 50; // return up to 50 tools per page
      const page   = tools.slice(cursor, cursor + limit);
      const next   = cursor + limit < tools.length ? String(cursor + limit) : undefined;
      const result = { tools: page };
      if (next) result.nextCursor = next;
      return result;
    }

    case "tools/call": {
      if (typeof params.name !== "string" || !params.name) {
        const err = new Error("params.name is required"); err.code = -32602; throw err;
      }
      const resolved      = dispatcher.resolveToolCall(params.name, params.arguments ?? {});
      const progressToken = params._meta?.progressToken;

      // Sidecar mode: execute the scan locally and return real findings to Cascade.
      // The server is a local stdio child of the IDE — workspace bytes never leave this machine.
      if (sidecar) {
        return await sidecar.execute(resolved._meta.invokeLocal, progressToken);
      }

      // Default (dispatcher-only): return the invokeLocal module reference for the IDE plugin.
      if (progressToken) resolved._meta.progressToken = progressToken;
      return resolved;
    }

    // Respond to resources/list with an empty list (findings are inline resources)
    case "resources/list":
      return { resources: [] };

    // Return event-triggered skill names for IDE rule engines
    case "rules/match": {
      const event  = String(params.event ?? "");
      const skills = dispatcher.skillsForEvent(event);
      return { event, skills };
    }

    default: {
      const err = new Error(`Method not found: ${method}`); err.code = -32601; throw err;
    }
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}
