"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitleaksPanel = void 0;
const vscode = require("vscode");
const crypto = require("crypto");

class GitleaksPanel {
  constructor(panel, extensionUri) {
    this._panel       = panel;
    this._extensionUri = extensionUri;
    this._findings    = [];
    this._meta        = {};
    this._disposables = [];

    this._panel.webview.html = this._html(this._panel.webview, []);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => this._onMessage(msg), null, this._disposables);
  }

  static createOrShow(extensionUri) {
    const col = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (GitleaksPanel.current) { GitleaksPanel.current._panel.reveal(col); return GitleaksPanel.current; }
    const panel = vscode.window.createWebviewPanel(
      "gitleaksScanner", "Gitleaks Scanner",
      { viewColumn: col, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    GitleaksPanel.current = new GitleaksPanel(panel, extensionUri);
    return GitleaksPanel.current;
  }

  setScanning(isScanning) {
    this._panel.webview.postMessage({ type: "scanning", value: isScanning });
  }

  setProgress(message, progress, total) {
    this._panel.webview.postMessage({ type: "progress", message, progress, total });
  }

  updateFindings(findings, meta) {
    this._findings = findings;
    this._meta     = meta ?? {};
    this._panel.webview.postMessage({ type: "findings", findings, meta: this._meta });
  }

  setError(message) {
    this._panel.webview.postMessage({ type: "error", message });
  }

  _onMessage(msg) {
    if (msg.type === "scan")  vscode.commands.executeCommand("gitleaksWasm.scan");
    if (msg.type === "open")  vscode.commands.executeCommand("vscode.open",
      vscode.Uri.file(msg.path),
      { selection: new vscode.Range(Math.max(0, msg.line - 1), 0, Math.max(0, msg.line - 1), 999) }
    );
    if (msg.type === "copy")  vscode.env.clipboard.writeText(JSON.stringify(this._findings, null, 2))
      .then(() => vscode.window.showInformationMessage("Findings copied to clipboard."));
    if (msg.type === "clear") vscode.commands.executeCommand("gitleaksWasm.clearResults");
  }

  dispose() {
    GitleaksPanel.current = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  _html(webview, findings) {
    const nonce = crypto.randomBytes(16).toString("hex");
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Gitleaks Scanner</title>
<style nonce="${nonce}">
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        var(--vscode-editor-background);
    --bg2:       var(--vscode-sideBar-background, #1e1e2e);
    --bg3:       var(--vscode-editorWidget-background, #252537);
    --border:    var(--vscode-panel-border, #3c3c5a);
    --fg:        var(--vscode-editor-foreground, #cdd6f4);
    --fg2:       var(--vscode-descriptionForeground, #a6adc8);
    --fg3:       var(--vscode-disabledForeground, #6c7086);
    --accent:    var(--vscode-button-background, #6c91f5);
    --accent-fg: var(--vscode-button-foreground, #ffffff);
    --mono:      var(--vscode-editor-font-family, 'Cascadia Code', 'JetBrains Mono', monospace);
    --sans:      var(--vscode-font-family, system-ui, sans-serif);
    --radius:    4px;

    --c-critical: #f38ba8;
    --c-high:     #fab387;
    --c-medium:   #f9e2af;
    --c-low:      #89dceb;
    --c-info:     #a6adc8;
    --bg-critical: rgba(243,139,168,.12);
    --bg-high:     rgba(250,179,135,.10);
    --bg-medium:   rgba(249,226,175,.08);
    --bg-low:      rgba(137,220,235,.07);
  }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── HEADER ──────────────────────────────────────────────────────────────── */
  .header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -.3px;
  }
  .shield-icon { font-size: 18px; }
  .header-meta { color: var(--fg2); font-size: 12px; margin-top: 2px; font-family: var(--mono); }
  .header-actions { margin-left: auto; display: flex; gap: 8px; }
  button {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: var(--radius);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: opacity .15s;
  }
  button:hover  { opacity: .85; }
  button:active { opacity: .7; }
  button.secondary {
    background: transparent;
    color: var(--fg2);
    border: 1px solid var(--border);
  }
  button:disabled { opacity: .4; cursor: default; }

  /* ── SUMMARY CARDS ───────────────────────────────────────────────────────── */
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    border-bottom: 1px solid var(--border);
  }
  .summary-card {
    padding: 14px 20px;
    border-right: 1px solid var(--border);
    cursor: pointer;
    transition: background .12s;
  }
  .summary-card:last-child { border-right: 0; }
  .summary-card:hover, .summary-card.active { background: var(--bg3); }
  .summary-card .count {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    line-height: 1;
  }
  .summary-card .label { font-size: 11px; color: var(--fg2); text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }
  .card-critical .count { color: var(--c-critical); }
  .card-high     .count { color: var(--c-high); }
  .card-medium   .count { color: var(--c-medium); }
  .card-low      .count { color: var(--c-low); }

  /* ── TOOLBAR ─────────────────────────────────────────────────────────────── */
  .toolbar {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 8px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .filter-label { font-size: 11px; color: var(--fg3); text-transform: uppercase; letter-spacing: .08em; }
  .filter-group { display: flex; gap: 4px; }
  .filter-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg2);
    padding: 3px 10px;
    font-size: 11px;
    border-radius: 20px;
  }
  .filter-btn.active {
    border-color: var(--accent);
    color: var(--fg);
    background: rgba(108,145,245,.15);
  }
  .search-wrap { margin-left: auto; }
  #search {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg);
    font-size: 12px;
    padding: 4px 10px;
    width: 220px;
    outline: none;
  }
  #search:focus { border-color: var(--accent); }
  #search::placeholder { color: var(--fg3); }

  /* ── PROGRESS ────────────────────────────────────────────────────────────── */
  .progress-wrap {
    padding: 12px 20px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    display: none;
  }
  .progress-wrap.visible { display: block; }
  .progress-bar-track { background: var(--bg3); border-radius: 2px; height: 4px; overflow: hidden; margin-top: 6px; }
  .progress-bar-fill  { background: var(--accent); height: 100%; border-radius: 2px; transition: width .2s; width: 0; }
  .progress-msg { font-size: 12px; color: var(--fg2); font-family: var(--mono); }

  /* ── CONTENT ─────────────────────────────────────────────────────────────── */
  .content { flex: 1; overflow: auto; }

  /* empty / error states */
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 12px;
    color: var(--fg3);
    text-align: center;
  }
  .state-icon { font-size: 48px; opacity: .4; }
  .state h2 { font-size: 16px; font-weight: 600; color: var(--fg2); }
  .state p  { font-size: 13px; max-width: 360px; }
  .state button { margin-top: 8px; }

  /* file groups */
  .file-group { border-bottom: 1px solid var(--border); }
  .file-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    background: var(--bg2);
    cursor: pointer;
    user-select: none;
    font-size: 12px;
    font-family: var(--mono);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .file-header:hover { background: var(--bg3); }
  .file-chevron { color: var(--fg3); font-size: 10px; transition: transform .15s; }
  .file-header.collapsed .file-chevron { transform: rotate(-90deg); }
  .file-name { color: var(--fg); font-weight: 500; }
  .file-path { color: var(--fg3); font-size: 11px; margin-top: 1px; }
  .file-count {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--fg2);
  }
  .file-findings { display: block; }
  .file-findings.hidden { display: none; }

  /* finding row */
  .finding {
    display: grid;
    grid-template-columns: 90px 200px 1fr auto;
    gap: 12px;
    align-items: start;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    font-size: 12px;
    transition: background .1s;
  }
  .finding:hover { background: var(--bg3); }
  .finding:last-child { border-bottom: 0; }

  .sev-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: var(--radius);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-family: var(--mono);
  }
  .sev-badge.critical { background: var(--bg-critical); color: var(--c-critical); border: 1px solid rgba(243,139,168,.3); }
  .sev-badge.high     { background: var(--bg-high);     color: var(--c-high);     border: 1px solid rgba(250,179,135,.3); }
  .sev-badge.medium   { background: var(--bg-medium);   color: var(--c-medium);   border: 1px solid rgba(249,226,175,.3); }
  .sev-badge.low,
  .sev-badge.info     { background: var(--bg-low);      color: var(--c-low);      border: 1px solid rgba(137,220,235,.3); }

  .finding-rule { color: var(--fg); font-family: var(--mono); font-size: 11px; word-break: break-all; }
  .finding-loc  { color: var(--fg3); font-family: var(--mono); font-size: 11px; margin-top: 2px; }
  .finding-snippet {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg2);
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    grid-column: 1 / -1;
    margin-top: 4px;
    display: none;
  }
  .finding:hover .finding-snippet { display: block; }
  .finding-nav {
    color: var(--fg3);
    font-size: 16px;
    opacity: 0;
    transition: opacity .1s;
    cursor: pointer;
  }
  .finding:hover .finding-nav { opacity: 1; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div>
    <div class="header-title"><span class="shield-icon">🛡</span> Gitleaks Scanner WASM</div>
    <div class="header-meta" id="meta-line">No scan has been run yet</div>
  </div>
  <div class="header-actions">
    <button id="btn-scan" onclick="postMsg('scan')">⟳ Scan Workspace</button>
    <button class="secondary" id="btn-copy" onclick="postMsg('copy')">⎘ Copy JSON</button>
    <button class="secondary" id="btn-clear" onclick="postMsg('clear')">✕ Clear</button>
  </div>
</div>

<!-- SUMMARY CARDS -->
<div class="summary" id="summary">
  <div class="summary-card card-critical" onclick="setFilter('critical')">
    <div class="count" id="cnt-critical">—</div>
    <div class="label">Critical</div>
  </div>
  <div class="summary-card card-high" onclick="setFilter('high')">
    <div class="count" id="cnt-high">—</div>
    <div class="label">High</div>
  </div>
  <div class="summary-card card-medium" onclick="setFilter('medium')">
    <div class="count" id="cnt-medium">—</div>
    <div class="label">Medium</div>
  </div>
  <div class="summary-card card-low" onclick="setFilter('low')">
    <div class="count" id="cnt-low">—</div>
    <div class="label">Low / Info</div>
  </div>
</div>

<!-- TOOLBAR -->
<div class="toolbar">
  <span class="filter-label">Filter</span>
  <div class="filter-group">
    <button class="filter-btn active" onclick="setFilter('all')">All</button>
    <button class="filter-btn" onclick="setFilter('critical')">Critical</button>
    <button class="filter-btn" onclick="setFilter('high')">High</button>
    <button class="filter-btn" onclick="setFilter('medium')">Medium</button>
    <button class="filter-btn" onclick="setFilter('low')">Low</button>
  </div>
  <div class="search-wrap">
    <input id="search" type="text" placeholder="Filter by rule or file…" oninput="onSearch(this.value)">
  </div>
</div>

<!-- PROGRESS -->
<div class="progress-wrap" id="progress">
  <div class="progress-msg" id="progress-msg">Scanning…</div>
  <div class="progress-bar-track"><div class="progress-bar-fill" id="progress-fill"></div></div>
</div>

<!-- CONTENT -->
<div class="content" id="content">
  <div class="state" id="state-initial">
    <div class="state-icon">🔍</div>
    <h2>Ready to scan</h2>
    <p>Run a workspace scan to detect hardcoded secrets, API keys, and credentials.</p>
    <button onclick="postMsg('scan')">⟳ Scan Workspace</button>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let _allFindings = [];
  let _filter = 'all';
  let _search = '';

  function postMsg(type, data) { vscode.postMessage({ type, ...data }); }

  // ── Message handler ──────────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'scanning') {
      setScanning(msg.value);
    } else if (msg.type === 'progress') {
      showProgress(msg.message, msg.progress, msg.total);
    } else if (msg.type === 'findings') {
      _allFindings = msg.findings ?? [];
      hideProgress();
      setScanning(false);
      updateSummary(_allFindings);
      renderFindings(_allFindings);
      updateMeta(msg.meta);
    } else if (msg.type === 'error') {
      setScanning(false);
      hideProgress();
      showError(msg.message);
    }
  });

  // ── Scanning state ───────────────────────────────────────────────────────
  function setScanning(yes) {
    document.getElementById('btn-scan').disabled = yes;
    document.getElementById('btn-scan').textContent = yes ? '⟳ Scanning…' : '⟳ Scan Workspace';
    if (yes) document.getElementById('state-initial') && (document.getElementById('state-initial').style.display = 'none');
  }
  function showProgress(msg, progress, total) {
    const wrap = document.getElementById('progress');
    wrap.classList.add('visible');
    document.getElementById('progress-msg').textContent = msg ?? 'Scanning…';
    if (total > 0) {
      document.getElementById('progress-fill').style.width = Math.round(progress/total*100) + '%';
    }
  }
  function hideProgress() { document.getElementById('progress').classList.remove('visible'); }

  // ── Summary cards ────────────────────────────────────────────────────────
  function updateSummary(findings) {
    const counts = { critical:0, high:0, medium:0, low:0 };
    for (const f of findings) {
      const k = ['critical','high','medium'].includes(f.severity) ? f.severity : 'low';
      counts[k]++;
    }
    document.getElementById('cnt-critical').textContent = counts.critical;
    document.getElementById('cnt-high').textContent     = counts.high;
    document.getElementById('cnt-medium').textContent   = counts.medium;
    document.getElementById('cnt-low').textContent      = counts.low;
  }

  function updateMeta(meta) {
    if (!meta) return;
    const parts = [];
    if (meta.filesScanned) parts.push(meta.filesScanned + ' files scanned');
    if (meta.durationMs)   parts.push(meta.durationMs + ' ms');
    parts.push('Last scan: ' + new Date().toLocaleTimeString());
    document.getElementById('meta-line').textContent = parts.join(' · ');
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  function setFilter(f) {
    _filter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.filter-btn').forEach(b => { if (b.textContent.toLowerCase().trim() === f || (f === 'all' && b.textContent.trim() === 'All')) b.classList.add('active'); });
    document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
    if (f !== 'all') {
      const card = document.querySelector('.card-' + (f === 'low' ? 'low' : f));
      if (card) card.classList.add('active');
    }
    renderFindings(_allFindings);
  }

  function onSearch(q) { _search = q.toLowerCase(); renderFindings(_allFindings); }

  // ── Render ────────────────────────────────────────────────────────────────
  const SEV_RANK = { critical:0, high:1, medium:2, low:3, info:4 };
  function visibleFindings(findings) {
    let f = findings;
    if (_filter !== 'all') {
      const rank = SEV_RANK[_filter] ?? 4;
      f = f.filter(x => (SEV_RANK[x.severity] ?? 4) <= rank);
    }
    if (_search) {
      f = f.filter(x => x.rule.toLowerCase().includes(_search) || x.path.toLowerCase().includes(_search) || (x.snippet??'').toLowerCase().includes(_search));
    }
    return f;
  }

  function renderFindings(findings) {
    const content = document.getElementById('content');
    const visible = visibleFindings(findings);

    if (findings.length === 0) {
      content.innerHTML = \`<div class="state">
        <div class="state-icon">✅</div>
        <h2>No secrets found</h2>
        <p>The scan completed with no findings. Your workspace looks clean.</p>
        <button onclick="postMsg('scan')">⟳ Scan Again</button>
      </div>\`;
      return;
    }

    if (visible.length === 0) {
      content.innerHTML = \`<div class="state">
        <div class="state-icon">🔍</div>
        <h2>No matches for current filter</h2>
        <p>Try changing the severity filter or search query.</p>
      </div>\`;
      return;
    }

    // Group by file
    const byFile = new Map();
    for (const f of visible) {
      const arr = byFile.get(f.path) ?? []; arr.push(f); byFile.set(f.path, arr);
    }

    let html = '';
    for (const [filePath, group] of byFile) {
      const fileName = filePath.split('/').pop();
      const fileDir  = filePath.split('/').slice(0,-1).join('/');
      html += \`<div class="file-group">
        <div class="file-header" onclick="toggleFile(this)">
          <span class="file-chevron">▼</span>
          <div>
            <div class="file-name">\${esc(fileName)}</div>
            <div class="file-path">\${esc(fileDir)}</div>
          </div>
          <span class="file-count">\${group.length}</span>
        </div>
        <div class="file-findings">\`;
      for (const f of group.sort((a,b) => a.line - b.line)) {
        html += \`<div class="finding" onclick="openFinding('\${esc(f.path)}',\${f.line})">
          <div><span class="sev-badge \${f.severity}">\${f.severity}</span></div>
          <div>
            <div class="finding-rule">\${esc(f.rule)}</div>
            <div class="finding-loc">line \${f.line}\${f.commit?' · '+f.commit.slice(0,8):''}</div>
          </div>
          <div class="finding-snippet">\${esc(f.snippet ?? '')}</div>
          <span class="finding-nav">→</span>
        </div>\`;
      }
      html += '</div></div>';
    }
    content.innerHTML = html;
  }

  function toggleFile(header) {
    header.classList.toggle('collapsed');
    header.nextElementSibling.classList.toggle('hidden');
  }

  function openFinding(p, line) { postMsg('open', { path: p, line }); }

  function showError(msg) {
    document.getElementById('content').innerHTML = \`<div class="state">
      <div class="state-icon">⚠️</div>
      <h2>Scan failed</h2>
      <p>\${esc(msg)}</p>
      <button onclick="postMsg('scan')">Retry</button>
    </div>\`;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
</body>
</html>`;
  }
}
GitleaksPanel.current = undefined;
exports.GitleaksPanel = GitleaksPanel;
