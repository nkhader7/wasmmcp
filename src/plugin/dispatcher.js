import { CapabilityBroker } from "./capability-broker.js";
import { loadManifest } from "./manifest.js";
import { ModuleRegistry } from "./registry.js";
import { WasmHost } from "./wasm-host.js";

export class PluginDispatcher {
  constructor({ registry, broker = new CapabilityBroker(), host = new WasmHost(), workspaceRoot }) {
    this.registry = registry;
    this.broker = broker;
    this.host = host;
    this.workspaceRoot = workspaceRoot;
  }

  static async create({ rootDir, workspaceRoot }) {
    return new PluginDispatcher({
      registry: await ModuleRegistry.load(rootDir),
      workspaceRoot
    });
  }

  async invokeLocal(invokeLocal) {
    const module = this.registry.resolve(invokeLocal.module, invokeLocal.sha256);
    const manifest = await loadManifest(module.manifestPath);
    const invocation = this.broker.buildInvocation({
      manifest,
      requestedCaps: invokeLocal.caps ?? [],
      workspaceRoot: this.workspaceRoot
    });

    return this.host.invoke({
      module,
      exportName: invokeLocal.export,
      args: invokeLocal.args ?? {},
      invocation
    });
  }
}
