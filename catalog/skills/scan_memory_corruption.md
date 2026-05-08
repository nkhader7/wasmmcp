---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, scheduled-scan
args:
  language: c,cpp,rust
  rules: p/security-audit
  severity: high+
  focus: memory-corruption
caps:
  - fs:read
export: scan
---

# Scan Memory Corruption

Run the local `semgrep@1.45` module over native-code surfaces for high-risk memory-safety patterns such as unsafe buffer handling and lifetime-sensitive code.
