use regex::Regex;
use crate::types::{Config, Finding, Rule};

pub struct CompiledRule {
    pub id:          String,
    pub description: String,
    pub pattern:     Regex,
    pub entropy:     f64,
    pub keywords:    Vec<String>,
    pub deny_regex:  Vec<Regex>,
}

pub struct RuleEngine {
    pub rules:            Vec<CompiledRule>,
    pub path_allowlist:   Vec<Regex>,
    pub value_allowlist:  Vec<Regex>,
}

impl RuleEngine {
    pub fn compile(config: &Config) -> Self {
        let rules = config
            .rules
            .iter()
            .filter_map(|r| compile_rule(r))
            .collect();

        let path_allowlist = config
            .allowlist
            .paths
            .iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();

        let value_allowlist = config
            .allowlist
            .regexes
            .iter()
            .filter_map(|r| Regex::new(r).ok())
            .collect();

        Self { rules, path_allowlist, value_allowlist }
    }

    pub fn is_path_allowed(&self, path: &str) -> bool {
        self.path_allowlist.iter().any(|r| r.is_match(path))
    }

    pub fn scan_text(&self, path: &str, text: &str, redact: bool) -> Vec<Finding> {
        let mut findings = Vec::new();
        let lines: Vec<&str> = text.lines().collect();

        for rule in &self.rules {
            // Quick keyword pre-filter
            if !rule.keywords.is_empty() {
                let lower = text.to_lowercase();
                if !rule.keywords.iter().any(|k| lower.contains(k.as_str())) {
                    continue;
                }
            }

            for m in rule.pattern.find_iter(text) {
                let secret = m.as_str().to_string();

                // Entropy gate
                if rule.entropy > 0.0 && shannon_entropy(&secret) < rule.entropy {
                    continue;
                }

                // Global value allowlist
                if self.value_allowlist.iter().any(|r| r.is_match(&secret)) {
                    continue;
                }

                // Per-rule allowlist
                if rule.deny_regex.iter().any(|r| r.is_match(&secret)) {
                    continue;
                }

                // Find line number (1-based)
                let before = &text[..m.start()];
                let line_num = before.chars().filter(|&c| c == '\n').count() + 1;
                let line_text = lines.get(line_num.saturating_sub(1)).copied().unwrap_or("");

                let displayed = if redact {
                    redact_secret(line_text, &secret)
                } else {
                    line_text.trim().to_string()
                };

                let fingerprint = format!("{}:{}:{}", path, rule.id, line_num);

                findings.push(Finding {
                    rule_id:     rule.id.clone(),
                    description: rule.description.clone(),
                    severity:    "high".to_string(), // gitleaks.toml lacks severity; default high
                    file:        path.to_string(),
                    start_line:  line_num,
                    end_line:    line_num,
                    secret:      if redact { Some("REDACTED".to_string()) } else { Some(secret) },
                    fingerprint,
                    match_field: Some(displayed),
                });
            }
        }

        findings
    }
}

fn compile_rule(rule: &Rule) -> Option<CompiledRule> {
    let pattern = Regex::new(&rule.regex).ok()?;
    let deny_regex = rule
        .allowlists
        .iter()
        .flat_map(|al| al.regexes.iter())
        .filter_map(|r| Regex::new(r).ok())
        .collect();

    Some(CompiledRule {
        id:          rule.id.clone(),
        description: rule.description.clone(),
        pattern,
        entropy:     rule.entropy,
        keywords:    rule.keywords.iter().map(|k| k.to_lowercase()).collect(),
        deny_regex,
    })
}

pub fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() { return 0.0; }
    let mut freq = std::collections::HashMap::new();
    for c in s.chars() {
        *freq.entry(c).or_insert(0u32) += 1;
    }
    let len = s.chars().count() as f64;
    freq.values().fold(0.0, |acc, &n| {
        let p = n as f64 / len;
        acc - p * p.log2()
    })
}

fn redact_secret(line: &str, secret: &str) -> String {
    let stars = "*".repeat(secret.len().min(20));
    line.replacen(secret, &stars, 1).trim().to_string()
}
