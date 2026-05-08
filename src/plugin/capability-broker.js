// Capability broker: builds a per-invocation sandbox config.
// Any capability not in ALLOWED_CAPS is rejected before the module runs.
// Any import not in the manifest causes instantiation failure (enforced by wasmtime at link time).

const ALLOWED_CAPS = new Set([
  "fs:read",
  "net:http"   // scoped HTTP (requires domain allowlist in manifest)
]);

const REQUIRED_IMPORTS = [
  "wasi:filesystem/preopens",
  "wasi:io/streams",
  "wasi:cli/stdout",
  "wasi:cli/stderr",
  "wasi:clocks/monotonic-clock",
  "wasi:random/random",
  "wasi:cli/environment"
];

// If net:http is requested, the manifest must declare an http_allow domain list.
const NET_HTTP_IMPORT = "wasi:http/outgoing-handler";

export class CapabilityBroker {
  buildInvocation({ manifest, requestedCaps, workspaceRoot }) {
    // ── 1. Check every requested cap is in the allowlist ─────────────────────
    for (const cap of requestedCaps) {
      if (!ALLOWED_CAPS.has(cap)) {
        throw Object.assign(
          new Error(`Capability denied: "${cap}" — not in broker allowlist. Permitted: ${[...ALLOWED_CAPS].join(", ")}`),
          { invariant: "caps-declared-in-manifest", cap }
        );
      }
    }

    const caps = new Set(requestedCaps);

    // ── 2. Validate manifest imports ──────────────────────────────────────────
    const declaredImports = new Set(manifest.capabilities?.imports ?? []);
    for (const required of REQUIRED_IMPORTS) {
      if (!declaredImports.has(required)) {
        throw Object.assign(
          new Error(`Manifest does not declare required WASI import: "${required}"`),
          { invariant: "caps-declared-in-manifest", missingImport: required }
        );
      }
    }

    // ── 3. Hard invariants ────────────────────────────────────────────────────
    if (manifest.capabilities?.sockets !== "denied") {
      throw Object.assign(
        new Error('Invariant violated: manifest must set capabilities.sockets = "denied"'),
        { invariant: "no-wasm-exfiltration" }
      );
    }

    if (manifest.capabilities?.filesystem !== "read-only") {
      throw Object.assign(
        new Error('Invariant violated: manifest must set capabilities.filesystem = "read-only"'),
        { invariant: "no-wasm-exfiltration" }
      );
    }

    // ── 4. Scoped HTTP gate ───────────────────────────────────────────────────
    let httpAllowDomains = [];
    if (caps.has("net:http")) {
      if (!declaredImports.has(NET_HTTP_IMPORT)) {
        throw Object.assign(
          new Error(`net:http requested but manifest does not declare import "${NET_HTTP_IMPORT}"`),
          { invariant: "caps-declared-in-manifest" }
        );
      }
      httpAllowDomains = manifest.capabilities?.http_allow ?? [];
      if (httpAllowDomains.length === 0) {
        throw Object.assign(
          new Error("net:http granted but manifest.capabilities.http_allow is empty — at least one domain is required"),
          { invariant: "caps-declared-in-manifest" }
        );
      }
    }

    // ── 5. Build env (filtered to manifest env_allow) ─────────────────────────
    const envAllowList = manifest.capabilities?.env_allow ?? [];
    const env = {};
    for (const key of envAllowList) {
      const val = process.env[key];
      if (val !== undefined) env[key] = val;
    }

    // ── 6. Return per-invocation config ──────────────────────────────────────
    return {
      preopens: [{ guestPath: "/workspace", hostPath: workspaceRoot, readOnly: true, fd: 3 }],
      caps:     [...caps],
      env,
      deterministicRandom: true,
      httpAllowDomains      // empty unless net:http granted
    };
  }
}
