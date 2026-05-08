use serde::{Deserialize, Serialize};

// ── Config types (parsed from gitleaks.toml) ─────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub allowlist: Allowlist,
    #[serde(default)]
    pub rules: Vec<Rule>,
    #[serde(default)]
    pub stopwords: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct Allowlist {
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub regexes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct Rule {
    pub id: String,
    pub description: String,
    pub regex: String,
    #[serde(default)]
    pub entropy: f64,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub allowlists: Vec<RuleAllowlist>,
}

#[derive(Debug, Deserialize, Default)]
pub struct RuleAllowlist {
    #[serde(default)]
    pub regexes: Vec<String>,
}

// ── Finding (matches gitleaks JSON output shape) ──────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Finding {
    pub rule_id:     String,
    pub description: String,
    pub severity:    String,
    pub file:        String,
    pub start_line:  usize,
    pub end_line:    usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret:      Option<String>,
    pub fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_field: Option<String>,
}

// ── Scan args (from CLI argv) ─────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct ScanArgs {
    pub source:    String,
    pub redact:    bool,
    pub staged:    bool,
    pub severity:  String,
    pub no_git:    bool,
    pub config:    Option<String>,
}
