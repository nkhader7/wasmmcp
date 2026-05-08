use std::fs;
use std::path::Path;
use crate::rules::RuleEngine;
use crate::types::Finding;

const MAX_FILE_BYTES: u64 = 1024 * 1024; // 1 MB — matches workspace-reader.js

pub struct Scanner<'a> {
    engine: &'a RuleEngine,
    redact: bool,
}

impl<'a> Scanner<'a> {
    pub fn new(engine: &'a RuleEngine, redact: bool) -> Self {
        Self { engine, redact }
    }

    pub fn scan_directory(&self, root: &str) -> (Vec<Finding>, u64) {
        let mut findings = Vec::new();
        let mut file_count = 0u64;
        self.walk(Path::new(root), root, &mut findings, &mut file_count);
        (findings, file_count)
    }

    pub fn scan_stdin(&self) -> Vec<Finding> {
        use std::io::Read;
        let mut text = String::new();
        std::io::stdin().read_to_string(&mut text).unwrap_or(0);
        self.engine.scan_text("<stdin>", &text, self.redact)
    }

    fn walk(&self, path: &Path, root: &str, findings: &mut Vec<Finding>, count: &mut u64) {
        let dir = match fs::read_dir(path) {
            Ok(d) => d,
            Err(_) => return,
        };

        for entry in dir.flatten() {
            let entry_path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if meta.is_symlink() { continue; }

            if meta.is_dir() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if matches!(name.as_ref(), ".git" | "node_modules" | "vendor" | "target") {
                    continue;
                }
                self.walk(&entry_path, root, findings, count);
                continue;
            }

            if !meta.is_file() { continue; }
            if meta.len() > MAX_FILE_BYTES { continue; }

            // Build guest path relative to root
            let rel = entry_path.strip_prefix(root).unwrap_or(&entry_path);
            let guest_path = format!("/workspace/{}", rel.to_string_lossy().replace('\\', "/"));

            if self.engine.is_path_allowed(&guest_path) { continue; }

            let text = match fs::read_to_string(&entry_path) {
                Ok(t) => t,
                Err(_) => continue, // binary or unreadable
            };

            *count += 1;
            findings.extend(self.engine.scan_text(&guest_path, &text, self.redact));
        }
    }
}
