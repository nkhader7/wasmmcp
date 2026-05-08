// Sidecar execution mode — runs scans in the MCP server process itself.
// Only active when SIDECAR_WORKSPACE is set AND the server is launched as a
// stdio subprocess by the IDE (i.e. Windsurf spawning `node server.js`).
// Workspace bytes never leave this machine; the server process is a trusted
// local child of the IDE — semantically equivalent to an in-process plugin.
//
// Supports Layer 3 JS mocks for: gitleaks, ripgrep.
// All other modules return a graceful "not available in sidecar mode" message.

import path from "node:path";
import { WasmHost } from "../plugin/wasm-host.js";
import { renderFindings } from "../plugin/findings-renderer.js";

const host = new WasmHost();

export class SidecarExecutor {
  constructor(workspaceRoot) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  // Build from env var. Returns null when sidecar mode is not configured.
  static fromEnv() {
    const raw = process.env.SIDECAR_WORKSPACE;
    if (!raw) return null;
    return new SidecarExecutor(raw);
  }

  async execute(invokeLocal, progressToken) {
    const moduleRef  = String(invokeLocal.module ?? "");
    const [name]     = moduleRef.split("@");
    const exportName = String(invokeLocal.export ?? "scan");
    const args       = { ...invokeLocal.args };

    // Rewrite /workspace → actual host path so the JS mock finds real files.
    if (args.path === "/workspace" || !args.path) {
      args.path = this.workspaceRoot;
    }

    const module = {
      name,
      moduleRef,
      // wasmPath null → existsSync("") → false → Layer 1 (real WASM) skipped
      wasmPath: null,
    };

    const invocation = {
      preopens: [{ guestPath: "/workspace", hostPath: this.workspaceRoot, readOnly: true, fd: 3 }],
      caps:     invokeLocal.caps ?? [],
      env:      {},
      deterministicRandom: true,
      httpAllowDomains:    [],
    };

    try {
      const scanResult = await host.invoke({ module, exportName, args, invocation });
      const rendered   = renderFindings(scanResult, { progressToken, workspaceRoot: this.workspaceRoot });
      if (progressToken) rendered._meta.progressToken = progressToken;
      return rendered;
    } catch (err) {
      const msg = [
        `Sidecar scan not available for module \`${moduleRef}\` (export: \`${exportName}\`).`,
        `Reason: ${err.message}`,
        "",
        "Supported in sidecar mode: `gitleaks` (secrets scan), `ripgrep` (text search).",
        "For `semgrep`, `tree-sitter`, and other modules, use Path B — the VSIX IDE extension."
      ].join("\n");

      return {
        content: [{ type: "text", text: msg }],
        isError: true,
        _meta:   { durationMs: 0, fuelConsumed: 0, filesScanned: 0, findingCount: 0, bySeverity: {} }
      };
    }
  }
}
