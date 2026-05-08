mod rules;
mod scanner;
mod types;

use std::time::Instant;
use types::{Config, ScanArgs};
use rules::RuleEngine;
use scanner::Scanner;

// Built-in rule config — embed gitleaks.toml at compile time.
// At runtime, GITLEAKS_CONFIG env var overrides with an alternate path.
const BUILTIN_CONFIG: &str = include_str!("../gitleaks.toml");

fn main() {
    let args = parse_args();

    // Load config: env override first, then built-in
    let config_text = match &args.config {
        Some(path) => std::fs::read_to_string(path).unwrap_or_else(|_| {
            eprintln!("[gitleaks-wasm] could not read GITLEAKS_CONFIG={path}, using built-in rules");
            BUILTIN_CONFIG.to_string()
        }),
        None => BUILTIN_CONFIG.to_string(),
    };

    let config: Config = match toml::from_str(&config_text) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[gitleaks-wasm] config parse error: {e}");
            std::process::exit(2);
        }
    };

    let engine  = RuleEngine::compile(&config);
    let scanner = Scanner::new(&engine, args.redact);
    let started = Instant::now();

    let (findings, files_scanned) = if args.staged {
        (scanner.scan_stdin(), 0)
    } else {
        scanner.scan_directory(&args.source)
    };

    let duration_ms = started.elapsed().as_millis() as u64;

    let exit_code = if findings.is_empty() { 0 } else { 1 };

    let output = serde_json::json!({
        "findings":      findings,
        "filesScanned":  files_scanned,
        "durationMs":    duration_ms
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    std::process::exit(exit_code);
}

fn parse_args() -> ScanArgs {
    let argv: Vec<String> = std::env::args().collect();
    let mut a = ScanArgs {
        source:  "/workspace".to_string(),
        redact:  false,
        staged:  false,
        no_git:  false,
        severity: "low+".to_string(),
        config:  std::env::var("GITLEAKS_CONFIG").ok(),
    };

    let mut i = 1;
    while i < argv.len() {
        match argv[i].as_str() {
            "--source" | "-s" => {
                i += 1;
                if let Some(v) = argv.get(i) { a.source = v.clone(); }
            }
            "--redact" => a.redact = true,
            "--staged"  => a.staged = true,
            "--no-git"  => a.no_git = true,
            "--report-format" => { i += 1; /* always json */ }
            "--severity" => {
                i += 1;
                if let Some(v) = argv.get(i) { a.severity = v.clone(); }
            }
            "--config" | "-c" => {
                i += 1;
                if let Some(v) = argv.get(i) { a.config = Some(v.clone()); }
            }
            _ => {}
        }
        i += 1;
    }
    a
}
