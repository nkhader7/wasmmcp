#!/usr/bin/env python3
"""Dependency-free stdio MCP dispatcher for Windsurf local config.

This server mirrors src/mcp/server.js. It only resolves skills to local module
references; it never reads workspace source and never runs WASM.
"""

from __future__ import annotations

import json
import pathlib
import sys
from dataclasses import dataclass
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[2]
PROTOCOL_VERSION = "2025-06-18"
SERVER_VERSION = "0.3.0"


@dataclass(frozen=True)
class Skill:
    name: str
    title: str
    module: str
    version: str
    sha256: str
    when: list[str]
    args: dict[str, Any]
    caps: list[str]
    export_name: str


class RpcError(Exception):
    def __init__(self, message: str, code: int = -32000) -> None:
        super().__init__(message)
        self.code = code


def main() -> None:
    dispatcher = SkillDispatcher(
        skills=load_skills(ROOT / "catalog" / "skills"),
        rules=load_rules(ROOT / "catalog" / "rules"),
    )

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        handle_line(line, dispatcher)


def handle_line(line: str, dispatcher: "SkillDispatcher") -> None:
    try:
        request = json.loads(line)
    except json.JSONDecodeError:
        write({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
        return

    if "id" not in request or request.get("method") == "notifications/initialized":
        return

    try:
        result = route(request.get("method"), request.get("params") or {}, dispatcher)
        write({"jsonrpc": "2.0", "id": request["id"], "result": result})
    except RpcError as error:
        write({"jsonrpc": "2.0", "id": request["id"], "error": {"code": error.code, "message": str(error)}})
    except Exception as error:  # pragma: no cover - defensive JSON-RPC boundary
        write({"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32000, "message": str(error)}})


def route(method: str | None, params: dict[str, Any], dispatcher: "SkillDispatcher") -> dict[str, Any]:
    if method == "initialize":
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {"name": "wasmmcp-dispatcher", "version": SERVER_VERSION},
            "capabilities": {"tools": {"listChanged": True}},
        }

    if method == "tools/list":
        return {"tools": dispatcher.list_tools()}

    if method == "tools/call":
        name = params.get("name")
        if not name:
            raise RpcError("params.name is required", -32602)
        result = dispatcher.resolve_tool_call(name, params.get("arguments") or {})
        progress_token = (params.get("_meta") or {}).get("progressToken")
        if progress_token:
            result["_meta"]["progressToken"] = progress_token
        return result

    if method in {"resources/read", "resources/list"}:
        return {"resources": []}

    raise RpcError(f"Method not found: {method}", -32601)


class SkillDispatcher:
    def __init__(self, skills: dict[str, Skill], rules: list[dict[str, Any]]) -> None:
        self.skills = skills
        self.rules = rules

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": skill.name,
                "title": skill.title,
                "description": f"Resolve local module {skill.module}@{skill.version}",
                "inputSchema": {"type": "object", "additionalProperties": True},
            }
            for skill in self.skills.values()
        ]

    def resolve_tool_call(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        skill = self.skills.get(name)
        if skill is None:
            raise RpcError(f"Unknown skill: {name}")

        merged_args = dict(skill.args)
        merged_args.update(args)
        return {
            "content": [{"type": "text", "text": f"Invoke local module {skill.module}@{skill.version}"}],
            "_meta": {
                "invokeLocal": {
                    "module": f"{skill.module}@{skill.version}",
                    "version": skill.version,
                    "sha256": skill.sha256,
                    "export": skill.export_name,
                    "args": merged_args,
                    "caps": skill.caps,
                }
            },
        }


def load_skills(skills_dir: pathlib.Path) -> dict[str, Skill]:
    return {
        skill.name: skill
        for skill in (parse_skill(path) for path in sorted(skills_dir.glob("*.md")) if is_skill_file(path.name))
    }


def is_skill_file(file_name: str) -> bool:
    normalized = file_name.lower()
    return (
        normalized.endswith(".md")
        and normalized != "readme.md"
        and normalized != "skill_template.md"
        and not normalized.startswith("_")
    )


def load_rules(rules_dir: pathlib.Path) -> list[dict[str, Any]]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(rules_dir.glob("*.json"))]


def parse_skill(path: pathlib.Path) -> Skill:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise RpcError(f"Skill {path.name} is missing frontmatter")

    _, frontmatter, body = text.split("---", 2)
    meta = parse_frontmatter(frontmatter)
    module_ref = str(meta.get("module", ""))
    if "@" not in module_ref:
        raise RpcError(f"Skill {path.name} must reference module as name@version")

    module, version = module_ref.split("@", 1)
    return Skill(
        name=path.stem,
        title=extract_title(body),
        module=module,
        version=version,
        sha256=str(meta.get("sha256", "")),
        when=split_csv(meta.get("when", "")),
        args=meta.get("args") or {},
        caps=meta.get("caps") or [],
        export_name=str(meta.get("export", "")),
    )


def parse_frontmatter(text: str) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, Any]] = [(-1, root)]
    lines = text.splitlines()

    for index, raw in enumerate(lines):
        if not raw.strip():
            continue

        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        parent = stack[-1][1]
        if line.startswith("- "):
            if not isinstance(parent, list):
                raise RpcError(f"Unexpected list item: {line}")
            parent.append(parse_scalar(line[2:]))
            continue

        key, separator, value_text = line.partition(":")
        if not separator:
            raise RpcError(f"Invalid frontmatter line: {line}")

        key = key.strip()
        value_text = value_text.strip()
        if value_text:
            parent[key] = parse_scalar(value_text)
            continue

        next_line = next((candidate.strip() for candidate in lines[index + 1 :] if candidate.strip()), "")
        container: list[Any] | dict[str, Any] = [] if next_line.startswith("- ") else {}
        parent[key] = container
        stack.append((indent, container))

    return root


def parse_scalar(value: str) -> Any:
    if value == "true":
        return True
    if value == "false":
        return False
    if value.lstrip("-").isdigit():
        return int(value)
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    return value


def split_csv(value: Any) -> list[str]:
    return [item.strip() for item in str(value).split(",") if item.strip()]


def extract_title(body: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "Untitled Skill"


def write(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
