# Security Policy

## Supported versions

Security fixes are made on the latest release line and `main`.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| `main` | Yes |
| Older releases | No |

## Reporting a vulnerability

Do not open a public issue. Use the repository's private vulnerability
reporting flow at
[GitHub Security Advisories](https://github.com/graph2agent/mcp/security/advisories/new)
and include reproduction steps, impact, and affected versions. Maintainers will
acknowledge a complete report within five business days.

## Trust boundary

Mermaid input is treated as untrusted data. The server does not execute Mermaid,
render HTML, access the network, or write files. It compiles input with strict
parsing, fixed semantic compatibility, and bounded input, statement, and object
counts. MCP clients should still apply their own process isolation and release
verification policies.

CI access to the private core uses a repository-specific SSH deploy key with
write access disabled. Store its private half only as this repository's
`GRAPH2AGENT_DEPLOY_KEY` Actions secret, never reuse it across repositories,
and rotate it independently if exposed. Pull-request jobs must remain
secret-free, and the private verification job must fail closed when checkout of
the pinned core tag fails.
