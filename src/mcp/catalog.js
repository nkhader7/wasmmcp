import { promises as fs } from "node:fs";
import path from "node:path";

// ── Public loaders ────────────────────────────────────────────────────────────

export async function loadSkills(skillsDir) {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills  = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !isSkillFile(entry.name)) continue;
    const filePath = path.join(skillsDir, entry.name);
    const text     = await fs.readFile(filePath, "utf8");
    try {
      const skill = parseSkill(entry.name, text);
      skills.set(skill.name, skill);
    } catch (err) {
      process.stderr.write(`[catalog] skipping ${entry.name}: ${err.message}\n`);
    }
  }

  return skills;
}

export async function loadRules(rulesDir) {
  const entries = await fs.readdir(rulesDir, { withFileTypes: true });
  const rules   = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(rulesDir, entry.name);
    rules.push(JSON.parse(await fs.readFile(filePath, "utf8")));
  }

  return rules;
}

// ── Skill parser ──────────────────────────────────────────────────────────────

export function parseSkill(fileName, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/s);
  if (!match) throw new Error(`missing frontmatter`);

  const meta     = parseFrontmatter(match[1]);
  const body     = match[2];

  // module is required: name@version
  const moduleStr = String(meta.module ?? "");
  const atIdx     = moduleStr.lastIndexOf("@");
  if (atIdx < 1) throw new Error(`module must be name@version, got "${moduleStr}"`);
  const moduleName = moduleStr.slice(0, atIdx);
  const version    = moduleStr.slice(atIdx + 1);

  // Canonical tool name: prefer explicit `name` field, fall back to filename stem
  const name = String(meta.name ?? path.basename(fileName, ".md"));

  // Category: prefer explicit field, then derive from name prefix (before __)
  const category = String(meta.category ?? deriveCategoryFromName(name));

  // Description: prefer explicit field, then extract from first body paragraph
  const description = String(
    meta.description ??
    extractFirstParagraph(body) ??
    `Run ${moduleStr} locally via WASM plugin.`
  );

  // Build MCP-spec inputSchema from the args object
  const args        = meta.args ?? {};
  const inputSchema = buildInputSchema(args, meta.inputSchema);

  return {
    name,
    category,
    title:       extractTitle(body) ?? name,
    description,
    module:      moduleName,
    version,
    sha256:      meta.sha256 ? String(meta.sha256) : undefined,
    when:        splitCsv(meta.when),
    args,
    caps:        Array.isArray(meta.caps) ? meta.caps : [],
    exportName:  meta.export ? String(meta.export) : "scan",
    inputSchema,
  };
}

// ── inputSchema builder ───────────────────────────────────────────────────────
// Derives a JSON Schema object from the `args` block in frontmatter.
// Every arg becomes an optional property unless the value is empty string
// (which marks it as required with no default).

function buildInputSchema(args, explicitSchema) {
  if (explicitSchema && typeof explicitSchema === "object") return explicitSchema;

  const properties = {};
  const required   = [];

  const SEVERITY_ENUM = ["low+", "medium+", "high+", "critical", "warning+"];

  for (const [key, value] of Object.entries(args)) {
    if (key === "focus") continue; // internal routing hint, not exposed

    if (typeof value === "boolean") {
      properties[key] = { type: "boolean", default: value, description: describe(key) };

    } else if (typeof value === "number") {
      properties[key] = { type: "number", default: value, description: describe(key) };

    } else if (key === "severity" && SEVERITY_ENUM.includes(String(value))) {
      properties[key] = {
        type:        "string",
        enum:        SEVERITY_ENUM,
        default:     String(value),
        description: "Minimum severity threshold for returned findings."
      };

    } else if (key === "path") {
      properties[key] = {
        type:        "string",
        default:     String(value) || "/workspace",
        description: "Absolute path to the workspace root to scan."
      };

    } else if (key === "query" && String(value) === "") {
      // query is required when present with empty default
      properties[key] = { type: "string", description: "Search query or regex pattern." };
      required.push("query");

    } else {
      properties[key] = { type: "string", default: String(value), description: describe(key) };
    }
  }

  const schema = { type: "object", properties };
  if (required.length) schema.required = required;
  return schema;
}

const FIELD_DESCRIPTIONS = {
  path:        "Absolute path to the workspace root.",
  redact:      "Replace secret values with **** in output.",
  severity:    "Minimum severity threshold.",
  language:    "Source language (auto = detect per file).",
  rules:       "Semgrep rule pack or path.",
  query:       "Search query or regex pattern.",
  maxMatches:  "Maximum number of matches to return.",
  ignoreCase:  "Case-insensitive search.",
  output:      "Output format or mode.",
};
function describe(key) { return FIELD_DESCRIPTIONS[key] ?? key; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSkillFile(name) {
  const n = name.toLowerCase();
  return n.endsWith(".md") && n !== "readme.md" && n !== "skill_template.md" && !n.startsWith("_");
}

function deriveCategoryFromName(name) {
  const sep = name.indexOf("__");
  return sep > 0 ? name.slice(0, sep) : "general";
}

function extractTitle(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractFirstParagraph(body) {
  // Skip heading lines, return first non-empty non-heading paragraph
  const lines = body.split(/\r?\n/);
  let started = false;
  const para  = [];
  for (const line of lines) {
    if (line.startsWith("#")) { if (started) break; continue; }
    if (line.trim() === "")   { if (started) break; continue; }
    started = true;
    para.push(line.trim());
  }
  return para.length ? para.join(" ") : null;
}

function splitCsv(value) {
  return String(value ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

function parseFrontmatter(text) {
  const root  = {};
  const stack = [{ indent: -1, value: root }];

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const line   = raw.trim();

    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;

    if (line.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`unexpected list item: ${line}`);
      parent.push(parseScalar(line.slice(2)));
      continue;
    }

    const sep = line.indexOf(":");
    if (sep < 0) throw new Error(`invalid line: ${line}`);

    const key       = line.slice(0, sep).trim();
    const valueText = line.slice(sep + 1).trim();

    if (valueText === "") {
      // Determine container type from next non-empty line
      const nextLine = findNext(text, raw);
      const container = nextLine?.trim().startsWith("- ") ? [] : {};
      parent[key] = container;
      stack.push({ indent, value: container });
    } else {
      parent[key] = parseScalar(valueText);
    }
  }
  return root;
}

function findNext(text, afterLine) {
  const lines = text.split(/\r?\n/);
  const idx   = lines.indexOf(afterLine);
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim()) return lines[i];
  }
  return null;
}

function parseScalar(v) {
  if (v === "true")  return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}
