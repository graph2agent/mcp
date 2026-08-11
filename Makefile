GO ?= go
BINARY ?= bin/graph2agent-mcp

.PHONY: build check fmt fmt-check test test-race vet npm-test npm-assemble npm-pack npm-pack-release npm-verify

build:
	$(GO) build -trimpath -o $(BINARY) ./cmd/graph2agent-mcp

test:
	$(GO) test ./...

test-race:
	$(GO) test -race ./...

vet:
	$(GO) vet ./...

fmt:
	find . -type f -name '*.go' -not -path './.deps/*' -not -path './vendor/*' -exec gofmt -w {} +

fmt-check:
	@unformatted="$$(find . -type f -name '*.go' -not -path './.deps/*' -not -path './vendor/*' -exec gofmt -l {} +)"; \
	if [ -n "$$unformatted" ]; then \
		echo "Go files need formatting:" >&2; \
		echo "$$unformatted" >&2; \
		exit 1; \
	fi

npm-test:
	node --test npm/test/*.test.cjs npm/test/*.test.mjs

npm-assemble:
	node npm/scripts/assemble.mjs dist

npm-pack: npm-assemble
	node npm/scripts/verify-packages.mjs dist/npm
	node npm/scripts/pack.mjs dist/npm dist/npm-packages

npm-pack-release:
	node npm/scripts/assemble.mjs dist release
	node npm/scripts/verify-packages.mjs dist/npm
	node npm/scripts/pack.mjs dist/npm dist/npm-packages

npm-verify:
	node npm/scripts/verify-packages.mjs dist/npm

check: fmt-check vet test build npm-test
