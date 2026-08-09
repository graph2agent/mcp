# graph2agent MCP

`graph2agent-mcp` is a small stdio Model Context Protocol server for the
deterministic [graph2agent](https://github.com/graph2agent/graph2agent) Mermaid
compiler. It gives agents one read-only tool that turns supported Mermaid into
auditable narrative text and structured compiler metadata.

The server performs no network requests, file writes, Mermaid execution, or HTML
rendering. Every call is parsed in strict mode with `core-contract-v2` and the
core compiler's production limits.

## Tool

### `describe_mermaid`

| Input | Required | Description |
| --- | --- | --- |
| `mermaid` | Yes | Mermaid source, limited to 4 MiB of UTF-8 bytes |
| `profile` | No | Narrative profile; defaults to `standard` |

Supported profiles are `compact`, `standard`, `exhaustive`, `readable-v1`,
`interpreted-v1`, `interpreted-v2`, and `interpreted-v3`.

Supported diagram families are flowchart, sequence, class, state, and ER. A
successful call returns the narrative as MCP text content and a structured
object containing:

- the same narrative text;
- diagram family and narrative profile;
- source and semantic SHA-256 hashes;
- graph2agent, compatibility-contract, and IR-schema versions;
- strict parse mode and deterministic diagnostics.

Invalid syntax, unsupported profiles, unknown families, and inputs beyond the
compiler limits are returned as MCP tool errors. The fixed limits are 4 MiB of
input, 100,000 Mermaid statements, and 100,000 semantic objects per call.

## Build

Requirements:

- Go 1.25 or newer (required by the MCP Go SDK v1.7.0);
- read access to the private `github.com/graph2agent/graph2agent` module.

```sh
make check
./bin/graph2agent-mcp
```

During local development beside a core checkout, use an ignored workspace
instead of changing `go.mod`:

```sh
go work init .
go work edit -replace=github.com/graph2agent/graph2agent@v0.1.0=../graph2agent
make check test-race
```

## Client configuration

Build or install the binary first, then use its absolute path.

### Codex

The [official Codex MCP documentation](https://developers.openai.com/codex/mcp/)
supports local stdio servers through the CLI or `~/.codex/config.toml` (a
project-scoped `.codex/config.toml` also works).

```sh
codex mcp add graph2agent -- /absolute/path/to/graph2agent-mcp
```

Equivalent TOML:

```toml
[mcp_servers.graph2agent]
command = "/absolute/path/to/graph2agent-mcp"
enabled_tools = ["describe_mermaid"]
```

### Clients using `mcpServers` JSON

Claude Desktop and other clients that accept the common `mcpServers` JSON shape
can use:

```json
{
  "mcpServers": {
    "graph2agent": {
      "command": "/absolute/path/to/graph2agent-mcp",
      "args": []
    }
  }
}
```

Restart or reload the client after changing its MCP configuration. Configuration
file locations and approval controls are client-specific.

## CI and releases

CI checks formatting, vetting, tests, race tests, and a production build. Because
the core repository is private, configure an Actions secret named
`GRAPH2AGENT_READ_TOKEN` with read-only contents access to
`graph2agent/graph2agent`. CI checks out the exact `v0.1.0` core tag and
wires it through an ephemeral Go workspace; the published module remains pinned
in `go.mod` without a `replace` directive.

GoReleaser builds static macOS, Linux, and Windows archives for amd64 and arm64,
injects the release version into MCP server metadata, and emits a checksum file.

## License

Copyright 2026 Graph2Agent. All rights reserved. See [LICENSE](LICENSE).
