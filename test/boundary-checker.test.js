import { test } from "node:test";
import assert from "node:assert/strict";
import { BoundaryChecker, INVARIANTS } from "../src/security/boundary-checker.js";

const checker = new BoundaryChecker();

const VALID_MANIFEST = {
  capabilities: {
    imports: [
      "wasi:filesystem/preopens",
      "wasi:io/streams",
      "wasi:cli/stdout",
      "wasi:cli/stderr",
      "wasi:clocks/monotonic-clock",
      "wasi:random/random",
      "wasi:cli/environment"
    ],
    filesystem: "read-only",
    sockets:    "denied"
  }
};

test("valid proposal passes all checks", () => {
  const result = checker.check({
    manifest:        VALID_MANIFEST,
    requestedCaps:   ["fs:read"],
    moduleRef:       "gitleaks@8.30",
    brokerAllowedCaps: new Set(["fs:read"])
  });
  assert.ok(result.passed);
  assert.equal(result.violations.length, 0);
});

test("MCP server code that reads workspace files triggers workspace-stays-local", () => {
  const result = checker.check({
    mcpServerCode: `const data = await readWorkspaceFiles(workspaceRoot);`
  });
  assert.ok(!result.passed);
  const v = result.violations.find((v) => v.invariant === INVARIANTS.WORKSPACE_STAYS_LOCAL);
  assert.ok(v, "expected workspace-stays-local violation");
  assert.equal(v.severity, "critical");
});

test("MCP server code that runs WASM triggers mcp-is-dispatcher-only", () => {
  const result = checker.check({
    mcpServerCode: `const { instance } = await WebAssembly.instantiate(bytes, importObj);`
  });
  assert.ok(!result.passed);
  const v = result.violations.find((v) => v.invariant === INVARIANTS.MCP_IS_DISPATCHER);
  assert.ok(v, "expected mcp-is-dispatcher-only violation");
});

test("manifest with sockets not denied triggers no-wasm-exfiltration", () => {
  const badManifest = {
    capabilities: { ...VALID_MANIFEST.capabilities, sockets: "allowed" }
  };
  const result = checker.check({ manifest: badManifest, requestedCaps: [] });
  assert.ok(!result.passed);
  const v = result.violations.find((v) => v.invariant === INVARIANTS.NO_WASM_EXFIL);
  assert.ok(v, "expected no-wasm-exfiltration violation");
});

test("manifest with writable filesystem triggers no-wasm-exfiltration", () => {
  const badManifest = {
    capabilities: { ...VALID_MANIFEST.capabilities, filesystem: "read-write" }
  };
  const result = checker.check({ manifest: badManifest, requestedCaps: [] });
  const v = result.violations.find((v) => v.invariant === INVARIANTS.NO_WASM_EXFIL);
  assert.ok(v, "expected no-wasm-exfiltration violation");
});

test("URL module ref triggers module-ref-by-id-not-url", () => {
  const result = checker.check({ moduleRef: "https://registry.example.com/gitleaks@8.30.wasm" });
  const v = result.violations.find((v) => v.invariant === INVARIANTS.MODULE_REF_BY_ID);
  assert.ok(v, "expected module-ref-by-id violation");
  assert.equal(v.severity, "critical");
});

test("valid module ref name@version passes", () => {
  const result = checker.check({ moduleRef: "gitleaks@8.30" });
  const v = result.violations.find((v) => v.invariant === INVARIANTS.MODULE_REF_BY_ID);
  assert.equal(v, undefined);
});

test("cap not in broker allowlist triggers caps-declared-in-manifest", () => {
  const result = checker.check({
    manifest:         VALID_MANIFEST,
    requestedCaps:    ["fs:read"],
    brokerAllowedCaps: new Set(["net:http"]) // fs:read not in this set
  });
  const v = result.violations.find((v) => v.invariant === INVARIANTS.CAPS_IN_MANIFEST);
  assert.ok(v, "expected caps-declared-in-manifest violation");
});

test("user-install method triggers plugin-is-first-party", () => {
  const result = checker.check({ pluginInstallMethod: "npm install @wasmmcp/plugin" });
  const v = result.violations.find((v) => v.invariant === INVARIANTS.PLUGIN_IS_FIRST_PARTY);
  assert.ok(v, "expected plugin-is-first-party violation");
});
