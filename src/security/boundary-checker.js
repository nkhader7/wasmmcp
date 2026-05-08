// Task 6: Validate proposed changes against the six architecture invariants.
// Used to audit PRs, config edits, or new skill/module proposals before merging.

export const INVARIANTS = {
  WORKSPACE_STAYS_LOCAL: "workspace-stays-local",
  NO_WASM_EXFIL:         "no-wasm-exfiltration",
  MCP_IS_DISPATCHER:     "mcp-is-dispatcher-only",
  CAPS_IN_MANIFEST:      "caps-declared-in-manifest",
  MODULE_REF_BY_ID:      "module-ref-by-id-not-url",
  PLUGIN_IS_FIRST_PARTY: "plugin-is-first-party"
};

export class BoundaryChecker {
  check(proposal) {
    const violations = [];

    violations.push(...checkWorkspaceLeakage(proposal));
    violations.push(...checkWasmExfiltration(proposal));
    violations.push(...checkMcpIsDispatcher(proposal));
    violations.push(...checkCapsInManifest(proposal));
    violations.push(...checkModuleRefById(proposal));
    violations.push(...checkPluginFirstParty(proposal));

    return {
      passed: violations.length === 0,
      violations
    };
  }
}

// ── Invariant: workspace bytes never leave the IDE process ───────────────────
function checkWorkspaceLeakage(proposal) {
  const violations = [];
  const { mcpServerCode, mcpSkillArgs } = proposal;

  if (mcpServerCode) {
    const WORKSPACE_READS = [
      /readFile|readdir|createReadStream|readWorkspace/i,
      /fs\.promises\./,
      /workspaceRoot/
    ];
    for (const pattern of WORKSPACE_READS) {
      if (pattern.test(mcpServerCode)) {
        violations.push({
          invariant: INVARIANTS.WORKSPACE_STAYS_LOCAL,
          message:   "MCP server code appears to read workspace files. Workspace bytes must not leave the IDE process.",
          severity:  "critical"
        });
        break;
      }
    }
  }

  if (mcpSkillArgs) {
    const serialized = JSON.stringify(mcpSkillArgs);
    if (/"fileContent"|"source_code"|"workspace_data"/.test(serialized)) {
      violations.push({
        invariant: INVARIANTS.WORKSPACE_STAYS_LOCAL,
        message:   "Skill args appear to include raw file content. Only findings may be returned to the MCP server.",
        severity:  "critical"
      });
    }
  }

  return violations;
}

// ── Invariant: WASM modules cannot exfiltrate ────────────────────────────────
function checkWasmExfiltration(proposal) {
  const violations = [];
  const { manifest } = proposal;

  if (!manifest) return violations;

  if (manifest.capabilities?.sockets !== "denied") {
    violations.push({
      invariant: INVARIANTS.NO_WASM_EXFIL,
      message:   `manifest.capabilities.sockets must be "denied". Got: ${JSON.stringify(manifest.capabilities?.sockets)}`,
      severity:  "critical"
    });
  }

  if (manifest.capabilities?.filesystem && manifest.capabilities.filesystem !== "read-only") {
    violations.push({
      invariant: INVARIANTS.NO_WASM_EXFIL,
      message:   `manifest.capabilities.filesystem must be "read-only". Got: ${JSON.stringify(manifest.capabilities.filesystem)}`,
      severity:  "critical"
    });
  }

  const imports = manifest.capabilities?.imports ?? [];
  if (imports.some((i) => /wasi:sockets|wasi:http/.test(i))) {
    violations.push({
      invariant: INVARIANTS.NO_WASM_EXFIL,
      message:   "Manifest imports wasi:sockets or wasi:http. Network access is not permitted.",
      severity:  "critical"
    });
  }

  return violations;
}

// ── Invariant: MCP server is a dispatcher only, not a WASM host ──────────────
function checkMcpIsDispatcher(proposal) {
  const violations = [];
  const { mcpServerCode } = proposal;

  if (!mcpServerCode) return violations;

  const WASM_HOST_PATTERNS = [
    /WebAssembly\.(instantiate|compile|Module)/,
    /new WASI\(/,
    /wasmtime/i,
    /\.wasm['"]?\s*\)/,
    /wasi\.start\(/
  ];

  for (const pattern of WASM_HOST_PATTERNS) {
    if (pattern.test(mcpServerCode)) {
      violations.push({
        invariant: INVARIANTS.MCP_IS_DISPATCHER,
        message:   "MCP server code appears to instantiate or run WASM. The MCP server must only dispatch module references — it must never be a WASM host.",
        severity:  "critical"
      });
      break;
    }
  }

  return violations;
}

// ── Invariant: every new capability must appear in manifest + broker ─────────
function checkCapsInManifest(proposal) {
  const violations = [];
  const { requestedCaps, manifest, brokerAllowedCaps } = proposal;

  if (!requestedCaps || !manifest) return violations;

  const declaredImports = new Set(manifest.capabilities?.imports ?? []);

  const CAP_TO_WASI = {
    "fs:read":  "wasi:filesystem/preopens",
    "net:http": "wasi:http/outgoing-handler"
  };

  for (const cap of requestedCaps) {
    const required = CAP_TO_WASI[cap];
    if (required && !declaredImports.has(required)) {
      violations.push({
        invariant: INVARIANTS.CAPS_IN_MANIFEST,
        message:   `Capability "${cap}" requires "${required}" in manifest.capabilities.imports, but it is absent.`,
        severity:  "high"
      });
    }
    if (brokerAllowedCaps && !brokerAllowedCaps.has(cap)) {
      violations.push({
        invariant: INVARIANTS.CAPS_IN_MANIFEST,
        message:   `Capability "${cap}" is not in the broker's allowlist. Add it to ALLOWED_CAPS before granting.`,
        severity:  "high"
      });
    }
  }

  return violations;
}

// ── Invariant: modules referenced by name@version+sha256, never by URL ───────
function checkModuleRefById(proposal) {
  const violations = [];
  const { moduleRef } = proposal;

  if (!moduleRef) return violations;

  if (/^https?:\/\//.test(moduleRef) || /^(?:oci|registry):\/\//.test(moduleRef)) {
    violations.push({
      invariant: INVARIANTS.MODULE_REF_BY_ID,
      message:   `moduleRef "${moduleRef}" looks like a URL. Modules must be referenced by name@version (+ sha256), never by URL at invocation time.`,
      severity:  "critical"
    });
  }

  const AT_VERSION = /^[a-z][a-z0-9_-]*@[0-9]+(?:\.[0-9]+)*$/i;
  if (!AT_VERSION.test(moduleRef)) {
    violations.push({
      invariant: INVARIANTS.MODULE_REF_BY_ID,
      message:   `moduleRef "${moduleRef}" does not match name@version format.`,
      severity:  "medium"
    });
  }

  return violations;
}

// ── Invariant: plugin is first-party, not user-installed ─────────────────────
function checkPluginFirstParty(proposal) {
  const violations = [];
  const { pluginInstallMethod } = proposal;

  if (!pluginInstallMethod) return violations;

  const USER_INSTALL = ["npm install", "pip install", "cargo install", "brew install", "apt install"];
  if (USER_INSTALL.some((m) => pluginInstallMethod.toLowerCase().includes(m))) {
    violations.push({
      invariant: INVARIANTS.PLUGIN_IS_FIRST_PARTY,
      message:   `Plugin install method "${pluginInstallMethod}" requires user action. The plugin must be bundled with the IDE, not user-installed.`,
      severity:  "high"
    });
  }

  return violations;
}
