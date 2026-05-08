import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFindings } from "../src/plugin/findings-renderer.js";

const SAMPLE_FINDINGS = [
  { rule: "aws-access-token",   severity: "critical", path: "config/prod.env",          line: 14, redactedSnippet: "AWS_KEY=AKIA****************" },
  { rule: "generic-api-key",    severity: "low",      path: "src/integrations/stripe.ts", line: 42, redactedSnippet: "STRIPE_KEY=sk_live_***" },
  { rule: "private-key",        severity: "critical", path: ".env.example",              line: 3,  redactedSnippet: "-----BEGIN PRIVATE KEY-----" }
];

test("renderFindings returns isError false", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS, _meta: { durationMs: 1376, filesScanned: 100 } });
  assert.equal(result.isError, false);
});

test("first content item is text with finding count", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS });
  const text = result.content[0];
  assert.equal(text.type, "text");
  assert.match(text.text, /3 secret finding/);
});

test("text summary mentions critical and low counts", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS });
  const text = result.content[0].text;
  assert.match(text, /2 critical/);
  assert.match(text, /1 low/);
});

test("second content item is a resource when findings exist", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS });
  const resource = result.content[1];
  assert.equal(resource.type, "resource");
  assert.match(resource.resource.uri, /^mcp:\/\/findings\//);
  assert.equal(resource.resource.mimeType, "application/json");
});

test("no resource content when no findings", () => {
  const result = renderFindings({ findings: [], _meta: {} });
  assert.equal(result.content.length, 1);
  assert.match(result.content[0].text, /No secrets found/);
});

test("_meta carries durationMs and findingCount", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS, _meta: { durationMs: 500 } });
  assert.equal(result._meta.durationMs, 500);
  assert.equal(result._meta.findingCount, 3);
});

test("follow-up hint mentions rotation checklist for critical", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS });
  assert.match(result.content[0].text, /rotation checklist/);
});

test("severities are sorted critical → low in table", () => {
  const result = renderFindings({ findings: SAMPLE_FINDINGS });
  const text = result.content[0].text;
  const critIdx = text.indexOf("CRITICAL");
  const lowIdx  = text.indexOf("LOW");
  assert.ok(critIdx < lowIdx, "critical should appear before low");
});
