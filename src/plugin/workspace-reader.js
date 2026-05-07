import { promises as fs } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", ".idea", ".vscode"]);

export async function readWorkspaceFiles(rootDir) {
  const root = path.resolve(rootDir);
  const files = [];
  await walk(root, root, files);
  return files;
}

async function walk(root, current, files) {
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");

    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(root, absolute, files);
      continue;
    }
    if (!entry.isFile()) continue;

    const stat = await fs.stat(absolute);
    if (stat.size > 1024 * 1024) continue;

    files.push({
      path: `/workspace/${relative}`,
      text: await fs.readFile(absolute, "utf8").catch(() => "")
    });
  }
}
