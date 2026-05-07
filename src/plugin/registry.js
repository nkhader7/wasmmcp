import { promises as fs } from "node:fs";
import path from "node:path";

export class ModuleRegistry {
  constructor({ rootDir, index }) {
    this.rootDir = rootDir;
    this.index = index;
  }

  static async load(rootDir) {
    const indexPath = path.join(rootDir, "modules/index.json");
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    return new ModuleRegistry({ rootDir, index });
  }

  resolve(moduleRef, sha256) {
    const [name, version] = moduleRef.split("@");
    const found = this.index.modules.find(
      (module) =>
        module.name === name &&
        module.version === version &&
        module.sha256 === sha256 &&
        module.cosignVerified === true
    );

    if (!found) {
      throw new Error(`Module ${moduleRef} with sha256 ${sha256} is not in the verified registry`);
    }

    return {
      ...found,
      moduleRef,
      wasmPath: path.join(this.rootDir, found.path),
      manifestPath: path.join(this.rootDir, found.manifest)
    };
  }
}
