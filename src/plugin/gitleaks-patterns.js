// Patterns derived from gitleaks v8.30.1 rule definitions.
// Each entry maps to one [[rules]] block. Regex translated from PCRE/Go RE2 to JS.
// severity is assigned by impact tier, not present in upstream config.

export const PATTERNS = [
  // ── AWS ─────────────────────────────────────────────────────────────────────
  {
    id: "aws-access-token",
    description: "AWS access key ID (AKIA/ASIA/ABIA/ACCA prefix)",
    severity: "critical",
    regex: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g,
    keywords: ["akia", "asia", "abia", "acca", "a3t"],
    entropy: 3.0
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  {
    id: "anthropic-api-key",
    description: "Anthropic API key",
    severity: "critical",
    regex: /\b(sk-ant-api03-[A-Za-z0-9_-]{93}AA)\b/g,
    keywords: ["sk-ant-api03"],
    entropy: 0
  },
  {
    id: "anthropic-admin-api-key",
    description: "Anthropic Admin API key",
    severity: "critical",
    regex: /\b(sk-ant-admin01-[A-Za-z0-9_-]{93}AA)\b/g,
    keywords: ["sk-ant-admin01"],
    entropy: 0
  },

  // ── GitHub ───────────────────────────────────────────────────────────────────
  {
    id: "github-pat",
    description: "GitHub personal access token (classic)",
    severity: "high",
    regex: /\b(ghp_[A-Za-z0-9]{36})\b/g,
    keywords: ["ghp_"],
    entropy: 0
  },
  {
    id: "github-fine-grained-pat",
    description: "GitHub fine-grained personal access token",
    severity: "high",
    regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/g,
    keywords: ["github_pat_"],
    entropy: 0
  },
  {
    id: "github-oauth",
    description: "GitHub OAuth access token",
    severity: "high",
    regex: /\b(gho_[A-Za-z0-9]{36})\b/g,
    keywords: ["gho_"],
    entropy: 0
  },
  {
    id: "github-app-token",
    description: "GitHub App installation or user-to-server token",
    severity: "high",
    regex: /\b(ghu_[A-Za-z0-9]{76}|ghs_[A-Za-z0-9]{36})\b/g,
    keywords: ["ghu_", "ghs_"],
    entropy: 0
  },

  // ── OpenAI ───────────────────────────────────────────────────────────────────
  {
    id: "openai-api-key",
    description: "OpenAI API key",
    severity: "high",
    regex: /\b(sk-(?:proj-)?[A-Za-z0-9]{48,})\b/g,
    keywords: ["sk-proj-", "sk-"],
    entropy: 4.0
  },

  // ── Stripe ───────────────────────────────────────────────────────────────────
  {
    id: "stripe-live-secret-key",
    description: "Stripe live secret key",
    severity: "critical",
    regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,
    keywords: ["sk_live_"],
    entropy: 0
  },
  {
    id: "stripe-restricted-key",
    description: "Stripe restricted API key",
    severity: "high",
    regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/g,
    keywords: ["rk_live_"],
    entropy: 0
  },

  // ── Google ───────────────────────────────────────────────────────────────────
  {
    id: "google-api-key",
    description: "Google API key",
    severity: "high",
    regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
    keywords: ["aiza"],
    entropy: 0
  },
  {
    id: "google-oauth-access-token",
    description: "Google OAuth access token",
    severity: "high",
    regex: /\b(ya29\.[A-Za-z0-9_-]{20,})\b/g,
    keywords: ["ya29."],
    entropy: 0
  },

  // ── Azure ────────────────────────────────────────────────────────────────────
  {
    id: "azure-ad-client-secret",
    description: "Azure AD client secret (Q~ suffix pattern)",
    severity: "high",
    regex: /(?:^|[\s>=:(,])([A-Za-z0-9_~.]{3}\dQ~[A-Za-z0-9_~.-]{31,34})(?:$|[\s<),])/gm,
    keywords: ["q~"],
    entropy: 3.0
  },

  // ── Slack ────────────────────────────────────────────────────────────────────
  {
    id: "slack-bot-token",
    description: "Slack bot token",
    severity: "high",
    regex: /\b(xoxb-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{24})\b/g,
    keywords: ["xoxb-"],
    entropy: 0
  },
  {
    id: "slack-user-token",
    description: "Slack user token",
    severity: "high",
    regex: /\b(xoxp-[0-9]{10,12}-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{32})\b/g,
    keywords: ["xoxp-"],
    entropy: 0
  },
  {
    id: "slack-app-token",
    description: "Slack app-level token",
    severity: "medium",
    regex: /\b(xapp-\d-[A-Z0-9]+-\d+-[a-f0-9]+)\b/g,
    keywords: ["xapp-"],
    entropy: 0
  },

  // ── SendGrid ─────────────────────────────────────────────────────────────────
  {
    id: "sendgrid-api-token",
    description: "SendGrid API token",
    severity: "high",
    regex: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,
    keywords: ["sg."],
    entropy: 0
  },

  // ── Alibaba ──────────────────────────────────────────────────────────────────
  {
    id: "alibaba-access-key-id",
    description: "Alibaba Cloud AccessKey ID",
    severity: "high",
    regex: /\b(LTAI[A-Za-z0-9]{20})\b/g,
    keywords: ["ltai"],
    entropy: 2.0
  },

  // ── Artifactory ──────────────────────────────────────────────────────────────
  {
    id: "artifactory-api-key",
    description: "Artifactory API key",
    severity: "high",
    regex: /\bAKCp[A-Za-z0-9]{69}\b/g,
    keywords: ["akcp"],
    entropy: 4.5
  },

  // ── Private Keys (PEM) ───────────────────────────────────────────────────────
  {
    id: "private-key",
    description: "PEM private key block",
    severity: "critical",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?:----- BLOCK)?-----/g,
    keywords: ["begin rsa private key", "begin ec private key", "begin openssh private key", "begin private key"],
    entropy: 0
  },

  // ── JWT ──────────────────────────────────────────────────────────────────────
  {
    id: "jwt",
    description: "JSON Web Token (header.payload.signature)",
    severity: "medium",
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    keywords: ["eyj"],
    entropy: 0
  },

  // ── Airtable ─────────────────────────────────────────────────────────────────
  {
    id: "airtable-personal-access-token",
    description: "Airtable personal access token",
    severity: "medium",
    regex: /\b(pat[A-Za-z0-9]{14}\.[a-f0-9]{64})\b/g,
    keywords: ["airtable", "pat"],
    entropy: 0
  },

  // ── Cloudflare ───────────────────────────────────────────────────────────────
  {
    id: "cloudflare-api-key",
    description: "Cloudflare API key (context-based)",
    severity: "high",
    regex: /(?i:cloudflare)[\s\S]{0,30}?(?:=|:|=>)\s*["']?([a-z0-9_-]{40})["']?/gi,
    keywords: ["cloudflare"],
    entropy: 2.0
  },

  // ── Database URLs ────────────────────────────────────────────────────────────
  {
    id: "postgres-connection-string",
    description: "PostgreSQL connection string with credentials",
    severity: "high",
    regex: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@[^\s]+/gi,
    keywords: ["postgres://", "postgresql://"],
    entropy: 0
  },
  {
    id: "mysql-connection-string",
    description: "MySQL connection string with credentials",
    severity: "high",
    regex: /mysql:\/\/[^:@\s]+:[^@\s]+@[^\s]+/gi,
    keywords: ["mysql://"],
    entropy: 0
  },

  // ── Generic context-based ────────────────────────────────────────────────────
  {
    id: "generic-api-key",
    description: "Generic API key or secret in assignment context",
    severity: "low",
    regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|bearer[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi,
    keywords: ["api_key", "api-key", "apikey", "access_token", "auth_token"],
    entropy: 3.0
  },
  {
    id: "generic-secret",
    description: "Generic secret or password in assignment context",
    severity: "low",
    regex: /(?:password|passwd|secret|credential)\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
    keywords: ["password", "passwd", "secret", "credential"],
    entropy: 3.5
  }
];

// Global allowlist path patterns (from gitleaks.toml [allowlist].paths)
export const ALLOWLIST_PATHS = [
  /gitleaks\.toml$/,
  /\.(?:bmp|gif|jpe?g|png|svg|tiff?)$/i,
  /\.(?:eot|[ot]tf|woff2?)$/i,
  /\.(?:docx?|xlsx?|pdf|bin|dll|pdb|exe|gltf)$/i,
  /go\.(?:mod|sum)$/,
  /(?:^|\/)vendor\//,
  /(?:^|\/)node_modules\//,
  /(?:^|\/)(?:package-lock|yarn\.lock|pnpm-lock\.yaml)$/,
  /(?:^|\/)\.git(?:\/|$)/
];

// Global allowlist regexes (from gitleaks.toml [allowlist].regexes)
export const ALLOWLIST_VALUE_REGEXES = [
  /^(?:true|false|null)$/i,
  /^\$(?:[A-Z_]+|[a-z_]+)$/,
  /^\$\{(?:[A-Z_]+|[a-z_]+)\}$/,
  /^\{\{[\w ().|]+\}\}$/,
  /^%(?:[A-Z_]+|[a-z_]+)%$/
];

export function shannonEntropy(str) {
  if (!str) return 0;
  const freq = {};
  for (const c of str) freq[c] = (freq[c] ?? 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((sum, n) => {
    const p = n / len;
    return sum + p * Math.log2(p);
  }, 0);
}
