# Give any MCP coding agent the graph—in one command

```sh
npx -y graph2agent-mcp@0.2.0
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

Persistent client configurations should pin the version:

```sh
codex mcp add graph2agent -- npx -y graph2agent-mcp@0.2.0
```

First use needs npm access. For a durable local/offline installation afterward:

```sh
npm install --global graph2agent-mcp@0.2.0
codex mcp add graph2agent -- graph2agent-mcp
```

Supported platforms are macOS, Linux, and Windows on arm64 and x64. The server
supports graph2agent's deliberate flowchart, sequence, class, state, and ER
subset; unsupported semantics fail closed in strict mode.
