export class SkillDispatcher {
  constructor({ skills, rules }) {
    this.skills = skills;
    this.rules = rules;
  }

  listTools() {
    return [...this.skills.values()].map((skill) => ({
      name: skill.name,
      title: skill.title,
      description: `Resolve local module ${skill.module}@${skill.version}`,
      inputSchema: {
        type: "object",
        additionalProperties: true
      }
    }));
  }

  resolveToolCall(name, args = {}) {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);

    return {
      content: [
        {
          type: "text",
          text: `Invoke local module ${skill.module}@${skill.version}`
        }
      ],
      _meta: {
        invokeLocal: {
          module: `${skill.module}@${skill.version}`,
          version: skill.version,
          sha256: skill.sha256,
          export: skill.exportName,
          args: { ...skill.args, ...args },
          caps: skill.caps
        }
      }
    };
  }

  skillsForEvent(eventName) {
    return this.rules
      .filter((rule) => rule.on === eventName)
      .flatMap((rule) => rule.skills ?? []);
  }
}
