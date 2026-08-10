# Contributing

Contributions are welcome under the terms of the Apache License 2.0.

## Development

The module depends on `github.com/graph2agent/graph2agent` at the version
declared in `go.mod`. For local development, use an untracked `go.work` file
with a version-specific `go work edit -replace` to select a local core checkout;
do not commit a `replace` directive to `go.mod`.

Before opening a pull request, run:

```sh
make check test-race
```

Keep the MCP surface small and deterministic. New tools or fields require
protocol-level tests, documentation, and an explicit compatibility decision.
Never write logs to stdout because stdout is reserved for MCP messages.

By submitting a contribution, you confirm that you have the right to submit it
under the repository's [Apache License 2.0](LICENSE).
