import { promises as fs } from "node:fs";

export async function loadManifest(manifestPath) {
  const text = await fs.readFile(manifestPath, "utf8");
  return parseTomlSubset(text);
}

function parseTomlSubset(text) {
  const root = {};
  let current = root;
  let pendingArray = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (pendingArray) {
      if (line === "]") {
        pendingArray = null;
        continue;
      }
      pendingArray.target.push(cleanValue(line.replace(/,$/, "")));
      continue;
    }

    const section = line.match(/^\[(.+)]$/);
    if (section) {
      current = root;
      for (const part of section[1].split(".")) {
        current[part] ??= {};
        current = current[part];
      }
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) throw new Error(`Invalid manifest line: ${line}`);

    const key = line.slice(0, separator).trim();
    const valueText = line.slice(separator + 1).trim();

    if (valueText === "[") {
      current[key] = [];
      pendingArray = { target: current[key] };
    } else if (valueText.startsWith("[") && valueText.endsWith("]")) {
      current[key] = valueText
        .slice(1, -1)
        .split(",")
        .map((value) => cleanValue(value.trim()))
        .filter((value) => value !== "");
    } else {
      current[key] = cleanValue(valueText);
    }
  }

  return root;
}

function cleanValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
