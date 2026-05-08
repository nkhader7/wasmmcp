export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  rule:             string;
  severity:         Severity;
  path:             string;   // host-absolute path
  line:             number;
  redactedSnippet?: string;
  commit?:          string;
  fingerprint?:     string;
}

export interface ScanResult {
  findings:   Finding[];
  summary:    string;
  _meta: {
    durationMs:    number;
    filesScanned:  number;
    fuelConsumed?: number;
  };
}

export type ExportName = "scan_repo" | "scan_diff" | "grep";

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4
};
