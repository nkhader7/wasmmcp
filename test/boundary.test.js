import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityBroker } from "../src/plugin/capability-broker.js";

const manifest = {
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
    sockets: "denied"
  }
};

test("broker grants only declared local read capability", () => {
  const broker = new CapabilityBroker();
  const invocation = broker.buildInvocation({
    manifest,
    requestedCaps: ["fs:read"],
    workspaceRoot: "/repo"
  });

  assert.equal(invocation.preopens[0].guestPath, "/workspace");
  assert.equal(invocation.preopens[0].readOnly, true);
});

test("broker rejects capabilities outside the manifest boundary", () => {
  const broker = new CapabilityBroker();
  assert.throws(
    () => broker.buildInvocation({ manifest, requestedCaps: ["net:http"], workspaceRoot: "/repo" }),
    /Capability denied/
  );
});
