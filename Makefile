GO ?= go
BINARY ?= bin/graph2agent-mcp

.PHONY: build check fmt fmt-check test test-race vet

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

check: fmt-check vet test build
