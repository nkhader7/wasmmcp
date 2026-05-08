# Publishing

This project is prepared for two-step public MCP publication:

1. Publish the npm package.
2. Publish `server.json` metadata to the MCP Registry.

The MCP Registry is a metadata registry. The executable server package still lives in npm.

## Package Identity

- npm package: `wasmmcp`
- MCP registry name: `io.github.nkhader7/wasmmcp`
- stdio command after npm install: `wasmmcp`

The `package.json` field `mcpName` must match `server.json.name` for npm ownership verification.

## Local Verification

```powershell
npm test
npm pack --dry-run
```

## Publish to npm

```powershell
npm login
npm publish --access public
```

The `prepublishOnly` script runs `node --test` before npm publishes.

## Publish to the MCP Registry

Install and authenticate the official publisher, then publish the metadata:

```powershell
mcp-publisher login github
mcp-publisher publish
```

The registry publish step reads [server.json](./server.json). The package must already be available from the public npm registry for ownership verification to pass.
