# Contributing

This is a private, all-rights-reserved repository. Contributions are accepted
only from authorized Graph2Agent collaborators.

## Development

The module depends on the private `github.com/graph2agent/graph2agent` module at
the version declared in `go.mod`. During coordinated development, use an
untracked `go.work` file with a version-specific `go work edit -replace` to
select a local core checkout; do not commit a `replace` directive to `go.mod`.

Before opening a pull request, run:

```sh
make check test-race
```

Keep the MCP surface small and deterministic. New tools or fields require
protocol-level tests, documentation, and an explicit compatibility decision.
Never write logs to stdout because stdout is reserved for MCP messages.

By submitting a contribution, you confirm that you have the right to submit it
and grant Graph2Agent the right to use, modify, and distribute it as part of
this proprietary project.
