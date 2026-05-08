# Trail of Bits Skill Map

This project adapts the public Trail of Bits skill marketplace into local MCP dispatcher skills.

The source catalog includes security, verification, development, reverse engineering, mobile, and infrastructure plugins. In this repository, a skill is only runnable when it can be represented as a local module invocation from `modules/index.json`.

## Converted As Runnable Skills

| Trail of Bits area | Local skill examples | Module family |
|---|---|---|
| Smart contract security | `tob_building_secure_contracts`, `tob_contract_entry_points` | `semgrep`, `tree-sitter` |
| Code auditing | `tob_audit_context`, `tob_fp_check`, `tob_insecure_defaults`, `tob_sharp_edges`, `tob_variant_analysis` | `semgrep`, `tree-sitter` |
| Static analysis workflows | `tob_static_analysis_semgrep`, `tob_semgrep_rule_context`, `tob_semgrep_rule_variant_context` | `semgrep`, `tree-sitter` |
| Testing and verification | `tob_mutation_testing_scope`, `tob_property_testing_targets`, `tob_spec_to_code_compliance` | `tree-sitter` |
| Native-code review | `tob_c_cpp_security_review`, `tob_zeroize_source_audit`, `tob_constant_time_analysis` | `semgrep` |
| Web, mobile, and supply chain discovery | `tob_burpsuite_project_discovery`, `tob_firebase_config_discovery`, `tob_supply_chain_manifest_audit` | `ripgrep` |
| Automation and infrastructure | `tob_agentic_actions_audit`, `tob_devcontainer_security_review`, `tob_kubernetes_context` | `semgrep` |
| Reverse engineering and malware context | `tob_dwarf_debug_info_discovery`, `tob_yara_rule_context` | `ripgrep` |

## Intentionally Scoped Down

Some Trail of Bits plugins require capabilities this architecture does not currently expose, such as external GitHub API lookups, CodeQL databases, YARA execution, APK unpacking, binary DWARF parsing, mutation engines, or external LLM CLIs.

Those were converted only when a local read-only discovery or context-building step was honest. No skill in this catalog adds network, write, shell, or ambient execution capabilities.
