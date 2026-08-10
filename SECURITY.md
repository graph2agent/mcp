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

CI needs no private credential for the public core repository. It pins the
release tag and asserts its immutable commit before using it. Credential
persistence is explicitly disabled, and release verification checks that no
checkout credentials remain in local Git configuration.
