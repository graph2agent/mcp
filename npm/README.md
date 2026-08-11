<p align="center">
  <img src="https://raw.githubusercontent.com/graph2agent/graph2agent/main/.github/assets/favicon.svg" alt="graph2agent app icon" width="128" height="128">
</p>

# Give any MCP coding agent the graph—in one command

```sh
npx -y graph2agent-mcp@0.4.0
```

`graph2agent-mcp` turns supported Mermaid into deterministic, explicit context
through the read-only `describe_mermaid` MCP tool. The npm launcher contains no
install scripts and makes no runtime download: npm installs the matching static
Go binary as an optional platform package, and the launcher verifies its
version and SHA-256 before every start.

> **Measured: 50.41% fewer exact-comprehension failures.** On one frozen,
> paired benchmark of 330 private contracts, Mermaid plus graph2agent's
> `standard` digest scored 270/330 exact versus 209/330 with Mermaid alone
> (+18.48 percentage points; 61 digest-only wins and 0 Mermaid-only wins).
> [Evidence and limitations](https://graph2agent.github.io/#evidence)

The benchmark tested the frozen `standard` digest in one requested Codex
configuration; it does not establish the same effect for every model, task,
profile, or Mermaid construct.

> **Live on npm for macOS and Linux.** With Node.js 22 or newer, this package
> installs the matching arm64 or x64 binary. Windows binaries are live in the
> [v0.4.0 GitHub Release](https://github.com/graph2agent/mcp/releases/tag/v0.4.0);
> one-command npm activation on Windows is pending npm review.

Persistent client configurations should pin the version:

```sh
codex mcp add graph2agent -- npx -y graph2agent-mcp@0.4.0
```

On macOS and Linux, first use needs npm access. For a durable local/offline
installation afterward:

```sh
npm install --global graph2agent-mcp@0.4.0
codex mcp add graph2agent -- graph2agent-mcp
```

Native binaries support macOS, Linux, and Windows on arm64 and x64. Until the
Windows npm packages are activated, install Windows directly from the GitHub
Release linked above. The server supports graph2agent's deliberate flowchart,
sequence, class, state, and ER subset; unsupported semantics fail closed in
strict mode.

Licensed under the [Apache License 2.0](LICENSE).
