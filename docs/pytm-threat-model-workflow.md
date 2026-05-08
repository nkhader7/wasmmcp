# pytm Threat Model Workflow

This workflow adapts the agentic style from `dralgorhythm/claude-agentic-framework` to this MCP architecture:

1. Gather local code context with the `pytm_threat_model` MCP skill.
2. Use the returned local context to infer actors, trust boundaries, components, data stores, assets, and dataflows.
3. Have the IDE agent synthesize or update `artifacts/threat-model/tm.py`.
4. If `pytm`, Graphviz, PlantUML, and report tools exist locally, run them outside the MCP server to generate artifacts.

The MCP server remains a dispatcher. It does not receive workspace code, run AI, execute Python, or run `pytm`.

## Expected Agent Output

Create or update:

```text
artifacts/threat-model/
  tm.py
  README.md
  report.md        # optional generated or summarized report
  dfd.dot          # optional pytm --dfd output
  seq.puml         # optional pytm --seq output
  threats.json     # optional pytm --json output
```

## `tm.py` Shape

Use OWASP pytm's Python model style:

```python
#!/usr/bin/env python3

from pytm.pytm import TM, Actor, Server, Process, Datastore, Dataflow, Boundary, Data, Classification

tm = TM("Workspace Threat Model")
tm.description = "Generated from local workspace architecture context."
tm.isOrdered = True

internet = Boundary("Internet")
app_boundary = Boundary("Application")
data_boundary = Boundary("Data")

user = Actor("User")
user.inBoundary = internet

app = Server("Application")
app.inBoundary = app_boundary
app.sourceCode = "src/"
app.implementsAuthenticationScheme = True

database = Datastore("Primary Datastore")
database.inBoundary = data_boundary
database.isSQL = True

request_data = Data("Request data", classification=Classification.RESTRICTED)

user_to_app = Dataflow(user, app, "User request")
user_to_app.protocol = "HTTPS"
user_to_app.dstPort = 443
user_to_app.data = request_data

app_to_db = Dataflow(app, database, "Read/write application data")
app_to_db.protocol = "SQL"

tm.process()
```

## Generation Commands

When the tools are installed locally:

```powershell
python artifacts/threat-model/tm.py --json artifacts/threat-model/threats.json
python artifacts/threat-model/tm.py --dfd > artifacts/threat-model/dfd.dot
python artifacts/threat-model/tm.py --seq > artifacts/threat-model/seq.puml
python artifacts/threat-model/tm.py --report docs/basic_template.md > artifacts/threat-model/report.md
```

`pytm` can also generate DFD and sequence diagram streams that may be passed to Graphviz or PlantUML. The toolchain is intentionally local and optional.

## Customization Guidance

Customize the generated `tm.py` when the workspace shows:

- multiple user roles or service accounts
- admin-only flows
- background workers or scheduled jobs
- queues, caches, object storage, or third-party APIs
- secrets, tokens, PII, or payment data
- network boundaries such as browser, edge, API, worker, and database tiers
- authentication, authorization, or session handling code

Every inferred element should cite local evidence in `artifacts/threat-model/README.md`, such as file paths, route handlers, configuration files, or data-access modules.
