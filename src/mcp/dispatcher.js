// MCP Skill Dispatcher — MCP spec 2025-06-18
// Resolves tools/list and tools/call; all invocation logic lives in skill frontmatter.

// Category display order and labels for tools/list
const CATEGORY_ORDER = ["secrets", "analysis", "context", "review", "supply_chain", "general"];
const CATEGORY_LABEL = {
  secrets:      "Secret & Credential Scanning",
  analysis:     "Static Analysis",
  context:      "Code Context & Navigation",
  review:       "Code Review",
  supply_chain: "Supply Chain & Dependencies",
  general:      "General",
};

export class SkillDispatcher {
  constructor({ skills, rules }) {
    this.skills = skills; // Map<name, skill>
    this.rules  = rules;  // Array<{on, skills[]}>
  }

  // ── tools/list ──────────────────────────────────────────────────────────────
  // Returns MCP-spec tool list, grouped by category in a defined order.
  // Each tool includes: name, title, description, inputSchema, annotations.

  listTools() {
    const byCategory = new Map();

    for (const skill of this.skills.values()) {
      const cat = skill.category ?? "general";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(skill);
    }

    // Sort each category by tool name
    for (const group of byCategory.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name));
    }

    const tools = [];

    // Emit in defined category order, then any remaining categories alphabetically
    const ordered = [
      ...CATEGORY_ORDER.filter(c => byCategory.has(c)),
      ...[...byCategory.keys()].filter(c => !CATEGORY_ORDER.includes(c)).sort()
    ];

    for (const cat of ordered) {
      for (const skill of byCategory.get(cat)) {
        tools.push(skillToTool(skill));
      }
    }

    return tools;
  }

  // ── tools/call ──────────────────────────────────────────────────────────────
  // Resolves a skill call to an invokeLocal payload.
  // The MCP server NEVER runs WASM — it returns a module ref + args + caps
  // for the IDE plugin to execute locally.

  resolveToolCall(name, callArgs = {}) {
    const skill = this.skills.get(name);
    if (!skill) {
      const err = new Error(`Unknown tool: "${name}". Available: ${[...this.skills.keys()].join(", ")}`);
      err.code  = -32601;
      throw err;
    }

    // Merge skill defaults with caller-supplied args (caller wins)
    const mergedArgs = { ...skill.args, ...callArgs };

    return {
      content: [
        {
          type: "text",
          text: `Invoking ${skill.module}@${skill.version} locally via WASM plugin (read-only, no egress).`
        }
      ],
      _meta: {
        skill:       skill.name,
        category:    skill.category,
        invokeLocal: {
          module:  `${skill.module}@${skill.version}`,
          version: skill.version,
          sha256:  skill.sha256,
          export:  skill.exportName,
          args:    mergedArgs,
          caps:    skill.caps,
        }
      }
    };
  }

  // ── Rule-triggered skill list ───────────────────────────────────────────────
  // Returns skill names that fire on a given event (e.g. "pre-commit").

  skillsForEvent(eventName) {
    return this.rules
      .filter(rule => rule.on === eventName)
      .flatMap(rule => rule.skills ?? [])
      .filter(name => this.skills.has(name));
  }

  // ── Category summary ─────────────────────────────────────────────────────────
  // Useful for the initialize response or a listing endpoint.

  categorySummary() {
    const summary = {};
    for (const skill of this.skills.values()) {
      const cat = skill.category ?? "general";
      summary[cat] = (summary[cat] ?? 0) + 1;
    }
    return summary;
  }
}

// ── Internal: build MCP tool object from a parsed skill ──────────────────────

function skillToTool(skill) {
  return {
    name:        skill.name,
    title:       skill.title ?? skill.name,
    description: skill.description,
    inputSchema: skill.inputSchema,
    annotations: {
      // MCP 2025-06-18 standard annotations
      readOnlyHint:   true,   // all WASM scans are read-only; no workspace writes
      idempotentHint: true,   // same args → same result
      category:       skill.category ?? "general",
      categoryLabel:  CATEGORY_LABEL[skill.category] ?? "General",
      module:         `${skill.module}@${skill.version}`,
      when:           skill.when,
    }
  };
}
