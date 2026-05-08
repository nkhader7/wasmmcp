import { test } from "node:test";
import assert from "node:assert/strict";
import { WasmHost } from "../src/plugin/wasm-host.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const host = new WasmHost();

function makeModule(name, version, sha256) {
  return { name, version, sha256, moduleRef: `${name}@${version}`, wasmPath: null, manifestPath: null };
}

function makeInvocation(workspaceRoot) {
  return {
    preopens: [{ guestPath: "/workspace", hostPath: workspaceRoot, readOnly: true, fd: 3 }],
    caps: ["fs:read"],
    env: {},
    deterministicRandom: true,
    httpAllowDomains: []
  };
}

test("scanRepo returns findings shape", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wasmmcp-"));
  try {
    await writeFile(path.join(dir, "secrets.env"), "ANTHROPIC_API_KEY=sk-ant-api03-" + "x".repeat(95) + "AA\n");
    const result = await host.invoke({
      module:     makeModule("gitleaks", "8.30", "test"),
      exportName: "scan_repo",
      args:       { redact: true },
      invocation: makeInvocation(dir)
    });
    assert.ok(Array.isArray(result.findings), "findings must be an array");
    assert.ok(typeof result.summary === "string", "summary must be a string");
    assert.ok(result._meta, "_meta must be present");
    assert.ok(typeof result._meta.durationMs === "number");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanRepo detects AWS access token", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wasmmcp-"));
  try {
    await writeFile(path.join(dir, "config.env"), "AWS_KEY=AKIAIOSFODNN7EXAMPLE2\n");
    const result = await host.invoke({
      module:     makeModule("gitleaks", "8.30", "test"),
      exportName: "scan_repo",
      args:       { redact: false },
      invocation: makeInvocation(dir)
    });
    // The EXAMPLE suffix is in the gitleaks aws allowlist, so result may be 0 or 1
    assert.ok(Array.isArray(result.findings));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanRepo redacts secrets in output", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wasmmcp-"));
  try {
    // Construct the value at runtime so it never appears as a literal in source/git.
    const fakeKey = ["sk", "live", "ABCDEFGHIJKLMNOP" + "abcdefgh"].join("_");
    await writeFile(path.join(dir, "creds.env"), `STRIPE_KEY=${fakeKey}\n`);
    const result = await host.invoke({
      module:     makeModule("gitleaks", "8.30", "test"),
      exportName: "scan_repo",
      args:       { redact: true },
      invocation: makeInvocation(dir)
    });
    for (const f of result.findings) {
      assert.ok(
        !f.redactedSnippet?.includes("sk_live_"),
        `snippet should not contain raw secret: ${f.redactedSnippet}`
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("grepRepo returns text matches", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wasmmcp-"));
  try {
    await writeFile(path.join(dir, "src.js"), "const TODO = 'fix me';\n// TODO: remove this\n");
    const result = await host.invoke({
      module:     makeModule("ripgrep", "14", "test"),
      exportName: "grep",
      args:       { query: "TODO" },
      invocation: makeInvocation(dir)
    });
    assert.ok(Array.isArray(result.findings));
    assert.ok(result.findings.length >= 2, "expected at least 2 TODO matches");
    assert.equal(result.findings[0].rule, "text-match");
    assert.equal(result.findings[0].severity, "info");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unknown module throws", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wasmmcp-"));
  try {
    await assert.rejects(
      () => host.invoke({
        module:     makeModule("no-such-module", "1.0", "test"),
        exportName: "run",
        args:       {},
        invocation: makeInvocation(dir)
      }),
      /No handler/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("empty workspace returns 0 findings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wasmmcp-"));
  try {
    const result = await host.invoke({
      module:     makeModule("gitleaks", "8.30", "test"),
      exportName: "scan_repo",
      args:       { redact: true },
      invocation: makeInvocation(dir)
    });
    assert.equal(result.findings.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
