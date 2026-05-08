---
name: review__validate_findings
category: review
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Validates and deduplicates security findings from earlier analysis passes. Runs a targeted semgrep re-scan on reported locations to confirm true positives, assign confidence scores, and filter suppressible false positives.
when: post-audit, review
args:
  path: /workspace
  language: auto
  rules: p/security-audit
  severity: medium+
  focus: validation
caps:
  - fs:read
export: scan
---

# Validate Security Findings

Runs `semgrep@1.45` in validation mode against locations flagged by earlier scans. Produces a deduplicated, confidence-scored finding set. Each finding is classified as: confirmed, likely-fp, or needs-manual-review.

Use after `analysis__security_audit` or `analysis__injection_flaws` to filter noise before presenting results to the developer.
