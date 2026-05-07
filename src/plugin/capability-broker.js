const ALLOWED_CAPS = new Set(["fs:read"]);
const REQUIRED_IMPORTS = [
  "wasi:filesystem/preopens",
  "wasi:io/streams",
  "wasi:cli/stdout",
  "wasi:cli/stderr",
  "wasi:clocks/monotonic-clock",
  "wasi:random/random",
  "wasi:cli/environment"
];

export class CapabilityBroker {
  buildInvocation({ manifest, requestedCaps, workspaceRoot }) {
    for (const cap of requestedCaps) {
      if (!ALLOWED_CAPS.has(cap)) throw new Error(`Capability denied: ${cap}`);
    }

    const imports = new Set(manifest.capabilities?.imports ?? []);
    for (const requiredImport of REQUIRED_IMPORTS) {
      if (!imports.has(requiredImport)) {
        throw new Error(`Manifest does not declare required import ${requiredImport}`);
      }
    }

    if (manifest.capabilities?.sockets !== "denied") {
      throw new Error("wasi:sockets must be denied");
    }

    if (manifest.capabilities?.filesystem !== "read-only") {
      throw new Error("Filesystem capability must be read-only");
    }

    return {
      preopens: [{ guestPath: "/workspace", hostPath: workspaceRoot, readOnly: true, fd: 3 }],
      caps: requestedCaps,
      env: {},
      deterministicRandom: true
    };
  }
}
