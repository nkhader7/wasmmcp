import { promises as fs } from "node:fs";
import path from "node:path";

export async function loadSkills(skillsDir) {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(skillsDir, entry.name);
    const text = await fs.readFile(filePath, "utf8");
    const skill = parseSkill(entry.name, text);
    skills.set(skill.name, skill);
  }

  return skills;
}

export async function loadRules(rulesDir) {
  const entries = await fs.readdir(rulesDir, { withFileTypes: true });
  const rules = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(rulesDir, entry.name);
    rules.push(JSON.parse(await fs.readFile(filePath, "utf8")));
  }

  return rules;
}

export function parseSkill(fileName, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Skill ${fileName} is missing frontmatter`);

  const meta = parseFrontmatter(match[1]);
  const [moduleName, version] = String(meta.module).split("@");
  if (!moduleName || !version) {
    throw new Error(`Skill ${fileName} must reference module as name@version`);
  }

  return {
    name: path.basename(fileName, ".md"),
    title: extractTitle(match[2]),
    module: moduleName,
    version,
    sha256: meta.sha256,
    when: splitCsv(meta.when),
    args: meta.args ?? {},
    caps: meta.caps ?? [],
    exportName: meta.export
  };
}

function extractTitle(body) {
  const title = body.match(/^#\s+(.+)$/m);
  return title ? title[1].trim() : "Untitled Skill";
}

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFrontmatter(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;

    const indent = raw.match(/^\s*/)[0].length;
    const line = raw.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();

    const parent = stack.at(-1).value;
    if (line.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`Unexpected list item: ${line}`);
      parent.push(parseScalar(line.slice(2)));
      continue;
    }

    const separator = line.indexOf(":");
    if (separator < 0) throw new Error(`Invalid frontmatter line: ${line}`);

    const key = line.slice(0, separator).trim();
    const valueText = line.slice(separator + 1).trim();
    if (valueText === "") {
      const next = findNextContentLine(lines, index + 1);
      const container = next?.trim().startsWith("- ") ? [] : {};
      parent[key] = container;
      stack.push({ indent, value: container });
    } else {
      parent[key] = parseScalar(valueText);
    }
  }

  return root;
}

function findNextContentLine(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) return lines[index];
  }
  return null;
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}
