# Give any MCP coding agent the graph—in one command

```sh
npx -y graph2agent-mcp@0.2.0
```

`graph2agent-mcp` is a stdio Model Context Protocol server for the deterministic
[graph2agent](https://github.com/graph2agent/graph2agent) Mermaid compiler. It
gives coding agents one read-only tool that turns supported Mermaid into
auditable narrative text and structured compiler metadata.

> **Measured: 50.41% fewer exact-comprehension failures.** On one frozen,
> paired benchmark of 330 private contracts, Mermaid plus graph2agent's
> `standard` digest scored 270/330 exact versus 209/330 with Mermaid alone
> (+18.48 percentage points; 61 digest-only wins and 0 Mermaid-only wins).
> [Evidence and limitations](https://graph2agent.github.io/#evidence)

The benchmark tested the frozen `standard` digest in one requested Codex
configuration. It does not establish the same effect for every model, task,
profile, or Mermaid construct.

> The npm packages are fully assembled and smoke-tested but not public yet.
> Activation requires the public license decision and npm trusted-publisher
> setup; the command above is the pinned post-launch configuration.

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

## Plug it into an MCP client

Pin the version in persistent configuration:

### Codex

```sh
codex mcp add graph2agent -- npx -y graph2agent-mcp@0.2.0
```

### Claude Code

```sh
claude mcp add --scope user --transport stdio graph2agent -- npx -y graph2agent-mcp@0.2.0
```

On native Windows, put `cmd /c` before `npx`. First use needs npm access. For a
durable local installation that works offline afterward:

```sh
npm install --global graph2agent-mcp@0.2.0
codex mcp add graph2agent -- graph2agent-mcp
```

The npm package uses no lifecycle scripts and performs no runtime download.
It installs one static, platform-restricted Go binary and verifies its version
and SHA-256 before every start.

## Build from source

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

## Direct-binary client configuration

Build or install the binary first, then use its absolute path.

### Codex without npm

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

### Clients using `mcpServers` JSON without npm

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
the core repository is private, give this repository a unique, read-only SSH
deploy key. Add its public key to `graph2agent/graph2agent` with write access
disabled, and store only the matching private key here as the Actions secret
`GRAPH2AGENT_DEPLOY_KEY`. Do not reuse the key in another consumer repository.
CI checks out the exact `v0.1.0` core tag and wires it through an ephemeral,
ignored Go workspace replacement; the published module remains pinned in
`go.mod` without a `replace` directive. Pull requests run only secret-free
source hygiene, while trusted main-branch and manual verification fail closed
when the private checkout cannot be verified.

GoReleaser builds static macOS, Linux, and Windows archives for amd64 and arm64,
injects the release version into MCP server metadata, and emits a checksum file.
The npm assembler places those same binaries into six exact-version platform
packages, generates a checksum contract, audits file allowlists, packs all seven
packages, installs the local Linux package with lifecycle scripts disabled, and
performs a real MCP initialize/tools/list/describe_mermaid smoke test.

## License

Copyright 2026 Graph2Agent. All rights reserved. See [LICENSE](LICENSE).
