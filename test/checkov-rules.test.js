import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOV_ALL_RESOURCE_RULESET,
  CHECKOV_ALL_RESOURCE_SCAN_RULES,
  findCheckovRulesForLine,
  inferIacTypeFromPath
} from "../src/rules/checkov-all-resource-scans.js";

test("Checkov all-resource-scans rules are code-backed", () => {
  assert.equal(CHECKOV_ALL_RESOURCE_RULESET.name, "checkov/all-resource-scans");
  assert.equal(CHECKOV_ALL_RESOURCE_SCAN_RULES.length, 7972);
});

test("Checkov rule matcher maps Terraform entities to policy metadata", () => {
  const matches = findCheckovRulesForLine('resource "aws_s3_bucket" "bucket" {', {
    iacType: inferIacTypeFromPath("main.tf")
  });

  assert.ok(matches.some((rule) => rule.entity === "aws_s3_bucket"));
  assert.ok(matches.every((rule) => rule.id.startsWith("CKV")));
});
